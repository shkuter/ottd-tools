"""Валидация сгенерированных JSON + запись агрегированного meta.json."""
import json
import os
import sys
from datetime import date

from common import DATA_DIR, write_json

errors = []
warnings = []


def check(condition, message):
    if not condition:
        errors.append(message)


def load(name):
    with open(os.path.join(DATA_DIR, name)) as f:
        return json.load(f)


def main():
    trains = load("trains.json")
    cargos = load("cargos.json")
    industries = load("industries.json")
    economies = load("economies.json")

    # --- trains ---
    items = trains["items"]
    counts = trains["meta"]["counts"]
    check(counts["engines"] + counts["wagons"] == len(items), "trains: counts mismatch")
    check(counts["engines"] > 150, f"trains: подозрительно мало движков: {counts['engines']}")
    for t in items:
        check(len(t["capacities"]) == 5, f"trains/{t['id']}: capacities != 5")
        check(t["intro_year"] > 1800, f"trains/{t['id']}: intro_year {t['intro_year']}")
        if t["kind"] == "engine":
            check(t["power_hp"] > 0, f"trains/{t['id']}: движок без мощности")
    shifts = trains["meta"]["basecost_shifts"]
    check(set(shifts) == {"build_engine", "build_wagon", "running_steam", "running_diesel"},
          "trains: basecost_shifts неполные")

    # --- cargos ---
    cargo_labels = {c["label"] for c in cargos["items"]}
    check(len(cargos["items"]) >= 90, f"cargos: мало грузов: {len(cargos['items'])}")
    for c in cargos["items"]:
        check(len(c["transit_periods"]) == 2, f"cargos/{c['id']}: transit_periods != 2")
        for eco, payment in c["initial_payment_by_economy"].items():
            check(payment > 0, f"cargos/{c['id']}: payment <= 0 в {eco}")
        icon_path = os.path.join(DATA_DIR, "..", "..", "public", c["icon"])
        check(os.path.exists(icon_path), f"cargos/{c['id']}: нет иконки {c['icon']}")

    # default_cargos Iron Horse: неизвестные FIRS-лейблы — предупреждение (это не ошибка,
    # cargo table Iron Horse шире набора FIRS)
    unknown = set()
    for t in items:
        unknown |= set(t["default_cargos"]) - cargo_labels
    if unknown:
        warnings.append(f"trains: default_cargos вне FIRS cargo table: {sorted(unknown)}")

    # --- industries ---
    check(len(industries["items"]) >= 80, f"industries: мало: {len(industries['items'])}")
    for ind in industries["items"]:
        for eco_id, eco in ind["economies"].items():
            for entry in eco["accepts"] + eco["produces"]:
                check(entry["label"] in cargo_labels,
                      f"industries/{ind['id']}/{eco_id}: неизвестный груз {entry['label']}")
            if ind["type"] == "IndustrySecondary":
                # суммы ratios в FIRS не нормированы к 8 (metal_works 36, cider_mill 6) —
                # проверяем только тип значений
                for e in eco["accepts"]:
                    check(isinstance(e["ratio"], int) and e["ratio"] > 0,
                          f"industries/{ind['id']}/{eco_id}: некорректный input ratio {e}")

    # --- economies ---
    check(len(economies["items"]) == 5, f"economies: {len(economies['items'])} != 5")
    industry_ids = {i["id"] for i in industries["items"]}
    for eco in economies["items"]:
        node_ids = industry_ids | cargo_labels
        for edge in eco["graph"]["edges"]:
            check(edge["from"] in node_ids and edge["to"] in node_ids,
                  f"economies/{eco['id']}: ребро с неизвестным узлом {edge}")

    for w in warnings:
        print(f"WARN: {w}")
    if errors:
        for e in errors:
            print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    write_json("meta.json", {
        "generated_at": date.today().isoformat(),
        "iron_horse": trains["meta"]["describe"],
        "firs": cargos["meta"]["describe"],
        "schema_version": 1,
    })
    print("validate: OK")


if __name__ == "__main__":
    main()
