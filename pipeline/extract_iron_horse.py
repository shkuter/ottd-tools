"""Экспорт ТТХ подвижного состава Iron Horse (ростер Pony) в web/src/data/trains.json.

Импортирует модель данных Iron Horse напрямую (без компиляции NewGRF):
рецепт — как в vendor/iron-horse/src/id_report.py.
"""
from common import bootstrap_iron_horse, vendor_meta, write_json

ih = bootstrap_iron_horse()
iron_horse = ih.iron_horse
global_constants = ih.global_constants
DocHelper = ih.DocHelper
polar_fox_constants = ih.polar_fox_constants


def display_mph(internal):
    """Speed the game shows for an internal speed (strings.cpp ConvertKmhishSpeedToDisplaySpeed)."""
    return (10 * internal) // 16


def speed_internal(mph):
    """Internal speed the GRF carries, as NML writes train property 0x09.

    Iron Horse quotes speed in mph (templates/properties.pynml), NML converts it to the
    game's internal unit (x 8/5, rounded) and then nudges the result by +-1 until the game
    displays exactly the quoted mph -- nml/actions/action0.py adjust_value together with
    action0properties.ottd_display_speed. Without that nudge fast vehicles land one unit
    low (112 mph -> 179 instead of 180), and the km/h the calculator shows would differ
    from the game by 1.
    """
    if mph is None:
        return None
    value = int(mph * 8 / 5 + 0.5)
    while display_mph(value) > mph:
        value -= 1
    lower = value
    while display_mph(value) < mph:
        value += 1
    higher = value
    if abs(display_mph(lower) - mph) < abs(display_mph(higher) - mph):
        return lower
    return higher


def unit_payload(unit):
    return {
        "capacities": unit.capacities,
        "length": unit.vehicle_length,
        "weight_t": unit.weight or 0,
    }


def game_name(catalogue, dh):
    """Имя как в списке покупки игры.

    Не `dh.unpack_name_string()`: докозвой хелпер Iron Horse дописывает
    рандомизированным вагонам суффикс "- Random" (doc_helper.py), которого в игре
    нет — GRF собирает имя из тех же частей, но контекстом default_name
    (train/schemas.py, name_as_nml_prop).
    """
    mv = catalogue.example_model_variant
    if mv.name is not None:
        # у машин имя задано строкой в питоне, а не через lang-строку
        return mv.name
    parts = mv.get_name_parts(context="default_name")
    return " ".join(dh.lang_strings[part] for part in parts if part is not None)


def catalogue_payload(catalogue, dh):
    mv = catalogue.example_model_variant
    is_engine = catalogue.engine_quacker.quack
    units = list(mv.units)
    capacities = [sum(u.capacities[i] for u in units) for i in range(5)]
    item = {
        "id": catalogue.model_id,
        "name": game_name(catalogue, dh),
        "kind": "engine" if is_engine else "wagon",
        "gen": mv.gen,
        "role": mv.role,
        "subrole": mv.subrole,
        "joker": bool(mv.joker),
        # рандомизированный вагон: ТТХ как у обычного, но вид выбирается случайно.
        # В списке покупки игры он спрятан внутри группы вариантов, поэтому при
        # равных ТТХ показывать и считать надо обычный (см. engine/optimize.ts)
        "randomised": bool(catalogue.wagon_quacker.is_randomised_wagon_type),
        "base_track_type": catalogue.base_track_type,
        "track_types": sorted({t.label for t in mv.track_types}),
        "lgv_capable": bool(mv.lgv_capable),
        "intro_year": catalogue.intro_year,
        # месяц появления: Iron Horse ставит intro date как date(year, 1 + offset, 1)
        # (train/schemas.py introduction_date), поэтому машины одного поколения
        # расползаются по году — в игре они появляются не 1 января
        "intro_month": 1 + mv.intro_date_months_offset,
        "vehicle_life": mv.vehicle_life,
        "model_life": mv.model_life if mv.model_life != "VEHICLE_NEVER_EXPIRES" else None,
        "power_hp": mv.power or 0,
        "power_by_source": mv.power_by_power_source or None,
        "te_coefficient": mv.tractive_effort_coefficient,
        "speed_mph": mv.speed,
        "speed_lgv_mph": mv.speed_on_lgv if mv.lgv_capable else None,
        "speed_internal": speed_internal(mv.speed),
        "speed_lgv_internal": speed_internal(mv.speed_on_lgv if mv.lgv_capable else None),
        "weight_t": mv.weight or 0,
        "length": mv.length,
        "dual_headed": bool(mv.dual_headed),
        "units": [unit_payload(u) for u in units],
        # engine ids as the game knows them (savegame EIDS internal ids): every
        # unit of every livery entry of this catalogue, sorted for stable JSON
        "numeric_ids": sorted(
            {nid for entry in catalogue for nid in entry.unit_numeric_ids}
        ),
        "cost_factor": mv.buy_cost,
        "running_cost_factor": mv.running_cost,
        "running_cost_base": units[0].running_cost_base,
        "capacities": capacities,
        "capacity_label": dh.capacity_formatted_for_docs(catalogue),
        "loading_speed": units[0].loading_speed,
        "default_cargos": list(mv.default_cargos or []),
        # sorted: Iron Horse отдаёт refit-метки множеством, порядок гуляет между запусками
        "refit": {
            "classes": sorted(mv.class_refit_groups or []),
            "labels_allowed": sorted(mv.label_refits_allowed or []),
            "labels_disallowed": sorted(mv.label_refits_disallowed or []),
        },
    }
    return item


def main():
    iron_horse.main()
    roster = iron_horse.roster_manager.active_roster
    dh = DocHelper(roster.get_lang_data("english", context="docs"))

    items = [
        catalogue_payload(c, dh)
        for c in roster.catalogues
        if not c.clone_quacker.quack
    ]
    items.sort(key=lambda i: (i["kind"], i["intro_year"], i["id"]))

    # True clones are hidden from the catalogue, but their engine ids appear in
    # savegames; graft each clone's ids onto the model it was cloned from so a
    # saved train matches the visible entry.
    by_id = {item["id"]: item for item in items}
    for c in roster.catalogues:
        cloned_from = c.model_def.cloned_from_model_def
        if cloned_from is None or cloned_from.model_id not in by_id:
            continue
        target = by_id[cloned_from.model_id]
        target["numeric_ids"] = sorted(
            set(target["numeric_ids"])
            | {nid for entry in c for nid in entry.unit_numeric_ids}
        )

    # Группы refit-классов polar_fox: группа -> allowed/disallowed CC_* —
    # SPA пересекает их с cargo_classes грузов FIRS
    refit_groups = {
        group: {"allowed": rules["allowed"], "disallowed": rules["disallowed"]}
        for group, rules in polar_fox_constants.base_refits_by_class.items()
    }

    payload = {
        "meta": {
            **vendor_meta("iron-horse"),
            "roster": roster.id,
            # basecost-шифты GRF (см. vendor/iron-horse/src/templates/header.pynml);
            # цена = base << shift * factor / 256
            "basecost_shifts": {
                "build_engine": global_constants.PR_BUILD_VEHICLE_TRAIN,
                "build_wagon": global_constants.PR_BUILD_VEHICLE_WAGON,
                "running_steam": global_constants.PR_RUNNING_TRAIN_STEAM,
                "running_diesel": global_constants.PR_RUNNING_TRAIN_DIESEL,
            },
            "capacity_param_multipliers": global_constants.capacity_multipliers,
            "refit_groups": refit_groups,
            "counts": {
                "engines": sum(1 for i in items if i["kind"] == "engine"),
                "wagons": sum(1 for i in items if i["kind"] == "wagon"),
            },
        },
        "items": items,
    }
    write_json("trains.json", payload)


if __name__ == "__main__":
    main()
