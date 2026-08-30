"""Экспорт ТТХ xUSSR Railway Set в web/src/data/xussr_trains.json.

Читает NML-исходники набора (vendor/xussrset, пин XUSSR_REF в Makefile) через
препроцессор C и парсер пакета nml — см. pipeline/xussr_nml.py. Числа приводятся к
тому, что игрок видит в меню покупки: расход — ветка «только построен» формулы
набора, скорость — внутренние единицы из каллбеков, мощность — по родам тока из
веток is_ER*_ds. Параметры GRF — значения по умолчанию самого набора, они же
пишутся в meta. Каждый Item каждого GRF обязан либо попасть в данные, либо быть
пропущен по названной причине — молчаливых потерь валидатор не допускает.
"""
import os
import re
import tempfile

from common import VENDOR, display_mph, vendor_meta, write_json
import xussr_nml as nml

# порядок как в compile-all.bat набора; rails первым — его таблица нужна машинам
GRFS = ["rails", "steam", "diesel", "electric", "dmu", "emu", "wagons", "cars", "addon"]

# Род тока семейства путей по букве после «ER» (комментарии railtrack.pnml:
# «2D = D + d», «2S = A + D» и далее). Порядок внутри списка — порядок веток
# is_ER*_ds набора (code-templates-prop.pnml): AC25 проверяется первым, DC1_5
# последним, поэтому двухсистемник на многосистемной линии берёт ту же мощность,
# что в игре.
POWER_SOURCES = {
    "A": ["AC25"], "a": ["AC15"], "D": ["DC3"], "d": ["DC1_5"],
    "2S": ["AC25", "DC3"], "2D": ["DC3", "DC1_5"], "2s": ["AC25", "DC1_5"],
    "3D": ["AC25", "DC3", "DC1_5"], "3a": ["AC25", "AC15", "DC1_5"],
    "4S": ["AC25", "AC15", "DC3", "DC1_5"],
}

# Какие T_* семейства запитаны каждым родом тока — ответы tile_powers_railtype
# для веток is_ER*_ds (railtypetable.pnml набора)
SOURCE_FAMILIES = {
    "AC25": ("T_A0", "T_A1", "T_A2"),
    "AC15": ("T_a0", "T_a1", "T_a2"),
    "DC3": ("T_D0", "T_D1", "T_D2"),
    "DC1_5": ("T_d0", "T_d1", "T_d2"),
}

# Игровые переменные только что построенной машины — состояние, чьи числа
# показывает меню покупки (базовый вариант, не в депо, головная секция).
JUST_BUILT = {
    "age_in_days": 0,
    "position_in_articulated_veh": 0,
    "position_in_consist": 0,
    "cargo_subtype": 0,
    "vehicle_is_in_depot": 0,
    "bitmask_consist_info": 0,
    "vehicle_is_not_powered": 0,
    "extra_callback_info1": 0,
    # контейнерные платформы выбирают вариант загрузки случайно (20-футовые или
    # 40-футовый); данные снимаются с первого варианта
    "random_bits": 0,
}

# Реконструкция потерянных макросов: TGV/ICE в addon зовут
# get_<роды>_track_type_emu_highspeed(), которых финальная ревизия набора не
# определяет нигде (в railtypetable.pnml есть лишь acdc и ddc). По симметрии
# определённых соседей род тока в имени однозначно называет многосистемный
# лейбл rails; сами лейблы набор держит скрытыми, как Iron Horse свой LGVN.
LOST_TRACK_MACROS = {
    "get_aacddc_track_type_emu_highspeed": "ER4S",
    "get_aac15dc_track_type_emu_highspeed": "ER3a",
    "get_acddc_track_type_emu_highspeed": "ER3D",
    "get_ac15dc_track_type_emu_highspeed": "ER2s",
}

VEHICLE_NEVER_EXPIRES = 0xFF
CLIMATES_NONE = 0

# The flag that makes the game age a vehicle by its variant group's head rather than
# by its own intro date (ExtraEngineFlag::SyncReliability, engine.cpp CalcEngineReliability).
# The set declares groups both with it (`vehicle_group`) and without (`vehicle_group_pre`),
# and only the former ages as a series.
SYNC_RELIABILITY_FLAG = "VEHICLE_FLAG_SYNC_VARIANT_RELIABILITY"


def intro_parts(packed):
    """Year and month of the set's packed introduction date (`yyyymmdd`)."""
    if not packed:
        return None, None
    return packed // 10000, (packed // 100) % 100 or 1


def display_kmh(internal):
    """Скорость в км/ч, как её показывает игра (strings.cpp, усечение)."""
    return int(internal * 10 * 1.609344) // 16


def kmh_internal(kmh):
    """Внутренняя скорость для заявленных км/ч: ближайшая, которую игра
    показывает ровно этим числом (тот же подбор, что adjust_value NML)."""
    value = int(kmh + 0.5)  # internal ~ km/h: 1 internal = 1.00584 км/ч
    while value and display_kmh(value) > kmh:
        value -= 1
    lower = value
    while display_kmh(value) < kmh:
        value += 1
    higher = value
    if abs(display_kmh(lower) - kmh) < abs(display_kmh(higher) - kmh):
        return lower
    return higher


def grfid_hex(literal):
    """GRFID из NML-литерала («Meo\\B1») в hex, как его пишет сейв."""
    out = []
    i = 0
    while i < len(literal):
        if literal[i] == "\\":
            out.append(int(literal[i + 1:i + 3], 16))
            i += 3
        else:
            out.append(ord(literal[i]))
            i += 1
    return bytes(out).hex()


class Grf:
    """Один разобранный GRF набора: свёрнутые statements и индексы по ним."""

    def __init__(self, name, statements, grfids):
        self.name = name
        block = next(s for s in statements if type(s).__name__ == "GRF")
        self.grfid = grfid_hex(block.grfid.value)
        self.parameters = nml.grf_parameters(block)
        self.cargo_table = [
            c.value for s in statements if type(s).__name__ == "CargoTable"
            for c in s.cargo_list
        ]
        self.scope = nml.base_scope()
        self.scope.update(self.parameters)
        # метка груза — это его индекс в таблице GRF: switch'и сравнивают
        # cargo_type_in_veh с метками, а игра — индексы с индексами
        self.scope.update({label: i for i, label in enumerate(self.cargo_table)})
        self.scope["functions"] = nml.game_functions(grfids, set(self.cargo_table))
        self.flat = nml.flatten(statements, self.scope)
        self.switches = {str(s.name): s for s in self.flat if type(s).__name__ == "Switch"}
        self.emulator = nml.Emulator(self.switches, self.scope)
        # объявления item в порядке следования: набор объявляет машину, затем
        # отдельными item правит её свойства (длинное имя, отключение климатов)
        self.item_declarations = {}
        for s in self.flat:
            if type(s).__name__ == "Item":
                self.item_declarations.setdefault(str(s.name), []).append(s)
        # имя item — это и его числовой id: формулы сравнивают vehicle_type_id
        # с именами (`vehicle_type_id == emu_sv_h`)
        for name, declarations in self.item_declarations.items():
            for item in declarations:
                if item.id is not None:
                    self.scope.setdefault(name, nml.const(item.id, self.scope))
                    break
        # T_* -> лейблы-альтернативы (railtypetable этого GRF)
        self.track_aliases = {}
        for s in self.flat:
            if type(s).__name__ == "RailtypeTable":
                for a in s.tracktype_list:
                    self.track_aliases[str(a.name)] = [str(v) for v in a.value]

    def merged_items(self):
        """Свойства и графика каждого item: позднее объявление поверх раннего, как
        применяет их игра — имя в том числе. Набор объявляет машину под коротким
        именем, а следом, если включён `enable_long_names` (его дефолт — 1, и в
        партиях он тоже включён), переобъявляет её длинным: «VL80ᵀ-702 "Vylo"
        (Electric)». Игрок видит в меню покупки именно длинное, и каталог обязан
        совпадать с ним, иначе машину в игре не найти по тому, что он показывает."""
        merged = {}
        for name, declarations in self.item_declarations.items():
            props, graphics = {}, {}
            item_id = None
            for item in declarations:
                if item_id is None and item.id is not None:
                    item_id = nml.const(item.id, self.scope)
                for block in item.statements:
                    kind = type(block).__name__
                    if kind == "PropertyBlock":
                        for prop in block.prop_list:
                            props[str(prop.name)] = prop
                    elif kind == "GraphicsBlock":
                        for entry in block.graphics_list:
                            graphics[str(entry.cargo_id)] = entry.result
            merged[name] = {"id": item_id, "props": props, "graphics": graphics}
        return merged

    def callback(self, result, variables):
        """Значение записи graphics-блока: цепочка switch'ей или прямое выражение.

        Возвращает число, а если выражение не сворачивается — Partial с ним:
        распознавание форм (mass_pair) — дело вызывающего.
        """
        value = result.value
        if value is not None and type(value).__name__ == "Identifier" and value.value in self.switches:
            return self.emulator.run(value.value, variables)
        scope = dict(self.scope)
        scope.update(variables)
        try:
            return nml.evaluate(value, scope)
        except nml.Unknown:
            return nml.Partial(value, scope)


def read_grfs():
    grfs = {}
    with tempfile.TemporaryDirectory() as tmp:
        parsed = {}
        for name in GRFS:
            path = nml.preprocess(f"xussr-{name}.pnml", os.path.join(tmp, f"{name}.nml"))
            parsed[name] = nml.parse(path, name)
    grfids = {
        next(s for s in st if type(s).__name__ == "GRF").grfid.value
        for st in parsed.values()
    }
    for name, statements in parsed.items():
        grfs[name] = Grf(name, statements, grfids)
    return grfs


# --- языковые строки --------------------------------------------------------------

def lang_strings(filename):
    """`STR_X :значение` из lang-файла набора (формат .lng OpenTTD NewGRF)."""
    strings = {}
    path = os.path.join(nml.XUSSR_ROOT, "lang", filename)
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith(("#", "﻿#")) or ":" not in line:
                continue
            key, _, value = line.partition(":")
            key = key.strip().lstrip("﻿")
            if key.startswith("STR_"):
                strings[key] = value.rstrip("\n")
    return strings


# --- таблица путей ----------------------------------------------------------------

def family_sources(label):
    """Рода тока пути по лейблу (буквы после «ER», см. POWER_SOURCES)."""
    if label == "ELRL":
        # скрытый ванильный лейбл: набор питает им всех своих электровозов
        # (powered-маска all_EL), то есть он несёт все четыре рода тока
        return ["AC25", "AC15", "DC3", "DC1_5"]
    if not label.startswith("ER"):
        return []
    suffix = label[2:]
    if suffix in POWER_SOURCES:
        return POWER_SOURCES[suffix]
    return POWER_SOURCES.get(suffix[0], [])


def string_id_of(prop):
    """string(STR_X) -> STR_X."""
    return str(prop.value.name)


def render_string(prop, english, scope, fallback):
    """Строка так, как её показывает игра: параметры string(STR_X, 12, 132)
    подставлены в {UNSIGNED_WORD}, управляющие коды цвета убраны."""
    node = prop.value
    text = english.get(str(node.name))
    if text is None:
        return fallback
    for param in node.params:
        text = text.replace("{UNSIGNED_WORD}", str(nml.const(param, scope)), 1)
    return re.sub(r"\{[A-Z_]+\}", "", text)


def railtypes_payload(rails, english):
    """Таблица путей из xussr-rails: лейбл, лимит, маски, флаги, рода тока.

    Маски нормализуются как у остальных наборов: тип состоит в отношении сам с
    собой, ссылки за пределы набора отбрасываются (списки набора держат лейблы
    узкоколеек 1520mm Paradise), powered влечёт compatible — это правило игры.
    """
    entries = []
    for name, item in rails.merged_items().items():
        props = item["props"]
        if "label" not in props:
            continue
        label = props["label"].value.value
        flags = nml.const(props["railtype_flags"].value, rails.scope) if "railtype_flags" in props else 0
        speed_prop = props.get("speed_limit")
        kmh = nml.const(speed_prop.value, rails.scope) if speed_prop else 0
        string_id = string_id_of(props["name"])
        entries.append({
            "label": label,
            "string_id": string_id,
            "name": english.get(string_id, label),
            "catenary": bool(flags & 1),  # RAILTYPE_FLAG_CATENARY
            "hidden": bool(flags & 4),    # RAILTYPE_FLAG_HIDDEN
            "speed_limit_internal": kmh_internal(kmh) if kmh else 0,
            "powered": [v.value for v in props["powered_railtype_list"].value.values],
            "compatible": [v.value for v in props["compatible_railtype_list"].value.values],
            "power_source": family_sources(label),
            "lgv": False,
            "sort": nml.const(props["sort_order"].value, rails.scope),
        })

    known = {rt["label"] for rt in entries}
    for rt in entries:
        for mask in ("powered", "compatible"):
            others = [label for label in rt[mask] if label in known and label != rt["label"]]
            rt[mask] = [rt["label"], *others]
        rt["compatible"] += [l for l in rt["powered"] if l not in rt["compatible"]]

    entries.sort(key=lambda rt: rt["sort"])
    return entries


# --- машины -----------------------------------------------------------------------

def off_the_track(grf, variables):
    """Те же переменные, но путь под колёсами ничем не питает.

    Контекст меню покупки: машины нигде нет, и `tile_powers_railtype` отвечает нулём —
    как в игре, где у списка покупки нет тайла под колёсами.
    """
    v = dict(variables)
    v["functions"] = dict(
        v.get("functions", grf.scope["functions"]), tile_powers_railtype=lambda t: 0
    )
    return v


def by_source(grf, graphics, key, variables):
    """Значение каллбека `key` на каждом роде тока — ветки is_ER*_ds набора.

    Прогоняет цепочку при каждом роде тока и без тока вовсе; ключ SELF — значение
    на пути, который ничем не питает (у мощности это вспомогательный дизель 2ЭВ120
    или заглушка в 5 л.с. у чистых электровозов — так их моделирует сам набор).
    Одинаковые значения повсюду — признак машины без веток: её описывает свойство.
    """
    if key not in graphics:
        return None
    values = {}
    for source, families in SOURCE_FAMILIES.items():
        on = set(families)
        v = dict(variables)
        v["functions"] = dict(
            variables.get("functions", grf.scope["functions"]),
            tile_powers_railtype=lambda t, _on=on: int(t in _on),
        )
        values[source] = int(grf.callback(graphics[key], v))
    values["SELF"] = int(grf.callback(graphics[key], off_the_track(grf, variables)))
    if len(set(values.values())) == 1:
        return None
    return values


def power_by_source(grf, graphics, variables):
    """Мощность на каждом роде тока (см. by_source)."""
    return by_source(grf, graphics, "power", variables)


def speed_by_source(grf, graphics, variables):
    """Предел скорости на каждом роде тока.

    Набор ветвит не только мощность: у TGV Atlantique `engine_speed(tgv_a_DC, 250)`
    против `engine_speed(tgv_a_AC, 300)`, и на линии постоянного тока игра держит
    машину на 250 км/ч. Значения уже во внутренних единицах, как и `speed_internal`.

    Часть машин отдаёт под грузом другую скорость (`loaded_speed` набора), поэтому
    здесь машина пуста — то же состояние, что показывает меню покупки. Переменная
    задаётся только для этого каллбека: у остальных её нет, и общий контекст сдвинул
    бы уже сверенные с игрой числа.
    """
    return by_source(grf, graphics, "speed", dict(variables, cargo_count=0))


def capacity_by_cargo(grf, graphics, refit_labels, variables):
    """Вместимость на каждый груз из каллбека cargo_capacity одной секции.

    Значение — либо готовое число мест (не зависит от веса единицы груза), либо
    пара [X, Y] массовой формулы набора `min(X/uw, Y/uw/125)`: uw принадлежит
    активному набору грузов, поэтому деление выполняет калькулятор, повторяя
    целочисленную арифметику набора. Груз со вместимостью 0 не пишется — набор
    считает, что вагон его не везёт.
    """
    if "cargo_capacity" not in graphics:
        return None
    capacities = {}
    for label in refit_labels:
        index = grf.cargo_table.index(label)
        result = grf.callback(graphics["cargo_capacity"], dict(variables, cargo_type_in_veh=index))
        if isinstance(result, nml.Partial):
            pair = nml.mass_pair(result)
            if pair is None:
                raise SystemExit(
                    f"extract_xussr: {grf.name}: capacity of {label} does not fold and "
                    f"is not the set's mass formula: {result.expr}"
                )
            capacities[label] = list(pair)
        elif int(result) > 0:
            capacities[label] = int(result)
    return capacities


def consist_capacity_by_cargo(grf, merged, graphics, part_names, labels, just_built):
    """Вместимость по грузу для всей машины: сумма секций, как в меню покупки.

    Секция сочленённой машины несёт свою вместимость, и игра показывает — и везёт —
    их сумму: у TGV Atlantique голова даёт 369 мест, прицепная 116, в меню 485.
    Считать по одной голове значит разойтись с игрой на треть состава, поэтому
    таблица по грузам складывается так же, как складывается `capacities`.

    **Груз секции — её собственный.** У почтового TGV голова возит пассажиров, а
    прицепная — почту и товары, и списка рефита головы для неё мало: спросив секцию
    про PASS, получаешь ноль и «машина не везёт ничего». Поэтому у каждой секции
    берётся её же `cargo_allow_refit`, а где его нет — головной.

    **Секции хранятся порознь, а не сложенными.** Массовая формула набора делит на
    вес единицы груза с округлением вниз, и делает это в каждой секции своей: у
    почтового TGV восемь почтовых секций, и `floor` восьми частных — не то же, что
    `floor` одной суммы. Поэтому значение груза — список по секциям, а складывает их
    расчёт, повторяя арифметику игры (`trainCapacity` в dataset.ts).
    """
    total = {}
    head = capacity_by_cargo(grf, graphics, labels, just_built)
    for label, value in (head or {}).items():
        total.setdefault(label, []).append(value)
    for part_name in part_names:
        part = merged[part_name]
        v = dict(just_built)
        if part["id"] is not None:
            v["vehicle_type_id"] = part["id"]
        part_labels = refit_labels(grf, part["props"]) or labels
        try:
            part_map = capacity_by_cargo(grf, part["graphics"], part_labels, v)
        except nml.Unknown:
            continue
        for label, value in (part_map or {}).items():
            total.setdefault(label, []).append(value)
    return total or None


def part_purchase(grf, part, key, variables):
    """Каллбек секции в контексте меню покупки; None, если его нет или он не сворачивается."""
    graphics = part["graphics"]
    if key not in graphics:
        return None
    v = off_the_track(grf, variables)
    if part["id"] is not None:
        v["vehicle_type_id"] = part["id"]
    try:
        value = grf.callback(graphics[key], v)
    except nml.Unknown:
        return None
    return None if isinstance(value, nml.Partial) else value


def articulated_units(grf, merged, graphics):
    """Имена секций сочленённой машины в порядке callback'а articulated_part."""
    if "articulated_part" not in graphics:
        return []
    value = graphics["articulated_part"].value
    if type(value).__name__ != "Identifier" or value.value not in grf.switches:
        return []
    switch = grf.switches[value.value]
    parts = []
    for case in switch.body.ranges:
        target = case.result.value
        if type(target).__name__ == "Identifier" and target.value in merged:
            parts.append(target.value)
    return parts


def variant_groups(grfs, merged_by_grf, items):
    """The heads of the groups the extracted vehicles belong to.

    A head the player cannot buy is a menu-only placeholder: the game marks such a vehicle
    introduced on the first day of the game (StartupOneEngine, climate branch) and ages it
    from there, which is what drags a whole series out of the buy menu at once.
    """
    heads = {}
    for train in items:
        key = train["variant_group"]
        if not key or key in heads:
            continue
        grf_name, head_name = key.split(":", 1)
        props = merged_by_grf[grf_name][head_name]["props"]
        scope = grfs[grf_name].scope
        intro = nml.const(props["introduction_date"].value, scope) \
            if "introduction_date" in props else None
        climates = nml.const(props["climates_available"].value, scope) \
            if "climates_available" in props else None
        intro_year, intro_month = intro_parts(intro)
        heads[key] = {
            "item": head_name,
            "intro_year": intro_year,
            "intro_month": intro_month,
            "buyable": climates != CLIMATES_NONE,
        }
    return dict(sorted(heads.items()))


def group_key(grf_name, item_name):
    """Group id unique across the set's GRFs; item names are only unique within one."""
    return f"{grf_name}:{item_name}" if item_name else None


def series_head(grf, name, item, merged):
    """The vehicle whose age the game uses for this one, at the root of the variant chain.

    The game walks up while the vehicle it stands on asks for reliability syncing
    (engine.cpp CalcEngineReliability), and the chain runs through ordinary vehicles, not
    only through the group items: EM of 1933 is a variant of EM of 1931, which is itself a
    variant of the steam E series. Stopping at the first link would age the series from
    1930 instead of from the game's start.
    """
    seen, current, head = {name}, item, None
    while syncs_reliability(current["props"]):
        parent = variant_group(grf, current["props"], merged)
        if parent is None or parent in seen:
            break
        seen.add(parent)
        head, current = parent, merged[parent]
    return head


def variant_group(grf, props, merged):
    """Item name of the variant group this vehicle belongs to, or None.

    The set writes the property as `disable_groups == 0 ? group : INVALID_ENGINE`, so the
    parameter decides; at its default (0) the group stands. `INVALID_ENGINE` is not an item,
    which is what tells the two branches apart.
    """
    prop = props.get("variant_group")
    if prop is None:
        return None
    value = prop.value
    if type(value).__name__ == "TernaryOp":
        try:
            value = value.expr1 if nml.const(value.guard, grf.scope) else value.expr2
        except nml.Unknown:
            return None
    if type(value).__name__ != "Identifier":
        return None
    return value.value if value.value in merged else None


def syncs_reliability(props):
    """Does the vehicle ask the game to age it by its group's head?"""
    prop = props.get("extra_flags")
    if prop is None:
        return False
    value = prop.value
    # `bitmask(FLAG, …)` parses as a call, `[FLAG, …]` as a bitmask node — the set writes both
    flags = getattr(value, "params", None) or getattr(value, "values", None) or []
    return any(type(f).__name__ == "Identifier" and f.value == SYNC_RELIABILITY_FLAG for f in flags)


def refit_labels(grf, props):
    prop = props.get("cargo_allow_refit")
    if prop is None:
        return []
    return [str(v) for v in prop.value.values]


def buy_menu_capacity(purchase, prop_const, has_cargo_table):
    """Число мест, которое меню покупки пишет о самой машине.

    Свой purchase-каллбек, иначе обычный каллбек в том же контексте, и только потом
    свойство. Свойство здесь — не ответ: набор ставит машинам `cargo_capacity: 1`, чтобы
    игра сочла их способными что-то везти, а показывает 0. У машины, чья вместимость
    зависит от груза, числа меню нет вовсе — расчёт читает `capacity_by_cargo`.
    """
    capacity = purchase("purchase_cargo_capacity")
    if capacity is None or isinstance(capacity, nml.Partial):
        try:
            capacity = purchase("cargo_capacity")
        except nml.Unknown:
            # каллбек спрашивает про везомый груз — вместимость у машины по грузу
            capacity = None
    if capacity is None or isinstance(capacity, nml.Partial):
        capacity = 0 if has_cargo_table else prop_const("cargo_capacity", 0)
    return int(capacity)


def consist_units(grf, merged, part_names, scope, head, just_built):
    """Секции машины: голова и прицепные, каждая со своими местами, длиной и массой.

    Меню покупки показывает суммы, и набор объявляет посекционно только места: массу он
    пишет в `purchase_weight` уже полную (у TGV Atlantique все 444 т стоят при голове).
    Поэтому здесь складывается лишь то, что в данных лежит по частям.
    """
    units = [head]
    for part_name in part_names:
        part = merged[part_name]
        part_props = part["props"]
        part_capacity = part_purchase(grf, part, "purchase_cargo_capacity", just_built)
        if part_capacity is None:
            part_capacity = part_purchase(grf, part, "cargo_capacity", just_built)
        units.append({
            "capacities": [int(part_capacity or 0)] * 5,
            "length": nml.const(part_props["length"].value, scope) if "length" in part_props else 8,
            "weight_t": nml.const(part_props["weight"].value, scope) if "weight" in part_props else 0,
        })
    return units


def resolve_track_types(grf, aliases, railtype_labels):
    """Лейблы путей машины: индекс T_*-алиаса — в первый лейбл его списка, который есть
    в наборе путей (так игра выбирает тип из альтернатив).

    Часть значений уже лейблы — их набор называет напрямую (LOST_TRACK_MACROS), — и они
    проходят как есть. Алиас, ни один лейбл которого набор не поставляет, отбрасывается:
    типа пути, которого нет, у машины нет тоже.
    """
    names = list(grf.track_aliases)
    labels = []
    for alias in aliases:
        if isinstance(alias, str):
            labels.append(alias)
            continue
        label = next(
            (l for l in grf.track_aliases[names[alias]] if l in railtype_labels), None
        )
        if label:
            labels.append(label)
    return labels


def train_payload(grf, name, item, merged, english, railtype_labels):
    props, graphics = item["props"], item["graphics"]
    scope = grf.scope

    def prop_const(key, default=None):
        if key not in props:
            return default
        return nml.const(props[key].value, scope)

    intro_year, intro_month = intro_parts(prop_const("introduction_date"))

    # состав на момент покупки: сама машина и её сочленённые секции — формулы МВПС
    # пересчитывают юниты состава (num_vehs_in_consist, count_veh_id)
    part_names = articulated_units(grf, merged, graphics)
    consist_ids = [item["id"]]
    for part_name in part_names:
        consist_ids.append(merged[part_name]["id"])
    consist_ids = [i for i in consist_ids if i is not None]

    # формулы модернизаций (check_year) читают год постройки: числа снимаются с
    # машины первого выпуска — построенной в год появления и ни разу не обслуженной
    just_built = dict(
        JUST_BUILT,
        build_year=intro_year,
        current_year=intro_year,
        date_of_last_service=0,
        num_vehs_in_consist=len(consist_ids),
    )
    if item["id"] is not None:
        # проверки МВПС «голова своего же типа» (RC_head_check)
        just_built["vehicle_type_id"] = item["id"]
    just_built["functions"] = dict(
        grf.scope["functions"],
        count_veh_id=lambda veh_id: consist_ids.count(int(veh_id)),
    )

    def purchase(key, default=None):
        """Каллбек в контексте меню покупки (см. off_the_track)."""
        if key not in graphics:
            return default
        return grf.callback(graphics[key], off_the_track(grf, just_built))

    power_prop = prop_const("power", 0)
    power_purchase = purchase("purchase_power")
    power_hp = int(power_purchase if power_purchase is not None else power_prop)

    weight_purchase = purchase("purchase_weight")
    weight = int(weight_purchase if weight_purchase is not None else prop_const("weight", 0))

    # скорость: каллбеки уже во внутренних единицах (значение для prop 0x09);
    # свойство speed набор пишет в км/ч
    speed_internal = purchase("purchase_speed")
    if speed_internal is None:
        speed_kmh = prop_const("speed")
        speed_internal = kmh_internal(speed_kmh) if speed_kmh else None
    speed_internal = int(speed_internal) if speed_internal else None

    te = prop_const("tractive_effort_coefficient")
    if te is None:
        te_purchase = purchase("purchase_tractive_effort_coefficient")
        te = te_purchase / 256 if te_purchase is not None else 0

    # расход — число из меню покупки: отдельный purchase-каллбек, а без него игра
    # зовёт обычный каллбек в том же контексте меню (ветка «только построен»)
    rc = purchase("purchase_running_cost_factor")
    if rc is None:
        rc = purchase("running_cost_factor")
    running_cost = int(rc if rc is not None else prop_const("running_cost_factor", 0))

    running_base = "RUNNING_COST_DIESEL"
    if "running_cost_base" in props:
        running_base = str(props["running_cost_base"].value)

    labels = refit_labels(grf, props)
    capacities_map = consist_capacity_by_cargo(
        grf, merged, graphics, part_names, labels, just_built
    )
    capacity = buy_menu_capacity(purchase, prop_const, bool(capacities_map))

    track_prop = props.get("track_type")
    track_alias = None
    track_label = None
    if track_prop is not None:
        value = track_prop.value
        if type(value).__name__ == "FunctionCall" and value.name.value in LOST_TRACK_MACROS:
            track_label = LOST_TRACK_MACROS[value.name.value]
        else:
            track_alias = nml.const(value, scope)
    model_life = prop_const("model_life")

    units = consist_units(
        grf, merged, part_names, scope,
        {"capacities": [capacity] * 5, "length": prop_const("length", 8), "weight_t": weight},
        just_built,
    )
    capacity = sum(u["capacities"][2] for u in units)

    string_id = string_id_of(props["name"])
    name_params = [nml.const(param, scope) for param in props["name"].value.params]
    return {
        "id": "xussr" + (name if name.startswith("_") else f"_{name}"),
        "item": name,
        "name": render_string(props["name"], english, scope, name),
        "grf": grf.name,
        "numeric_ids": [item["id"]] if item["id"] is not None else [],
        "string_id": string_id,
        "name_params": name_params,
        "kind": "engine" if power_hp > 0 else "wagon",
        "gen": 0,
        "role": None,
        "subrole": None,
        "joker": False,
        "randomised": False,
        "base_track_type": "RAIL",
        "track_types": resolve_track_types(
            grf,
            [track_label] if track_label else ([track_alias] if track_alias is not None else []),
            railtype_labels,
        ),
        "lgv_capable": False,
        "intro_year": intro_year,
        "intro_month": intro_month,
        "vehicle_life": prop_const("vehicle_life", 0),
        "model_life": None if model_life in (None, VEHICLE_NEVER_EXPIRES) else model_life,
        "variant_group": group_key(grf.name, series_head(grf, name, item, merged)),
        "retire_early": prop_const("retire_early", 0),
        "power_hp": power_hp,
        "power_by_source": power_by_source(grf, graphics, just_built),
        "speed_by_source": speed_by_source(grf, graphics, just_built),
        "te_coefficient": float(te),
        "speed_mph": display_mph(speed_internal) if speed_internal else None,
        "speed_lgv_mph": None,
        "speed_internal": speed_internal,
        "speed_lgv_internal": None,
        "weight_t": weight,
        "length": sum(u["length"] for u in units),
        "dual_headed": False,
        "units": units,
        "cost_factor": prop_const("cost_factor", 0),
        "running_cost_factor": running_cost,
        "running_cost_base": running_base,
        "capacities": [capacity] * 5,
        "capacity_by_cargo": capacities_map or None,
        "capacity_label": None,
        "loading_speed": None,
        "default_cargos": labels[:1],
        # рефит-группы Iron Horse набору не нужны: перевозку решает его собственная
        # таблица вместимостей (груз без записи в ней вагон не везёт), а метки из
        # `cargo_allow_refit` — её же ключи. Второй список тех же меток был бы копией
        "refit": {"classes": [], "labels_allowed": [], "labels_disallowed": []},
    }


def main():
    grfs = read_grfs()
    english = lang_strings("english.lng")
    railtypes = railtypes_payload(grfs["rails"], english)
    railtype_labels = {rt["label"] for rt in railtypes}

    items, skipped = [], []
    part_names = set()
    for grf_name in GRFS[1:]:
        grf = grfs[grf_name]
        merged = grf.merged_items()
        for name, item in merged.items():
            for part in articulated_units(grf, merged, item["graphics"]):
                part_names.add((grf_name, part))
    merged_by_grf = {}
    for grf_name in GRFS[1:]:
        grf = grfs[grf_name]
        # T_* имена должны сворачиваться в evaluate: даём им индексы
        track_index = {alias: i for i, alias in enumerate(grf.track_aliases)}
        grf.scope.update(track_index)
        merged = merged_by_grf[grf_name] = grf.merged_items()
        for name, item in merged.items():
            climates = nml.const(item["props"]["climates_available"].value, grf.scope) \
                if "climates_available" in item["props"] else None
            if climates == CLIMATES_NONE:
                if (grf_name, name) in part_names:
                    skipped.append((grf_name, name, "articulated section, counted in its head"))
                elif name.startswith("dummy"):
                    skipped.append((grf_name, name, "spacer section"))
                elif name.startswith(("group_", "subgroup_")):
                    skipped.append((grf_name, name, "variant group header"))
                else:
                    skipped.append((grf_name, name, "not buildable at default parameters"))
                continue
            items.append(train_payload(grf, name, item, merged, english, railtype_labels))

    ids = [i["id"] for i in items]
    if len(ids) != len(set(ids)):
        dupes = sorted({x for x in ids if ids.count(x) > 1})
        raise SystemExit(f"extract_xussr: duplicate ids: {dupes}")

    items.sort(key=lambda i: (i["kind"], i["intro_year"], i["id"]))
    groups = variant_groups(grfs, merged_by_grf, items)
    payload = {
        "meta": {
            **vendor_meta("xussrset"),
            "railtypes": railtypes,
            # basecost.pnml набора при new_costs = 0 (его дефолт). Выписаны руками:
            # парсер блоки basecost не сохраняет. Дрейф источника ловит
            # tests/test_xussr_sources.py::BaseCostShifts
            "basecost_shifts": {
                "build_engine": 1,
                "build_wagon": 3,
                "running_steam": 0,
                "running_diesel": 0,
                "running_electric": 0,
                # вагоны набора считают содержание от дорожной базы (PR_RUNNING_ROADVEH)
                "running_roadveh": 0,
            },
            "variant_groups": groups,
            "grf_parameters": {name: grfs[name].parameters for name in GRFS},
            "grfids": {name: grfs[name].grfid for name in GRFS},
            "skipped": [
                {"grf": g, "item": n, "reason": r} for g, n, r in sorted(skipped)
            ],
            "counts": {
                "engines": sum(1 for i in items if i["kind"] == "engine"),
                "wagons": sum(1 for i in items if i["kind"] == "wagon"),
            },
        },
        "items": items,
    }
    write_json("xussr_trains.json", payload)


if __name__ == "__main__":
    main()
