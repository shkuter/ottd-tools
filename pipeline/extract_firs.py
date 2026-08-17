"""Экспорт FIRS 5: экономики, грузы, индустрии, граф цепочек, иконки грузов.

Выход: web/src/data/{cargos,industries,economies}.json + web/public/icons/cargo/*.png
"""
import os
import sys

from common import ICONS_DIR, VENDOR, vendor_meta, write_json

FIRS_ROOT = os.path.join(VENDOR, "firs")
os.chdir(FIRS_ROOT)
sys.path.insert(0, os.path.join(FIRS_ROOT, "src"))

import firs  # noqa: E402
import utils  # noqa: E402
from docs.doc_helper import DocHelper  # noqa: E402
from PIL import Image  # noqa: E402

# initial_payment = price_factor * 2^21 / (10 * 20 * 255) — конверсия NML prop 0x12
NML_PRICE_FACTOR_NUM = 1 << 21
NML_PRICE_FACTOR_DENOM = 10 * 20 * 255

# служебные грузы, исключаемые из графа цепочек (как в доках FIRS)
GRAPH_EXCLUDED_LABELS = ["ENSP", "FMSP", "PASS", "MAIL"]

ACCEPT_MODES = {
    "STR_EMPTY": "all",
    "STR_EXTRA_TEXT_SECONDARY_COMBINATORY_BOTH": "all",
    "STR_EXTRA_TEXT_SECONDARY_COMBINATORY_ALL": "all",
    "STR_EXTRA_TEXT_SECONDARY_NON_COMBINATORY": "independent",
    "STR_EXTRA_TEXT_SECONDARY_COMBINATORY_ANY_THREE": "any_3",
    "STR_EXTRA_TEXT_SECONDARY_COMBINATORY_ANY_TWO": "any_2",
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
        for economy in economies:
            if cargo not in economy.cargos:
                continue
            pf = spaced_price_factors[economy.id][cargo.id]
            price_by_eco[economy.id] = pf
            payment_by_eco[economy.id] = round(
                pf * NML_PRICE_FACTOR_NUM / NML_PRICE_FACTOR_DENOM
            )
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


def extract_industries(dh, economies):
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
        # имя одинаково в большинстве экономик — храним базовое + оверрайды
        base_name = max(set(names.values()), key=list(names.values()).count)
        name_overrides = {k: v for k, v in names.items() if v != base_name}
        item = {
            "id": industry.id,
            "name": base_name,
            "type": type(industry).__name__,
            "map_colour": industry.get_property("map_colour", None),
            "economies": per_economy,
        }
        if name_overrides:
            item["name_by_economy"] = name_overrides
        items.append(item)
    items.sort(key=lambda i: i["id"])
    return items


def economy_graph(economy, industries_payload):
    """Граф цепочек per economy: рёбра produces (industry->cargo) и accepts (cargo->industry)."""
    edges = []
    for industry in industries_payload:
        eco_data = industry["economies"].get(economy.id)
        if eco_data is None:
            continue
        for entry in eco_data["produces"]:
            if entry["label"] not in GRAPH_EXCLUDED_LABELS:
                edges.append({"from": industry["id"], "to": entry["label"], "kind": "produces"})
        for entry in eco_data["accepts"]:
            if entry["label"] not in GRAPH_EXCLUDED_LABELS:
                edges.append({"from": entry["label"], "to": industry["id"], "kind": "accepts"})
    return edges


def economy_dot(economy, dh, edges, cargo_names_by_label):
    """DOT-описание графа для рендера graphviz'ом в SPA."""
    lines = [
        "digraph cargoflow {",
        '  rankdir="LR";',
        '  node [fontsize=10, fontname="sans-serif"];',
        "  edge [color=\"#888888\"];",
    ]
    industry_ids = set()
    cargo_labels = set()
    for edge in edges:
        if edge["kind"] == "produces":
            industry_ids.add(edge["from"])
            cargo_labels.add(edge["to"])
        else:
            cargo_labels.add(edge["from"])
            industry_ids.add(edge["to"])
    industry_names = {i.id: resolve_name(dh.get_industry_name(i, economy)) for i in firs.industry_manager}
    for industry_id in sorted(industry_ids):
        label = industry_names.get(industry_id, industry_id)
        lines.append(
            f'  "{industry_id}" [shape=box, style=filled, fillcolor="#dce7f5", label="{label}"];'
        )
    for cargo_label in sorted(cargo_labels):
        name = cargo_names_by_label.get(cargo_label, cargo_label)
        lines.append(
            f'  "{cargo_label}" [shape=ellipse, style=filled, fillcolor="#f5efd8", label="{name}"];'
        )
    for edge in edges:
        lines.append(f'  "{edge["from"]}" -> "{edge["to"]}";')
    lines.append("}")
    return "\n".join(lines)


def extract_economies(dh, economies, industries_payload, cargos_payload):
    cargo_names_by_label = {c["label"]: c["name"] for c in cargos_payload}
    items = []
    for economy in economies:
        edges = economy_graph(economy, industries_payload)
        items.append({
            "id": economy.id,
            "numeric_id": economy.numeric_id,
            "name": dh.get_economy_name(economy),
            "cargo_labels": [c.cargo_label for c in economy.cargos],
            "industry_ids": [
                i["id"] for i in industries_payload if economy.id in i["economies"]
            ],
            "graph": {
                "excluded_labels": GRAPH_EXCLUDED_LABELS,
                "edges": edges,
                "dot": economy_dot(economy, dh, edges, cargo_names_by_label),
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
    cargos = extract_cargos(dh, economies, spaced)
    industries = extract_industries(dh, economies)
    economies_payload = extract_economies(dh, economies, industries, cargos)

    write_json("cargos.json", {"meta": meta, "items": cargos})
    write_json("industries.json", {"meta": meta, "items": industries})
    write_json("economies.json", {"meta": meta, "items": economies_payload})
    extract_icons()


if __name__ == "__main__":
    main()
