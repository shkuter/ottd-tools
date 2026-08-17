"""Экспорт ванильных данных OpenTTD (поезда и грузы) в web/src/data/vanilla_*.json.

Нужны, когда игрок отключает Iron Horse и/или FIRS: расчёт тогда идёт по
дефолтным машинам и грузам игры.

Источники (парсятся текстом, без сборки игры):
  vendor/openttd/src/table/engines.h      — _orig_engine_info (MT/MM/MW) + _orig_rail_vehicle_info
  vendor/openttd/src/table/cargo_const.h  — базовые грузы
  vendor/openttd/src/lang/english.txt     — имена машин и грузов
"""
import os
import re
import sys

from common import VENDOR, vendor_meta, write_json

OTTD = os.path.join(VENDOR, "openttd")
ENGINES_H = os.path.join(OTTD, "src", "table", "engines.h")
CARGO_H = os.path.join(OTTD, "src", "table", "cargo_const.h")
LANG = os.path.join(OTTD, "src", "lang", "english.txt")

# в игре ландшафты: T=temperate, A=arctic, S=tropic(sub-tropical), Y=toyland
CLIMATE_NAMES = {"T": "temperate", "A": "arctic", "S": "tropic", "Y": "toyland"}

RUNNING_COST_KEYS = {
    "Price::RunningTrainSteam": "running_steam",
    "Price::RunningTrainDiesel": "running_diesel",
    "Price::RunningTrainElectric": "running_electric",
    "Price::Invalid": None,
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
            "type": {"G": "engine", "M": "multihead", "W": "wagon"}[p[1]],
            "cost_factor": int(p[2]),
            "max_speed": int(p[3]),
            "power_hp": int(p[4]),
            "weight_t": int(p[5]),
            "running_cost": int(p[6]),
            "engine_class": p[7],
            "capacity": int(p[8]),
            "railtype": p[9],
            "running_cost_class": RUNNING_COST_KEYS.get(p[10], "running_diesel"),
        })
    return entries


def build_trains():
    infos = parse_engine_info()
    rvis = parse_rail_vehicle_info()
    names = parse_lang_names("STR_VEHICLE_NAME_TRAIN_")
    name_list = [v for k, v in names.items()]

    items = []
    for info in infos:
        idx = info["index"]
        if idx >= len(rvis):
            break  # дальше идут дорожные машины/суда/самолёты
        rvi = rvis[idx]
        # имя: комментарий в таблице совпадает с lang-строкой («Kirby Paul Tank (Steam)»)
        raw = re.sub(r"\s*\(.*?\)\s*$", "", info["comment"]).strip()
        name = raw if raw in name_list else raw
        is_wagon = rvi["type"] == "wagon"
        items.append({
            "id": f"vanilla_{idx}",
            "name": name,
            "kind": "wagon" if is_wagon else "engine",
            "dual_headed": rvi["type"] == "multihead",
            "intro_year": 1920 + info["intro_days"] // 365,
            "vehicle_life": info["life_length"],
            "model_life": info["base_life"],
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
            "default_cargo": info["cargo"],
            # ваниль: TE-коэффициент 76/256, длина 8 единиц (полтайла)
            "te_coefficient": 76 / 256,
            "length": 8,
        })
    return items


def build_cargos():
    """MK(bt, label, colour, weight, mult, ip, td1, td2, freight, tae, str_plural, ...)."""
    text = read(CARGO_H)
    start = text.index("_default_cargo[]")
    block = text[start : text.index("\n};", start)]
    names = parse_lang_names("STR_CARGO_PLURAL_")
    items = []
    for m in re.finditer(r"\bMK\(\s*(.*?)\)\s*,\s*$", block, re.M | re.S):
        args = [a.strip() for a in re.split(r",(?![^(]*\))", m.group(1))]
        if len(args) < 11:
            continue
        label_const = args[1]                       # CT_COAL
        label = label_const.replace("CT_", "")
        str_plural = args[10]                       # COAL
        # CT_INVALID — служебные слоты без имени (заполняются climate-таблицами)
        if label_const == "CT_INVALID" or str_plural == "NOTHING":
            continue
        items.append({
            "label": label_const,
            "id": label.lower(),
            "name": names.get(f"STR_CARGO_PLURAL_{str_plural}", label.title()),
            "initial_payment": int(args[5]),
            "transit_periods": [int(args[6]), int(args[7])],
            "weight_16ths": int(args[3]),
            "capacity_multiplier": int(args[4], 16),
            "is_freight": args[8] == "true",
            "classes_raw": args[13] if len(args) > 13 else "",
        })
    return items


def main():
    trains = build_trains()
    cargos = build_cargos()
    # один и тот же груз объявлен для нескольких климатов — оставляем первый
    seen = set()
    cargos = [c for c in cargos if not (c["label"] in seen or seen.add(c["label"]))]
    meta = vendor_meta("openttd")
    write_json("vanilla_trains.json", {"meta": meta, "items": trains})
    write_json("vanilla_cargos.json", {"meta": meta, "items": cargos})
    print(f"vanilla: {len(trains)} trains, {len(cargos)} cargos")
    if not trains or not cargos:
        sys.exit("не удалось распарсить ванильные таблицы")


if __name__ == "__main__":
    main()
