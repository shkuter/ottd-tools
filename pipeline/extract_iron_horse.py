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
        "weight_t": mv.weight or 0,
        "length": mv.length,
        "dual_headed": bool(mv.dual_headed),
        "units": [unit_payload(u) for u in units],
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
