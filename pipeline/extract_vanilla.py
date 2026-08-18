"""Экспорт ванильных данных OpenTTD (поезда и грузы) в web/src/data/vanilla_*.json.

Нужны, когда игрок отключает Iron Horse и/или FIRS: расчёт тогда идёт по
дефолтным машинам и грузам игры.

Источники (парсятся текстом, без сборки игры):
  vendor/openttd/src/table/engines.h      — _orig_engine_info (MT/MM/MW) + _orig_rail_vehicle_info
  vendor/openttd/src/table/cargo_const.h  — базовые грузы
  vendor/openttd/src/cargo_type.h         — настоящие метки грузов (CT_OIL -> "OIL_")
  vendor/openttd/src/lang/english.txt     — имена машин и грузов
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
CARGO_TYPE_H = os.path.join(OTTD, "src", "cargo_type.h")
LANG = os.path.join(OTTD, "src", "lang", "english.txt")
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
    """CT_OIL{"OIL_"} -> {"CT_OIL": "OIL_"} — the labels NewGRFs (Iron Horse, FIRS) refer to."""
    return {
        f"CT_{m.group(1)}": m.group(2)
        for m in re.finditer(r'CT_(\w+)\{"(.{4})"\}', read(CARGO_TYPE_H))
    }


def parse_cargo_sprites():
    """SPR_CARGO_<PLURAL> = 4297… — cargo icons in the base set."""
    return {
        m.group(1): int(m.group(2))
        for m in re.finditer(r"SPR_CARGO_(\w+)\s*=\s*(\d+)", read(SPRITES_H))
    }


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
            "railtype": p[9],
            "engine_class": ENGINE_CLASS_KEYS[p[10]],
        })
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
