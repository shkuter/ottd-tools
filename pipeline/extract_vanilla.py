"""Экспорт ванильных данных OpenTTD (поезда, грузы, предприятия) в web/src/data/vanilla_*.json.

Нужны, когда игрок отключает Iron Horse и/или FIRS: расчёт тогда идёт по
дефолтным машинам и грузам игры, а импортированная партия называет свои
предприятия строками самой игры, а не набора индустрий.

Источники (парсятся текстом, без сборки игры):
  vendor/openttd/src/table/engines.h        — _orig_engine_info (MT/MM/MW) + _orig_rail_vehicle_info
  vendor/openttd/src/table/cargo_const.h    — базовые грузы
  vendor/openttd/src/cargo_type.h           — настоящие метки грузов (CT_OIL -> "OIL_")
  vendor/openttd/src/table/build_industry.h — _origin_industry_specs, порядок задаёт тип
                                              предприятия в сейве
  vendor/openttd/src/lang/english.txt       — имена машин, грузов и предприятий
"""
import datetime
import functools
import os
import re
import sys

from common import VENDOR, vendor_meta, write_json

OTTD = os.path.join(VENDOR, "openttd")
ENGINES_H = os.path.join(OTTD, "src", "table", "engines.h")
CARGO_H = os.path.join(OTTD, "src", "table", "cargo_const.h")
RAILTYPES_H = os.path.join(OTTD, "src", "table", "railtypes.h")
RAIL_TYPE_H = os.path.join(OTTD, "src", "rail_type.h")
CARGO_TYPE_H = os.path.join(OTTD, "src", "cargo_type.h")
LANG = os.path.join(OTTD, "src", "lang", "english.txt")
INDUSTRY_H = os.path.join(OTTD, "src", "table", "build_industry.h")
INDUSTRY_TYPE_H = os.path.join(OTTD, "src", "industry_type.h")
TRAIN_SPRITES_H = os.path.join(OTTD, "src", "table", "train_sprites.h")
SPRITES_H = os.path.join(OTTD, "src", "table", "sprites.h")

# CalendarTime::DAYS_TILL_ORIGINAL_BASE_YEAR — начало отсчёта дат введения машин
ORIGINAL_BASE_DATE = datetime.date(1920, 1, 1)

# Direction::W — the buy-menu view (direction_type.h, GetRailIcon in train_cmd.cpp)
DIR_W = 6

# в игре ландшафты: T=temperate, A=arctic, S=tropic(sub-tropical), Y=toyland
CLIMATE_NAMES = {"T": "temperate", "A": "arctic", "S": "tropic", "Y": "toyland"}

# RVI column h (engines.h: RC_S/RC_D/RC_E, RC_W = Price::Invalid for wagons)
RUNNING_COST_KEYS = {
    "RC_S": "running_steam",
    "RC_D": "running_diesel",
    "RC_E": "running_electric",
    "RC_W": None,
}

# RVI column k (engines.h: S/D/E/N/V = EngineClass::*, A = Steam for wagons)
ENGINE_CLASS_KEYS = {
    "S": "steam",
    "D": "diesel",
    "E": "electric",
    "N": "monorail",
    "V": "maglev",
    "A": "steam",
}

# RVI column j (engines.h: R/C/O/L = RAILTYPE_*) -> the game's own label (rail_type.h)
RAILTYPE_KEYS = {
    "R": "RAIL",
    "C": "ELRL",
    "O": "MONO",
    "L": "MGLV",
}


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def parse_lang_names(prefix):
    """STR_VEHICLE_NAME_TRAIN_ENGINE_RAIL_KIRBY_PAUL_TANK_STEAM :Kirby Paul Tank"""
    names = {}
    for line in read(LANG).splitlines():
        if line.startswith(prefix):
            key, _, value = line.partition(":")
            names[key.strip()] = value.strip()
    return names


def parse_engine_info():
    """MT/MM/MW: (base_intro_days, decay, life_length, base_life, cargo, climates)."""
    text = read(ENGINES_H)
    start = text.index("_orig_engine_info[]")
    block = text[start : text.index("\n};", start)]
    entries = []
    for line in block.splitlines():
        m = re.match(r"\s*M([TMW])\((.*)\),\s*//\s*(\d+)\s*(.*)", line)
        if not m:
            continue
        kind, args, index, comment = m.groups()
        parts = [p.strip() for p in re.split(r",(?![^({]*[)}])", args)]
        # аргументы: a=intro days, b=decay, c=life length, d=base life, e=cargo, f=climates
        # климаты — только внутри фигурных скобок: LandscapeTypes({  A,S  })
        braces = re.search(r"\{([^}]*)\}", parts[5]) if len(parts) > 5 else None
        climates = re.findall(r"[TASY]", braces.group(1)) if braces else []
        entries.append({
            "index": int(index),
            "macro": kind,
            "intro_days": int(parts[0]),
            "life_length": int(parts[2]),
            "base_life": int(parts[3]),
            "cargo": parts[4],
            "climates": [CLIMATE_NAMES[c] for c in climates],
            "comment": comment.strip(),
        })
    return entries


@functools.lru_cache(maxsize=None)
def parse_sprite_table(name):
    """An array from train_sprites.h (_engine_sprite_base / _and / _add)."""
    text = read(TRAIN_SPRITES_H)
    start = text.index(f"{name}[] = {{")
    block = text[text.index("{", start) + 1 : text.index("\n};", start)]
    block = re.sub(r"/\*.*?\*/|//[^\n]*", "", block, flags=re.S)
    return [int(v, 0) for v in re.findall(r"0x[0-9A-Fa-f]+|\d+", block)]


def train_sprite(image_index, direction=DIR_W):
    """SpriteID of a vehicle sprite (GetDefaultTrainSprite, train_cmd.cpp:503-507)."""
    add = parse_sprite_table("_engine_sprite_add")
    mask = parse_sprite_table("_engine_sprite_and")
    base = parse_sprite_table("_engine_sprite_base")
    return ((direction + add[image_index]) & mask[image_index]) + base[image_index]


@functools.lru_cache(maxsize=None)
def parse_cargo_labels():
    """CT_OIL{'OIL_'} -> {"CT_OIL": "OIL_"} — the labels NewGRFs (Iron Horse, FIRS) refer to.

    Releases spell the label as a character literal ('OIL_'), master as a string ("OIL_").
    """
    return {
        f"CT_{m.group(1)}": m.group(2)
        for m in re.finditer(r"""CT_(\w+)\{['"](.{4})['"]\}""", read(CARGO_TYPE_H))
    }


def parse_cargo_sprites():
    """SPR_CARGO_<PLURAL> = 4297… — cargo icons in the base set."""
    return {
        m.group(1): int(m.group(2))
        for m in re.finditer(r"SPR_CARGO_(\w+)\s*=\s*(\d+)", read(SPRITES_H))
    }


# Icons the interface borrows from the game, where a switch's own label would run
# half a filter row long. Two kinds, because the game keeps them in two places: a
# plain number is a sprite of the base set, while a block is one the base set does
# not hold at all — the graphics an Action 5 lays over a range of sprite numbers,
# which is where the rail-construction buttons live.
GUI_SPRITES = {
    # the toolbar button that opens the subsidy list
    "subsidies": {"base_set": "SPR_IMG_SUBSIDIES"},
}


def sprite_constants():
    """Resolves `static const SpriteID NAME = OTHER + 36;` to plain numbers.

    sprites.h states almost every sprite as an offset from a base, and the bases
    themselves as offsets from earlier bases plus a count. Both kinds of constant
    are read, then each name asked for is resolved through the chain until it is
    a number. Returns the lookup rather than a fixed set, because the callers
    want different names out of the same header.
    """
    exprs = {
        m.group(1): m.group(2).strip()
        for m in re.finditer(
            r"^static const (?:SpriteID|uint16_t|uint)\s+(\w+)\s*=\s*([^;]+);",
            read(SPRITES_H),
            re.M,
        )
    }
    cache: dict[str, int] = {}

    def value(name, seen=()):
        if name in cache:
            return cache[name]
        if name in seen:
            raise ValueError(f"{name}: circular sprite constant")
        expr = exprs.get(name)
        if expr is None:
            raise KeyError(f"{name}: not stated in sprites.h")
        total, sign = 0, 1
        for token in re.findall(r"[A-Za-z_]\w*|\d+|[+-]", expr):
            if token == "+":
                sign = 1
            elif token == "-":
                sign = -1
            elif token.isdigit():
                total += sign * int(token)
            else:
                total += sign * value(token, (*seen, name))
        cache[name] = total
        return total

    return value


def parse_rail_vehicle_info():
    """RVI(image, type, cost, speed, power, weight, running_cost, class, capacity, railtype, running_cost_class)."""
    text = read(ENGINES_H)
    start = text.index("_orig_rail_vehicle_info[]")
    block = text[start : text.index("\n};", start)]
    entries = []
    for line in block.splitlines():
        m = re.match(r"\s*RVI\((.*)\),", line)
        if not m:
            continue
        p = [x.strip() for x in m.group(1).split(",")]
        entries.append({
            "image_index": int(p[0]),
            "type": {"G": "engine", "M": "multihead", "W": "wagon"}[p[1]],
            "cost_factor": int(p[2]),
            "max_speed": int(p[3]),
            "power_hp": int(p[4]),
            "weight_t": int(p[5]),
            "running_cost": int(p[6]),
            "running_cost_class": RUNNING_COST_KEYS[p[7]],
            "capacity": int(p[8]),
            "railtype": RAILTYPE_KEYS[p[9]],
            "engine_class": ENGINE_CLASS_KEYS[p[10]],
        })
    return entries


def parse_railtype_labels():
    """RAILTYPE_LABEL_ELECTRIC = 'ELRL' -> {"ELECTRIC": "ELRL"} (rail_type.h)."""
    text = read(RAIL_TYPE_H)
    return {
        m.group(1): m.group(2)
        for m in re.finditer(r"RAILTYPE_LABEL_(\w+)\s*=\s*'(\w{4})'", text)
    }


def parse_railtypes():
    """The game's own track types from _original_railtypes[] (table/railtypes.h).

    Each entry states which railtypes a vehicle of this type draws power on and which
    it can travel on; both lists name this type as well, so the masks are already in
    the normalised form the calculator expects. A max speed of 0 means "no limit" —
    none of the original types has one.
    """
    labels = parse_railtype_labels()
    names = parse_lang_names("STR_RAIL_NAME_")
    text = read(RAILTYPES_H)
    start = text.index("_original_railtypes[]")
    block = text[start : text.index("\n};\n", start)]

    def mask(section):
        # the table spells the section both ways ("Compatible railtypes" for rail and
        # elrail, "Compatible Railtypes" for monorail and maglev)
        return [
            [labels[e.removeprefix("RAILTYPE_")] for e in re.findall(r"RAILTYPE_\w+", m)]
            for m in re.findall(rf"/\* {section} [Rr]ailtypes \*/\s*\{{([^}}]*)\}}", block)
        ]

    entries = [
        {
            "label": labels[label.removeprefix("RAILTYPE_LABEL_")],
            # RailTypeFlag::Catenary (rail.h): the track carries overhead wires, which is
            # what decides whether an electric vehicle draws power on it
            "catenary": "Catenary" in flags,
            # what the track feeds a vehicle with: the game's electrified rail is
            # overhead wire with no current system stated (Iron Horse calls it OHLE)
            "power_source": ["OHLE"] if "Catenary" in flags else [],
            # the game hides no track type of its own; a set can (RailTypeFlag::Hidden)
            "hidden": "Hidden" in flags,
            # the string id the type declares, so a translation is matched by what the
            # type names itself rather than by a guess from its label
            "string_id": f"STR_RAIL_NAME_{name}",
            "name": names[f"STR_RAIL_NAME_{name}"],
            "speed_limit_internal": int(speed),
            # rail.h RailMaintenanceCost: a piece of this track costs this multiplier times
            # the infrastructure base price every month, so a set that redefines a type
            # redefines what its track costs to own
            "maintenance_multiplier": int(maintenance),
            "powered": powered,
            "compatible": compatible,
            "lgv": False,
            "sort": index,
        }
        for index, (label, name, speed, flags, maintenance, powered, compatible) in enumerate(zip(
            re.findall(r"/\* rail type label \*/\s*(RAILTYPE_LABEL_\w+)", block),
            re.findall(r"STR_RAIL_NAME_(\w+)", block),
            re.findall(r"/\* max speed \*/\s*(\d+)", block),
            re.findall(r"/\* flags \*/\s*\{([^}]*)\}", block),
            re.findall(r"/\* maintenance cost multiplier \*/\s*(\d+)", block),
            mask("Powered"),
            mask("Compatible"),
            strict=True,
        ))
    ]
    if len(entries) != 4:
        raise SystemExit(f"expected the game's four railtypes, parsed {len(entries)}")
    return entries


def default_cargo_labels(cargo_const, labels):
    """CT_COAL -> ["COAL"]; MCT_GRAIN_WHEAT_MAIZE -> ["GRAI", "WHEA", "MAIZ"]; CT_NONE -> []."""
    if cargo_const == "CT_NONE":
        return []
    if cargo_const.startswith("MCT_"):
        return [labels[f"CT_{part}"] for part in cargo_const[len("MCT_"):].split("_")]
    return [labels[cargo_const]]


def build_trains():
    infos = parse_engine_info()
    rvis = parse_rail_vehicle_info()
    labels = parse_cargo_labels()

    items = []
    for info in infos:
        idx = info["index"]
        if idx >= len(rvis):
            break  # дальше идут дорожные машины/суда/самолёты
        rvi = rvis[idx]
        # name: the table comment matches the lang string ("Kirby Paul Tank (Steam)")
        name = re.sub(r"\s*\(.*?\)\s*$", "", info["comment"]).strip()
        is_wagon = rvi["type"] == "wagon"
        # base_intro = DAYS_TILL_ORIGINAL_BASE_YEAR + intro_days (table/engines.h MT),
        # т.е. дни от 1 января 1920 — из них берётся и год, и месяц появления
        intro = ORIGINAL_BASE_DATE + datetime.timedelta(days=info["intro_days"])
        items.append({
            "id": f"vanilla_{idx}",
            # the game's own EngineID: row number in _orig_rail_vehicle_info,
            # which is what a savegame's engine pool maps to for the base set
            "engine_id": idx,
            "name": name,
            "kind": "wagon" if is_wagon else "engine",
            "dual_headed": rvi["type"] == "multihead",
            "intro_year": intro.year,
            "intro_month": intro.month,
            "vehicle_life": info["life_length"],
            # engine.cpp:141 — original wagons never expire (base_life forced to 0xFF)
            "model_life": None if is_wagon else info["base_life"],
            "climates": info["climates"],
            "power_hp": rvi["power_hp"] * (2 if rvi["type"] == "multihead" else 1),
            "weight_t": rvi["weight_t"] * (2 if rvi["type"] == "multihead" else 1),
            # 1 unit = 1/1.6 mph -> в mph как показывает игра
            "speed_mph": round(rvi["max_speed"] * 10 / 16) if rvi["max_speed"] else None,
            "speed_internal": rvi["max_speed"],
            "capacity": rvi["capacity"],
            "cost_factor": rvi["cost_factor"],
            "running_cost_factor": rvi["running_cost"],
            "running_cost_class": rvi["running_cost_class"],
            "engine_class": rvi["engine_class"],
            "railtype": rvi["railtype"],
            # CT_NONE: an engine without a cargo hold (the game aliases it to passengers).
            # MCT_GRAIN_WHEAT_MAIZE: one wagon, a different cargo per climate (cargo_type.h
            # MixedCargoType) — list every label so any climate's cargo matches.
            "default_cargos": default_cargo_labels(info["cargo"], labels),
            # ваниль: TE-коэффициент 76/256, длина 8 единиц (полтайла)
            "te_coefficient": 76 / 256,
            "length": 8,
            # base-set graphics: the sprite number is what the game computes;
            # for dual-headed vehicles the rear half is the next image_index
            # (train_cmd.cpp:555)
            "image_index": rvi["image_index"],
            "sprite_id": train_sprite(rvi["image_index"]),
            "sprite_id_rear": (
                train_sprite(rvi["image_index"] + 1)
                if rvi["type"] == "multihead"
                else None
            ),
        })
    return items


def build_cargos():
    """MK(bt, label, colour, weight, mult, ip, td1, td2, freight, tae, str_plural, ...)."""
    text = read(CARGO_H)
    start = text.index("_default_cargo[]")
    block = text[start : text.index("\n};", start)]
    names = parse_lang_names("STR_CARGO_PLURAL_")
    cargo_sprites = parse_cargo_sprites()
    labels = parse_cargo_labels()
    items = []
    for m in re.finditer(r"\bMK\(\s*(.*?)\)\s*,\s*$", block, re.M | re.S):
        args = [a.strip() for a in re.split(r",(?![^(]*\))", m.group(1))]
        if len(args) < 11:
            continue
        label_const = args[1]                       # CT_COAL
        slug = label_const.replace("CT_", "")       # COAL / IRON_ORE — id and icon file name
        str_plural = args[10]                       # COAL
        # CT_INVALID — служебные слоты без имени (заполняются climate-таблицами)
        if label_const == "CT_INVALID" or str_plural == "NOTHING":
            continue
        items.append({
            "label": labels[label_const],           # the game's CargoLabel: "COAL", "OIL_", "IORE"
            "id": slug.lower(),
            "name": names.get(f"STR_CARGO_PLURAL_{str_plural}", slug.title()),
            # The lang string the name comes from — other extractors translate through it.
            "str_plural": f"STR_CARGO_PLURAL_{str_plural}",
            "initial_payment": int(args[5]),
            "transit_periods": [int(args[6]), int(args[7])],
            "weight_16ths": int(args[3]),
            "capacity_multiplier": int(args[4], 16),
            "is_freight": args[8] == "true",
            "classes_raw": args[13] if len(args) > 13 else "",
            # MK_SPRITE(str_plural) → SPR_CARGO_<PLURAL> (cargo_const.h:54)
            "sprite_id": cargo_sprites.get(str_plural),
            "icon": f"icons/vanilla_cargo/{slug.lower()}.png",
        })
    return items


def new_industry_offset():
    """Сколько типов предприятий объявляет сама игра (industry_type.h)."""
    match = re.search(r"NEW_INDUSTRYOFFSET\s*=\s*(\d+)", read(INDUSTRY_TYPE_H))
    if not match:
        sys.exit(f"не найден NEW_INDUSTRYOFFSET в {INDUSTRY_TYPE_H}")
    return int(match.group(1))


def build_industries():
    """Предприятия базовой игры: индекс в _origin_industry_specs — это тип из сейва.

    Сама игра адресует их так же: сохранение хранит IndustryType, а IIDS в ванильной
    партии нет вовсе, поэтому номер типа читается прямо по этой таблице.

    Разбор идёт текстом, поэтому лишнее вхождение STR_INDUSTRY_NAME_* внутри блока сдвинуло
    бы все типы разом и переименовало партию молча. Единственное, с чем этот сдвиг можно
    сверить, — число типов, которое игра объявляет сама: расхождение с ним останавливает
    сборку здесь, у источника, а не через два файла проверок.
    """
    text = read(INDUSTRY_H)
    start = text.index("_origin_industry_specs[NEW_INDUSTRYOFFSET] = {")
    block = text[start : text.index("\n};", start)]
    keys = re.findall(r"STR_INDUSTRY_NAME_\w+", block)
    declared = new_industry_offset()
    if len(keys) != declared:
        sys.exit(
            f"предприятий разобрано {len(keys)}, а игра объявляет {declared} "
            f"(NEW_INDUSTRYOFFSET) — разбор таблицы сдвинулся, типы поедут"
        )
    names = parse_lang_names("STR_INDUSTRY_NAME_")
    items = []
    for type_id, key in enumerate(keys):
        name = names.get(key)
        if name is None:
            sys.exit(f"нет строки {key} в {LANG}")
        # id из строки игры, как у ванильных грузов: там, где предприятие есть и в FIRS,
        # оба набора приходят к одному id и к одному имени (проверяется в extract_firs_ru)
        items.append({
            "id": key.removeprefix("STR_INDUSTRY_NAME_").lower(),
            "type": type_id,
            "string_key": key,
            "name": name,
        })
    return items


def build_climate_slots():
    """CargoID -> CargoLabel per climate, from _default_climate_cargo (cargo_const.h).

    A vanilla savegame's cargo indexes resolve against the climate's slot table.
    Slots given as a plain number in the table have no default cargo (NewGRF-only)
    and come out as None.
    """
    text = read(CARGO_H)
    labels = parse_cargo_labels()
    start = text.index("_default_climate_cargo")
    block = text[start : text.index("\n};", start)]
    climates = []
    for row in re.finditer(r"\{([^{}]*)\},", block):
        slots = []
        for token in row.group(1).split(","):
            token = token.strip()
            if not token:
                continue
            slots.append(labels[token] if token.startswith("CT_") else None)
        climates.append(slots)
    if len(climates) != 4:
        raise SystemExit(f"_default_climate_cargo: expected 4 climates, got {len(climates)}")
    return dict(zip(["temperate", "arctic", "tropic", "toyland"], climates))


def main():
    trains = build_trains()
    cargos = build_cargos()
    industries = build_industries()
    # один и тот же груз объявлен для нескольких климатов — оставляем первый
    seen = set()
    cargos = [c for c in cargos if not (c["label"] in seen or seen.add(c["label"]))]
    meta = vendor_meta("openttd")
    write_json("vanilla_trains.json", {
        "meta": {**meta, "railtypes": parse_railtypes()},
        "items": trains,
    })
    write_json("vanilla_cargos.json", {
        "meta": meta,
        "climate_slots": build_climate_slots(),
        "items": cargos,
    })
    write_json("vanilla_industries.json", {"meta": meta, "items": industries})
    # Sprites at or above SPR_OPENTTD_BASE are not in the base set: they come from
    # openttd.grf, which the game loads on top of it. The number says which file to
    # look in, so the boundary travels with the numbers.
    sprite = sprite_constants()
    icons = {}
    for key, where in GUI_SPRITES.items():
        if "base_set" in where:
            icons[key] = {"sprite": sprite(where["base_set"])}
        else:
            name, base = where["offset"]
            icons[key] = {"block": where["block"], "offset": sprite(name) - sprite(base)}
    write_json("vanilla_gui.json", {"meta": meta, "icons": icons})
    print(
        f"vanilla: {len(trains)} trains, {len(cargos)} cargos, "
        f"{len(industries)} industries"
    )
    if not trains or not cargos or not industries:
        sys.exit("не удалось распарсить ванильные таблицы")


if __name__ == "__main__":
    main()
