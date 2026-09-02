"""Экспорт ТТХ подвижного состава Iron Horse (ростер Pony) в web/src/data/trains.json.

Импортирует модель данных Iron Horse напрямую (без компиляции NewGRF):
рецепт — как в vendor/iron-horse/src/id_report.py.
"""
from common import bootstrap_iron_horse, display_mph, vendor_meta, write_json
# imported before the bootstrap below, which puts the set's own src/ first on sys.path
from extract_vanilla import parse_railtypes as vanilla_railtypes

ih = bootstrap_iron_horse()
iron_horse = ih.iron_horse
global_constants = ih.global_constants
DocHelper = ih.DocHelper
polar_fox_constants = ih.polar_fox_constants


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


def group_leader(model_variant):
    """The model variant this one is a variant *of*, or None when it leads its own group.

    Mirrors get_variant_group_prop_for_model_variant (roster.py): the leader is the first
    member of the group, except that the group's own first member points at the parent
    group instead.
    """
    group = model_variant.variant_group
    leader = group[0]
    if group.parent_group is not None and model_variant == group[0]:
        leader = group.parent_group[0]
    return None if leader == model_variant else leader


def syncs_reliability(model_variant):
    """Does the vehicle ask the game to age it by its group's head?

    Iron Horse adds the flag to every vehicle that sits in a group (train/units.py
    extra_flags), and the game only walks up while the vehicle it stands on carries it
    (engine.cpp CalcEngineReliability).
    """
    return "VEHICLE_FLAG_SYNC_VARIANT_RELIABILITY" in model_variant.units[0].extra_flags


def series_head(model_variant):
    """Head of the variant chain, the vehicle whose age the game uses for this one.

    The game walks the chain up to its root, so a TGV middle car ages by its cab engine.
    """
    head, seen = None, {model_variant.id}
    current = model_variant
    while syncs_reliability(current):
        leader = group_leader(current)
        if leader is None or leader.id in seen:
            return head
        seen.add(leader.id)
        head, current = leader, leader
    return head


def variant_groups(roster, items):
    """Heads of the series the extracted vehicles belong to, by catalogue id.

    Every head here is a vehicle the player can buy — Iron Horse leads a group with a real
    model (a cab engine), not a menu-only placeholder — so the series ages from the head's
    own intro date.
    """
    catalogues = {c.model_id: c for c in roster.catalogues}
    heads = {}
    for train in items:
        key = train["variant_group"]
        if not key or key in heads:
            continue
        catalogue = catalogues[key]
        heads[key] = {
            "item": key,
            "intro_year": catalogue.intro_year,
            "intro_month": 1 + catalogue.example_model_variant.intro_date_months_offset,
            "buyable": True,
        }
    return dict(sorted(heads.items()))


def catalogue_payload(catalogue, dh):
    mv = catalogue.example_model_variant
    head = series_head(mv)
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
        # the vehicle whose age decides when this one leaves the buy menu; None when the
        # vehicle ages by itself — either it heads its own series or the set did not ask
        # for reliability syncing
        "variant_group": head.catalogue.model_id if head else None,
        # the set retires every vehicle 10 years *late* (train/schemas.py retire_early),
        # which fixes the last phase of the buy-menu life at its minimum
        "retire_early": mv.retire_early,
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


def vanilla_maintenance(vanilla, label):
    """The game's upkeep multiplier for a type the set left to it."""
    if label not in vanilla:
        raise SystemExit(
            f"railtype {label}: no maintenance multiplier, and the game has no such type"
        )
    return vanilla[label]["maintenance_multiplier"]


def railtypes_payload(dh):
    """The set's track types, in the same shape as the vanilla table.

    Iron Horse defines rail and electrified rail only to carry their labels (they are
    the game's own types, hence suppress_for_nml): it states neither masks, sort order
    nor names for them, so those come from the game's table.

    The masks need normalising. A NewGRF lists the *other* types a type relates to and
    leaves itself implied (rail.h: "bitmask to the OTHER railtypes"), while the game's
    table names itself as well; and the lists still carry labels of sets that are not
    here (NAAE, IHA_, IHB_, IHBA), kept for compatibility with older grfs. Left as
    stated, narrow gauge and metro would end up relating to nothing at all and admit no
    vehicle onto their own track.
    """
    vanilla = {rt["label"]: rt for rt in vanilla_railtypes()}
    entries = []
    for rt in iron_horse.railtype_manager:
        borrowed = vanilla.get(rt.label) if rt.suppress_for_nml else None
        string_id = f"STR_RAILTYPE_{rt.id.upper()}_NAME"
        entries.append({
            "label": rt.label,
            "string_id": borrowed["string_id"] if borrowed else string_id,
            "name": borrowed["name"] if borrowed else dh.lang_strings[string_id],
            "catenary": (
                borrowed["catenary"] if borrowed
                else "RAILTYPE_FLAG_CATENARY" in (rt.railtype_flags or [])
            ),
            # Iron Horse states no current systems: wires are OHLE, metro is its
            # third rail; a set that does state them fills this per system
            "power_source": (
                ["METRO"] if rt.label == "MTRO"
                else ["OHLE"] if (
                    borrowed["catenary"] if borrowed
                    else "RAILTYPE_FLAG_CATENARY" in (rt.railtype_flags or [])
                )
                else []
            ),
            # RAILTYPE_FLAG_HIDDEN: the set defines the type but the game keeps it out of
            # the build menu (rail.h: "hiding from selection"). Iron Horse hides plain LGV,
            # which exists so high speed vehicles stay compatible with ordinary track — the
            # player never lays it, so it is no route to cost, but the masks still need it.
            "hidden": (
                borrowed["hidden"] if borrowed
                else "RAILTYPE_FLAG_HIDDEN" in (rt.railtype_flags or [])
            ),
            "speed_limit_internal": rt.speed_limit,
            # What the type costs to own, per piece of track per month (rail.h
            # RailMaintenanceCost).
            # Read off the object, not the kwarg: Iron Horse assigns
            # `self.maintenance_cost = kwargs.get("construction_cost")` (railtype.py), so
            # the declared maintenance_cost never reaches the grf — narrow gauge declares
            # 7 and the game charges 5. The template writes this same attribute.
            # None means the set leaves the type to the game (rail, electrified rail).
            "maintenance_multiplier": (
                rt.maintenance_cost if rt.maintenance_cost is not None
                else vanilla_maintenance(vanilla, rt.label)
            ),
            "powered": borrowed["powered"] if borrowed else list(rt.powered_railtype_list),
            "compatible": (
                borrowed["compatible"] if borrowed
                else list(rt.compatible_railtype_list)
            ),
            "lgv": bool(rt.is_lgv_railtype),
            "sort": borrowed["sort"] if borrowed else rt.sort_order,
        })

    known = {rt["label"] for rt in entries}
    for rt in entries:
        for mask in ("powered", "compatible"):
            others = [label for label in rt[mask] if label in known and label != rt["label"]]
            rt[mask] = [rt["label"], *others]
        # a type a vehicle draws power on is one it can travel on: the game states this
        # rule rather than the sets (newgrf_act0_railtypes.cpp: powered implies compatible)
        rt["compatible"] = [
            *rt["compatible"],
            *(label for label in rt["powered"] if label not in rt["compatible"]),
        ]

    entries.sort(key=lambda rt: rt["sort"])
    return entries


def main():
    # variant groups are a post-validation step, and the buy-menu life of a vehicle
    # depends on them: the game ages a variant by its group's head
    iron_horse.main(run_post_validation_steps=True)
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
            "variant_groups": variant_groups(roster, items),
            "railtypes": railtypes_payload(dh),
            # basecost-шифты GRF (см. vendor/iron-horse/src/templates/header.pynml);
            # цена = base << shift * factor / 256
            "basecost_shifts": {
                "build_engine": global_constants.PR_BUILD_VEHICLE_TRAIN,
                "build_wagon": global_constants.PR_BUILD_VEHICLE_WAGON,
                "running_steam": global_constants.PR_RUNNING_TRAIN_STEAM,
                "running_diesel": global_constants.PR_RUNNING_TRAIN_DIESEL,
                # Iron Horse has no electric running-cost vehicles and states no
                # shift for the class; an unstated shift is zero, not a neighbour's
                # (economy.cpp RecomputePrices)
                "running_electric": 0,
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
