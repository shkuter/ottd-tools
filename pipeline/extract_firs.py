"""Экспорт FIRS 5: экономики, грузы, индустрии, граф цепочек, иконки грузов.

Выход: web/src/data/{cargos,industries,economies}.json + web/public/icons/cargo/*.png
"""
import importlib
import os
import re
from collections import Counter

from PIL import Image

from common import ICONS_DIR, bootstrap_firs, vendor_meta, write_json

fx = bootstrap_firs()
firs = fx.firs
utils = fx.utils
DocHelper = fx.DocHelper
FIRS_ROOT = fx.root

# initial_payment = price_factor * 2^21 / (10 * 20 * 255) — конверсия NML prop 0x12
NML_PRICE_FACTOR_NUM = 1 << 21
NML_PRICE_FACTOR_DENOM = 10 * 20 * 255

# Industry pictures for the chain graph: the pipeline copies FIRS's own docs
# assets (see extract_industry_images.py); the record only carries the paths.
INDUSTRY_IMAGE = "icons/industries/{id}.png"
INDUSTRY_IMAGE_SMALL = "icons/industries/small/{id}.png"

ACCEPT_MODES = {
    "STR_EMPTY": "all",
    "STR_EXTRA_TEXT_SECONDARY_COMBINATORY_BOTH": "all",
    "STR_EXTRA_TEXT_SECONDARY_COMBINATORY_ALL": "all",
    "STR_EXTRA_TEXT_SECONDARY_NON_COMBINATORY": "independent",
    "STR_EXTRA_TEXT_SECONDARY_COMBINATORY_ANY_THREE": "any_3",
    "STR_EXTRA_TEXT_SECONDARY_COMBINATORY_ANY_TWO": "any_2",
}

# Supply window: how long one delivery keeps an industry supplied. Both halves are read out
# of the FIRS sources rather than off the "3 months" comment beside them, so a release that
# retimes the window trips the known-values test instead of silently shifting every verdict.
SUPPLY_CYCLE_REGISTER_PREFIXES = ("num_supplies_delivered_", "input_cargo_delivered_")
PRODUCE_CALLBACK_RE = re.compile(r"produce_(\d+)_ticks")


def supply_window_cycles():
    """Production cycles a delivery is remembered for.

    Counted off the perm storage FIRS reserves — one register per remembered cycle.
    Secondaries keep the same window in a countdown instead of a list: produce_secondary.pynml
    stores 28 on delivery and takes one off per cycle, "so we get 27 cycles in total", so they
    contribute no registers here and the count still describes them.
    """
    mappings = importlib.import_module("grf.perm_storage_mappings").perm_storage_mappings
    counts = {
        sum(1 for name in mapping.storage_items if name.startswith(prefix))
        for mapping in mappings.values()
        for prefix in SUPPLY_CYCLE_REGISTER_PREFIXES
    }
    counts.discard(0)
    if len(counts) != 1:
        raise SystemExit(f"FIRS industry types disagree on the supply window: {sorted(counts)}")
    return counts.pop()


def production_cycle_ticks():
    """Ticks between production callbacks, taken from the callback the templates hang it on."""
    templates = os.path.join(FIRS_ROOT, "src", "grf", "templates")
    ticks = set()
    for name in sorted(os.listdir(templates)):
        if name.startswith("industry_") and name.endswith(".pynml"):
            with open(os.path.join(templates, name)) as f:
                ticks.update(int(found) for found in PRODUCE_CALLBACK_RE.findall(f.read()))
    if len(ticks) != 1:
        raise SystemExit(f"FIRS industry templates disagree on the cycle length: {sorted(ticks)}")
    return ticks.pop()


# Supply pool: primaries and ports convert deliveries into a production bonus by counting what
# arrived across the window against two thresholds. Both thresholds and both bonuses are NewGRF
# parameters; the calculator assumes the defaults, and reads them where the defaults are stated.
SUPPLY_POOL_PARAMS = (
    ("level1", "primary_level1_requirement", "primary_level1_produced_percent"),
    ("level2", "primary_level2_requirement", "primary_level2_produced_percent"),
)
PARAM_DEF_VALUE_RE = re.compile(r"(\w+)\s*\{[^{}]*?def_value:\s*([^;]+);", re.S)
TEMPLATE_EXPR_RE = re.compile(r"\$\{([^}]+)\}")


def newgrf_param_defaults():
    """Default value of each NewGRF parameter, by parameter name.

    Read out of the header template, where the defaults are declared, so that a FIRS release
    retuning them shows up as a data diff. Values are either plain numbers or short arithmetic
    over global_constants, which is a python module here and can simply be asked.
    """
    header = os.path.join(FIRS_ROOT, "src", "grf", "templates", "header.pynml")
    constants = importlib.import_module("global_constants")
    with open(header) as f:
        source = f.read()
    defaults = {}
    for name, raw in PARAM_DEF_VALUE_RE.findall(source):
        expression = TEMPLATE_EXPR_RE.sub(lambda m: m.group(1), raw).strip()
        try:
            defaults[name] = int(eval(expression, {"global_constants": constants}))
        except (SyntaxError, NameError, TypeError, ValueError):
            continue  # a string or a lookup we have no use for
    return defaults


def supply_pool_payload(industry, param_defaults):
    """Thresholds and production bonuses for an industry fed by the supply pool.

    None for industries the pool does not drive — secondaries, tertiaries and the primaries
    FIRS marks as taking no supplies. The industry type carries a multiplier over the shared
    thresholds (1 for farms and mines, 8 for ports), so the numbers land here already scaled.
    """
    requirements = getattr(industry, "supply_requirements", None)
    if not requirements:
        return None
    multiplier = requirements[2]
    return {
        level: {
            "threshold": multiplier * param_defaults[threshold_param],
            "production_percent": param_defaults[bonus_param],
        }
        for level, threshold_param, bonus_param in SUPPLY_POOL_PARAMS
    }


TTD_UNIT_NAMES = {
    "TTD_STR_TONS": "tonnes",
    "TTD_STR_LITERS": "litres",
    "TTD_STR_BAGS": "bags",
    "TTD_STR_PASSENGERS": "passengers",
    "TTD_STR_ITEMS": "items",
    "TTD_STR_CRATES": "crates",
    "TTD_STR_NOTHING": "",
}


TTD_NAME_PREFIXES = (
    "TTD_STR_CARGO_PLURAL_",
    "TTD_STR_CARGO_SINGULAR_",
    "TTD_STR_INDUSTRY_NAME_",
)


def ttd_fallback_name(name):
    """'NO NAME TTD_STR_INDUSTRY_NAME_OIL_WELLS ...' -> 'Oil Wells'.

    Ванильные TTD-строки в lang-файлах FIRS отсутствуют — имя читаемо
    восстанавливается из id строки.
    """
    for token in name.split():
        for prefix in TTD_NAME_PREFIXES:
            if token.startswith(prefix):
                return token[len(prefix):].replace("_", " ").title()
    return name


def resolve_name(raw_name):
    return ttd_fallback_name(raw_name) if "TTD_STR" in raw_name else raw_name


def unwrap_lang(dh, declaration):
    string_id = utils.unwrap_nml_string_declaration(declaration)
    if string_id in TTD_UNIT_NAMES:
        return TTD_UNIT_NAMES[string_id]
    return dh.lang_strings.get(string_id, string_id)


def extract_cargos(dh, economies, spaced_price_factors):
    items = []
    for cargo in firs.cargo_manager:
        price_by_eco = {}
        payment_by_eco = {}
        colour_by_eco = {}
        for economy in economies:
            if cargo not in economy.cargos:
                continue
            pf = spaced_price_factors[economy.id][cargo.id]
            price_by_eco[economy.id] = pf
            payment_by_eco[economy.id] = round(
                pf * NML_PRICE_FACTOR_NUM / NML_PRICE_FACTOR_DENOM
            )
            # the colour the game draws the cargo in (station rating, graphs):
            # an index into the game palette, assigned per economy by slot
            colour_by_eco[economy.id] = int(cargo.get_cargo_colour(economy))
        items.append({
            "id": cargo.id,
            "label": cargo.cargo_label,
            "name": resolve_name(dh.get_cargo_name(cargo)),
            "classes": list(cargo.cargo_classes),
            "is_freight": cargo.is_freight == "1",
            "weight_16ths": round(float(cargo.weight) * 16),
            "capacity_multiplier": int(cargo.capacity_multiplier),
            "price_factor_by_economy": price_by_eco,
            "initial_payment_by_economy": payment_by_eco,
            "colour_by_economy": colour_by_eco,
            # transit_periods: единица — период старения 185 тиков = 2.5 дня (НЕ день)
            "transit_periods": [
                int(cargo.penalty_lowerbound),
                int(cargo.single_penalty_length),
            ],
            "units": unwrap_lang(dh, cargo.units_of_cargo),
            "icon": f"icons/cargo/{cargo.id}.png",
        })
    items.sort(key=lambda i: i["id"])
    return items


def industry_economy_payload(industry, economy):
    accepts_with_ratios = industry.get_property("accept_cargos_with_input_ratios", economy)
    if accepts_with_ratios:
        accepts = [{"label": label, "ratio": ratio} for label, ratio in accepts_with_ratios]
        extra = utils.unwrap_nml_string_declaration(industry.get_extra_text_string(economy))
        accept_mode = ACCEPT_MODES.get(extra, "all")
    else:
        accepts = [
            {"label": label, "ratio": None}
            for label in industry.get_accepted_cargo_labels_by_economy(economy)
        ]
        accept_mode = "all"
    produces = [
        {"label": label, "value": value}
        for label, value in industry.get_prod_cargo_types(economy)
    ]
    return {"accepts": accepts, "accept_mode": accept_mode, "produces": produces}


def extract_industries(dh, economies, param_defaults):
    items = []
    for industry in firs.industry_manager:
        per_economy = {}
        names = {}
        for economy in economies:
            variation = industry.economy_variations.get(economy.id)
            if variation is None or not variation.enabled:
                continue
            per_economy[economy.id] = industry_economy_payload(industry, economy)
            names[economy.id] = resolve_name(dh.get_industry_name(industry, economy))
        if not per_economy:
            continue
        # имя одинаково в большинстве экономик — храним базовое + оверрайды.
        # Counter, а не max(set(...)): порядок обхода set для строк рандомизирован
        # по хешу — на ничьей базовое имя прыгало бы между запусками.
        base_name = Counter(names.values()).most_common(1)[0][0]
        name_overrides = {k: v for k, v in names.items() if v != base_name}
        item = {
            "id": industry.id,
            # the industry's grf-local item id: what a savegame's industry type
            # mapping (IIDS chunk) resolves to for FIRS industries
            "numeric_id": industry.numeric_id,
            "name": base_name,
            "type": type(industry).__name__,
            "map_colour": industry.get_property("map_colour", None),
            "economies": per_economy,
            "image": INDUSTRY_IMAGE.format(id=industry.id),
            "image_small": INDUSTRY_IMAGE_SMALL.format(id=industry.id),
        }
        if getattr(industry, "town_industry_for_cargoflow", False):
            # FIRS's own cargo-flow chart leaves town industries out and names
            # them in the cargo badge instead ("To Hotel"); the graph does the same
            item["town_industry"] = True
        if name_overrides:
            item["name_by_economy"] = name_overrides
        # 'string(STR_STATION_FURNACE)' -> STR_STATION_FURNACE: the key of the
        # nearby-station suffix in station_names.json / stations.ru.json
        # (a few industries reuse their own name string, e.g. STR_IND_PEATLANDS)
        nearby = industry.default_industry_properties.nearby_station_name
        if nearby:
            m = re.fullmatch(r"string\((STR_\w+)\)", nearby)
            if m is None:
                raise SystemExit(f"{industry.id}: unexpected nearby_station_name {nearby!r}")
            item["station_name_key"] = m.group(1)
        supply_pool = supply_pool_payload(industry, param_defaults)
        if supply_pool:
            item["supply_pool"] = supply_pool
        items.append(item)
    items.sort(key=lambda i: i["id"])
    return items


def economy_graph(economy, industries_payload, excluded_labels):
    """Граф цепочек per economy: рёбра produces (industry->cargo) и accepts (cargo->industry)."""
    edges = []
    for industry in industries_payload:
        eco_data = industry["economies"].get(economy.id)
        if eco_data is None:
            continue
        for entry in eco_data["produces"]:
            if entry["label"] not in excluded_labels:
                edges.append({"from": industry["id"], "to": entry["label"], "kind": "produces"})
        for entry in eco_data["accepts"]:
            if entry["label"] not in excluded_labels:
                edges.append({"from": entry["label"], "to": industry["id"], "kind": "accepts"})
    return edges


def graph_tuning(economy, label_by_id, known_industry_ids, town_industry_ids):
    """The readability tuning FIRS's cargo-flow chart is drawn with, as the graph node ids.

    The economy lists cargos by id and mixes cargos with industries in ranks,
    clusters and edge groups (doc_helper.unpack_cargoflow_node_name tells them
    apart the same way). Cargo nodes become `C:<label>`, industries `I:<id>`, so
    the page matches them against its own nodes without a second lookup.
    """
    tuning = economy.cargoflow_graph_tuning or {}

    def node(name):
        if name in label_by_id:
            return f"C:{label_by_id[name]}"
        if name in known_industry_ids:
            return f"I:{name}"
        raise SystemExit(f"{economy.id}: cargoflow tuning names unknown node {name!r}")

    def labels(key):
        return [label_by_id[cargo_id] for cargo_id in tuning.get(key, [])]

    # doc_helper.get_cargoflow_wormhole_cargos: the listed industries plus every
    # town industry — neither gets an edge from the cargos it takes
    wormhole = list(dict.fromkeys([*tuning.get("wormhole_industries", []), *town_industry_ids]))
    return {
        "clone_produce": labels("cargos_with_individual_produce_nodes"),
        "clone_accept": labels("cargos_with_individual_accept_nodes"),
        "wormhole_industries": wormhole,
        "edge_groups": [[node(n) for n in group] for group in tuning.get("group_edges_subgraphs", [])],
        "ranks": [
            {"rank": rank, "nodes": [node(n) for n in nodes]}
            for rank, nodes in tuning.get("ranking_subgraphs", [])
        ],
        "clusters": [
            {
                "nodes": [node(n) for n in cluster["nodes"]],
                **({"rank": cluster["rank"]} if "rank" in cluster else {}),
            }
            for cluster in tuning.get("clusters", [])
        ],
    }


def extract_economies(dh, economies, industries_payload, cargos_payload):
    label_by_id = {c["id"]: c["label"] for c in cargos_payload}
    # what FIRS's own chart leaves out: passengers and mail, and the supply
    # cargos, which would tie half the graph together — those are written into
    # the industry node as "Requires …" / "Produces …" lines instead
    banned_labels = [label_by_id[c] for c in dh.get_cargoflow_banned_cargos()]
    supply_labels = [label_by_id[c] for c in dh.get_cargoflow_supply_cargos()]
    excluded_labels = [*banned_labels, *supply_labels]
    all_industry_ids = {i["id"] for i in industries_payload}
    items = []
    for economy in economies:
        edges = economy_graph(economy, industries_payload, excluded_labels)
        industry_ids = [i["id"] for i in industries_payload if economy.id in i["economies"]]
        town_industry_ids = [
            i["id"] for i in industries_payload
            if economy.id in i["economies"] and i.get("town_industry")
        ]
        items.append({
            "id": economy.id,
            "numeric_id": economy.numeric_id,
            "name": dh.get_economy_name(economy),
            "cargo_labels": [c.cargo_label for c in economy.cargos],
            # game cargo slots: CargoID = position in economy.cargo_ids (cargo.py:49);
            # a savegame's cargo indexes resolve against this order
            "cargo_slots": [
                label_by_id[cargo_id] for cargo_id in economy.cargo_ids
            ],
            "industry_ids": industry_ids,
            "graph": {
                "excluded_labels": excluded_labels,
                "supply_labels": supply_labels,
                "edges": edges,
                "tuning": graph_tuning(economy, label_by_id, all_industry_ids, town_industry_ids),
            },
        })
    return items


def extract_icons():
    """Slice cargoicons.png: a 10x10 icon at offset 10 inside a 20px grid.

    The sheet draws each icon on the blue transparent index and puts a white
    caption strip under it, so both the grid step and the transparency matter:
    cropping wider drags the caption in, and without transparency=0 the icon
    ships as a white tile. Scaled x2 to match the 20x20 the UI reserves.
    """
    os.makedirs(ICONS_DIR, exist_ok=True)
    sheet = Image.open(os.path.join(FIRS_ROOT, "src", "graphics", "cargoicons.png"))
    count = 0
    for cargo in firs.cargo_manager:
        ix, iy = cargo.icon_indices
        x, y = 10 + 20 * ix, 10 + 20 * iy
        icon = sheet.crop((x, y, x + 10, y + 10))
        icon = icon.resize((20, 20), Image.Resampling.NEAREST)
        icon.save(os.path.join(ICONS_DIR, f"{cargo.id}.png"), transparency=0)
        count += 1
    print(f"icons: {count} -> {ICONS_DIR}")


def main():
    firs.main()
    lang_data = utils.get_lang_data("grf", "english")
    dh = DocHelper(lang_data["lang_strings"])
    economies = list(firs.economy_manager)
    spaced = {
        e.id: e.forcibly_space_cargo_price_factors(firs.cargo_manager) for e in economies
    }

    meta = vendor_meta("firs")
    param_defaults = newgrf_param_defaults()
    cargos = extract_cargos(dh, economies, spaced)
    industries = extract_industries(dh, economies, param_defaults)
    economies_payload = extract_economies(dh, economies, industries, cargos)

    write_json("cargos.json", {"meta": meta, "items": cargos})
    industries_meta = {
        **meta,
        "supply_window_ticks": supply_window_cycles() * production_cycle_ticks(),
    }
    write_json("industries.json", {"meta": industries_meta, "items": industries})
    write_json("economies.json", {"meta": meta, "items": economies_payload})
    extract_icons()


if __name__ == "__main__":
    main()
