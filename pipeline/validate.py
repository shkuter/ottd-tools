"""Валидация сгенерированных JSON + запись агрегированного meta.json."""
import os
import sys
from datetime import date

from common import DATA_DIR, firs_ru_ref, load_json, vendor_meta, write_json

errors = []
warnings = []


def check(condition, message):
    if not condition:
        errors.append(message)


def main():
    trains = load_json("trains.json")
    cargos = load_json("cargos.json")
    industries = load_json("industries.json")
    economies = load_json("economies.json")

    # --- trains ---
    items = trains["items"]
    counts = trains["meta"]["counts"]
    check(counts["engines"] + counts["wagons"] == len(items), "trains: counts mismatch")
    check(counts["engines"] > 150, f"trains: подозрительно мало движков: {counts['engines']}")
    for t in items:
        check(len(t["capacities"]) == 5, f"trains/{t['id']}: capacities != 5")
        check(t["intro_year"] > 1800, f"trains/{t['id']}: intro_year {t['intro_year']}")
        check(1 <= t["intro_month"] <= 12, f"trains/{t['id']}: intro_month {t['intro_month']}")
        if t["kind"] == "engine":
            check(t["power_hp"] > 0, f"trains/{t['id']}: движок без мощности")
    # серии вариантов: голова, названная машиной, должна быть описана в meta — иначе
    # расчёт возраста серии молча свалится на собственную дату машины
    rosters = {
        "trains.json": trains,
        "vanilla_trains.json": load_json("vanilla_trains.json"),
    }
    for source, payload in rosters.items():
        heads = payload["meta"].get("variant_groups", {})
        for head in heads.values():
            check(set(head) == {"item", "intro_year", "intro_month", "buyable"},
                  f"{source}: у головы серии {head.get('item')} не те поля")
            check(head["intro_year"] is None or head["intro_year"] > 1800,
                  f"{source}: голова серии {head['item']}: intro_year {head['intro_year']}")
        for t in payload["items"]:
            key = t.get("variant_group")
            check(key is None or key in heads,
                  f"{source}/{t['id']}: голова серии {key} не описана в meta.variant_groups")

    shifts = trains["meta"]["basecost_shifts"]
    check(set(shifts) == {"build_engine", "build_wagon", "running_steam", "running_diesel",
                          "running_electric"},
          "trains: basecost_shifts неполные")

    # Рода тока, которые умеет разбирать расчёт. Список ведётся руками — как и
    # POWER_SOURCES в engine/tracktypes.ts, откуда он и списан: новый род тока
    # надо назвать в обоих местах, и эта проверка о том напомнит.
    KNOWN_POWER_SOURCES = {
        "OHLE", "METRO", "BATTERY_HYBRID", "DIESEL", "STEAM", "MONORAIL", "MAGLEV",
    }

    # --- railtypes (все наборы) ---
    for source in ("trains.json", "vanilla_trains.json"):
        payload = trains if source == "trains.json" else load_json(source)
        railtypes = payload["meta"].get("railtypes")
        check(bool(railtypes), f"{source}: нет таблицы railtypes")
        known = {rt["label"] for rt in railtypes}
        for rt in railtypes:
            where = f"{source}/{rt['label']}"
            check(len(rt["label"]) == 4, f"{where}: лейбл не 4 символа")
            check(bool(rt["name"]), f"{where}: без имени")
            check(rt["speed_limit_internal"] >= 0, f"{where}: отрицательный лимит скорости")
            # множитель месячного обслуживания куска пути (rail.h RailMaintenanceCost):
            # нулевой означал бы бесплатный путь, которого в игре нет
            check(
                isinstance(rt.get("maintenance_multiplier"), int)
                and rt["maintenance_multiplier"] > 0,
                f"{where}: множитель обслуживания не задан или не положителен",
            )
            # множитель стоимости постройки куска (rail.h RailBuildCost): из него считается
            # цена перевода пути на другой тип. Нулевой означал бы бесплатную стройку
            check(
                isinstance(rt.get("cost_multiplier"), int) and rt["cost_multiplier"] > 0,
                f"{where}: множитель стоимости постройки не задан или не положителен",
            )
            # рода тока, которыми путь питает машину: по ним расходятся и мощность,
            # и предел скорости. Мало проверить форму — род тока, которого расчёт не
            # знает, не назван в его иерархии (POWER_SOURCES, engine/tracktypes.ts)
            # и выбирается молча по порядку ключей JSON, поэтому опечатка обязана падать
            check(isinstance(rt.get("power_source"), list), f"{where}: нет power_source")
            for src in rt["power_source"]:
                check(
                    src in KNOWN_POWER_SOURCES,
                    f"{where}: неизвестный род тока {src!r} — добавьте его в "
                    f"POWER_SOURCES (engine/tracktypes.ts) и сюда",
                )
            for mask in ("powered", "compatible"):
                # normalised on extraction: a type always relates to itself, and every
                # label resolves — otherwise no vehicle is admitted onto its own track
                check(rt["label"] in rt[mask], f"{where}: {mask} без своего типа")
                check(set(rt[mask]) <= known, f"{where}: {mask} ссылается за пределы набора")
        for t in payload["items"]:
            labels = [t["railtype"]] if source == "vanilla_trains.json" else t["track_types"]
            check(set(labels) <= known,
                  f"{source}/{t['id']}: track type вне таблицы: {sorted(set(labels) - known)}")

    # --- cargos ---
    cargo_labels = {c["label"] for c in cargos["items"]}
    check(len(cargos["items"]) >= 90, f"cargos: мало грузов: {len(cargos['items'])}")
    for c in cargos["items"]:
        check(len(c["transit_periods"]) == 2, f"cargos/{c['id']}: transit_periods != 2")
        for eco, payment in c["initial_payment_by_economy"].items():
            check(payment > 0, f"cargos/{c['id']}: payment <= 0 в {eco}")
        icon_path = os.path.join(DATA_DIR, "..", "..", "public", c["icon"])
        check(os.path.exists(icon_path), f"cargos/{c['id']}: нет иконки {c['icon']}")
        # the chain graph paints the cargo in its game colour: one per economy it is in
        for eco in c["initial_payment_by_economy"]:
            colour = c["colour_by_economy"].get(eco)
            check(colour is not None and 0 <= colour < 256,
                  f"cargos/{c['id']}: colour_by_economy[{eco}] вне палитры: {colour}")

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
        for key in ("image", "image_small"):
            path = os.path.join(DATA_DIR, "..", "..", "public", ind[key])
            check(os.path.exists(path), f"industries/{ind['id']}: нет картинки {ind[key]}")
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

    # --- vanilla (используются при отключённых NewGRF) ---
    vanilla_trains = load_json("vanilla_trains.json")["items"]
    vanilla_cargos = load_json("vanilla_cargos.json")["items"]
    check(len(vanilla_trains) > 100, f"vanilla: мало машин: {len(vanilla_trains)}")
    check(len(vanilla_cargos) >= 25, f"vanilla: мало грузов: {len(vanilla_cargos)}")
    kirby = next((t for t in vanilla_trains if t["name"] == "Kirby Paul Tank"), None)
    check(kirby is not None and kirby["cost_factor"] == 7,
          "vanilla: Kirby Paul Tank не найден или цена не 7")
    coal_v = next((c for c in vanilla_cargos if c["label"] == "COAL"), None)
    check(coal_v is not None and coal_v["initial_payment"] == 5916, "vanilla: уголь не 5916")
    # labels must be the game's CargoLabels (cargo_type.h), not CT_* constant names
    check(all(len(c["label"]) == 4 for c in vanilla_cargos), "vanilla: cargo label is not a 4-char CargoLabel")
    check(kirby is not None and kirby["running_cost_class"] == "running_steam",
          "vanilla: Kirby Paul Tank is a steam engine (RVI column h = RC_S)")
    labels_v = [c["label"] for c in vanilla_cargos]
    check(len(labels_v) == len(set(labels_v)), "vanilla: дубли меток грузов")

    # Base-game industries: the type is what a savegame stores, so the anchors below are the
    # ones a party is named by. The count is checked against the game's own constant where
    # the table is parsed (extract_vanilla.build_industries); here the anchors catch a
    # rearrangement that keeps both the count and the ends.
    vanilla_industries = load_json("vanilla_industries.json")["items"]
    by_type = {i["type"]: i for i in vanilla_industries}
    for type_id, id_, name in ((0, "coal_mine", "Coal Mine"),
                               (1, "power_station", "Power Station"),
                               (2, "sawmill", "Sawmill"),
                               (7, "printing_works", "Printing Works"),
                               (36, "sugar_mine", "Sugar Mine")):
        got = by_type.get(type_id)
        check(got is not None and got["id"] == id_ and got["name"] == name,
              f"vanilla: тип {type_id} — не {name} ({got})")
    ids_v = [i["id"] for i in vanilla_industries]
    check(len(ids_v) == len(set(ids_v)), "vanilla: дубли id предприятий")

    # vanilla-mode graphics (make data-opengfx2): a missing set is not a data
    # error, but once the catalogue is built it has to be complete
    public = os.path.join(DATA_DIR, "..", "..", "public")
    if os.path.isdir(os.path.join(public, "icons", "vanilla_trains")):
        for t in vanilla_trains:
            check(os.path.exists(os.path.join(public, "icons", "vanilla_trains", f"{t['id']}.png")),
                  f"vanilla/{t['id']}: no OpenGFX2 sprite")
        for c in vanilla_cargos:
            check(os.path.exists(os.path.join(public, c["icon"])),
                  f"vanilla/{c['id']}: no icon {c['icon']}")
    else:
        warnings.append("vanilla: OpenGFX2 graphics not built, see make data-opengfx2")

    # --- town name tables (savegame snapshot regenerates town names from seeds) ---
    town_tables = load_json("town_names.json")["english_original"]
    check(sorted(town_tables) == ["1", "2", "3", "4", "5", "6"],
          "town_names: english_original must hold tables 1..6")
    # "" is a legitimate word: table 4 in townname.h holds an empty segment
    check(all(tbl and all(isinstance(w, str) for w in tbl) for tbl in town_tables.values()),
          "town_names: empty table or non-string word")

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
        "firs_ru": firs_ru_ref()[:7],
        # names of vanilla cargos and of everything FIRS delegates to the game come from
        # this checkout's locale, so its version belongs next to the NewGRF ones
        "openttd": vendor_meta("openttd")["describe"],
        "schema_version": 1,
    })
    print("validate: OK")


if __name__ == "__main__":
    main()
