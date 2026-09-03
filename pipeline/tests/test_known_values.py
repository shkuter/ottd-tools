"""Регрессионные тесты сгенерированных JSON против известных эталонов.

Эталоны Iron Horse сверены с https://grf.farm/iron-horse/4.29.0/ (17.08.2026),
FIRS — с исходниками и конверсией NML price_factor -> prop 0x12.
"""
import os
import pathlib
import re
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common import VENDOR, load_json  # noqa: E402
import extract_vanilla as vanilla  # noqa: E402

IRON_HORSE_RAILTYPES = os.path.join(VENDOR, "iron-horse", "src", "railtypes")


class IronHorseKnownValues(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        payload = load_json("trains.json")
        cls.meta = payload["meta"]
        cls.by_id = {t["id"]: t for t in payload["items"]}

    def test_abernant(self):
        # https://grf.farm/iron-horse/4.29.0/html/abernant.html
        t = self.by_id["abernant"]
        self.assertEqual(t["name"], "0-8-4 Abernant")
        self.assertEqual(t["intro_year"], 1905)
        self.assertEqual(t["power_hp"], 1250)
        self.assertEqual(t["speed_mph"], 60)
        self.assertEqual(t["weight_t"], 99)
        self.assertEqual(t["base_track_type"], "RAIL")
        self.assertEqual(t["kind"], "engine")
        # engine ids for savegame matching: base_numeric_id=30080 in
        # vendor/iron-horse/src/vehicles/pony/abernant.py, one id per unit/livery
        self.assertEqual(t["numeric_ids"][0], 30080)

    def test_numeric_ids_are_unique_across_catalogue(self):
        seen = {}
        for t in self.by_id.values():
            for nid in t["numeric_ids"]:
                self.assertNotIn(nid, seen, f"{t['id']} shares id {nid} with {seen.get(nid)}")
                seen[nid] = t["id"]

    def test_lark(self):
        t = self.by_id["lark"]
        self.assertEqual(t["name"], "4-4-2 Lark")
        self.assertEqual(t["intro_year"], 1860)
        self.assertEqual(t["power_hp"], 500)
        self.assertEqual(t["cost_factor"], 18)

    def test_basecost_shifts(self):
        self.assertEqual(self.meta["basecost_shifts"], {
            "build_engine": -2,
            "build_wagon": 1,
            "running_steam": -2,
            "running_diesel": -4,
            # the set states no shift for the electric class; unstated means zero
            "running_electric": 0,
        })

    def test_counts(self):
        self.assertEqual(self.meta["counts"]["engines"], 199)
        self.assertGreater(self.meta["counts"]["wagons"], 1400)

    def test_capacity_multipliers(self):
        self.assertEqual(
            self.meta["capacity_param_multipliers"], [0.33, 0.67, 1, 1.33, 1.77]
        )

    def test_speed_internal(self):
        # internal speed as NML writes property 0x09: for fast vehicles it sits one unit
        # above a naive round(mph * 1.6), else the game would show 111 instead of 112
        self.assertEqual(self.by_id["firebird_cab"]["speed_internal"], 180)
        self.assertEqual(self.by_id["abernant"]["speed_internal"], 96)
        self.assertEqual(self.by_id["bean_feast"]["speed_internal"], 72)
        # the LGV speed follows the same rule; vehicles without LGV keep the field empty
        blaze = self.by_id["blaze_cab"]
        self.assertEqual((blaze["speed_internal"], blaze["speed_lgv_internal"]), (205, 248))
        self.assertIsNone(self.by_id["abernant"]["speed_lgv_internal"])

    def test_speed_internal_shows_the_quoted_mph(self):
        # the game shows (10 * internal) // 16 (strings.cpp) — must match the roster's mph
        for t in self.by_id.values():
            for mph, internal in (
                (t["speed_mph"], t["speed_internal"]),
                (t["speed_lgv_mph"], t["speed_lgv_internal"]),
            ):
                if mph is None:
                    self.assertIsNone(internal, t["id"])
                    continue
                self.assertEqual((10 * internal) // 16, mph, t["id"])

    def test_names_match_the_game(self):
        # имена должны совпадать со списком покупки в игре: докозвой хелпер
        # Iron Horse дописывает рандомизированным вагонам "- Random", в игре
        # они называются как обычные (STR_WAGON_NAME_*)
        randomised = self.by_id["coal_hopper_car_randomised_pony_gen_3B"]
        self.assertEqual(randomised["name"], "Coal Hopper")
        self.assertEqual(
            randomised["name"], self.by_id["coal_hopper_car_type_1_pony_gen_3B"]["name"]
        )
        self.assertFalse([t for t in self.by_id.values() if "Random" in t["name"]])

    def test_retire_early_is_ten_years_late(self):
        """Набор снимает машину на десять лет ПОЗЖЕ (`retire_early = -10`).

        Знак важен: отрицательное значение отодвигает границу, и третья фаза срока
        продажи перестаёт разыгрываться — граница встаёт ровно на её минимум.
        """
        self.assertEqual({t["retire_early"] for t in self.by_id.values()}, {-10})

    def test_variant_group_head_is_a_real_vehicle(self):
        """Средняя секция стареет по кабине: игра берёт возраст у головы группы.

        Голова Iron Horse — обычная покупаемая машина, а не заглушка меню покупки,
        поэтому серия стареет от её даты появления, а не от начала партии.
        """
        middle = self.by_id["blaze_middle_passenger"]
        self.assertEqual(middle["variant_group"], "blaze_cab")

        head = self.meta["variant_groups"]["blaze_cab"]
        self.assertTrue(head["buyable"])
        self.assertEqual(head["intro_year"], self.by_id["blaze_cab"]["intro_year"])

    def test_head_of_its_own_series_has_no_group(self):
        """Машина, которая сама ведёт группу, стареет по себе — синхронизировать не с кем."""
        self.assertIsNone(self.by_id["blaze_cab"]["variant_group"])


class FirsKnownValues(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cargos = {c["id"]: c for c in load_json("cargos.json")["items"]}
        cls.industries = {i["id"]: i for i in load_json("industries.json")["items"]}
        cls.industries_meta = load_json("industries.json")["meta"]
        cls.economies = {e["id"]: e for e in load_json("economies.json")["items"]}

    def test_coal_payment(self):
        coal = self.cargos["coal"]
        self.assertEqual(coal["price_factor_by_economy"]["STEELTOWN"], 86)
        # 86 * 2^21 / 51000 = 3536.4 -> 3536
        self.assertEqual(coal["initial_payment_by_economy"]["STEELTOWN"], 3536)
        self.assertEqual(coal["transit_periods"], [40, 255])

    def test_blast_furnace_chain(self):
        bf = self.industries["blast_furnace"]["economies"]["STEELTOWN"]
        accepts = {e["label"]: e["ratio"] for e in bf["accepts"]}
        produces = {e["label"]: e["value"] for e in bf["produces"]}
        self.assertEqual(accepts, {"IORE": 3, "COKE": 3, "LIME": 2})
        self.assertEqual(produces, {"IRON": 4, "CSTI": 2, "SLAG": 2})
        self.assertEqual(bf["accept_mode"], "all")

    def test_appliance_factory_any3(self):
        af = self.industries["appliance_factory"]["economies"]["STEELTOWN"]
        self.assertEqual(af["accept_mode"], "any_3")
        # "any three of them" is not a rule of its own: every input is ratio 3, so any three
        # reach the ceiling of 8 the conversion divides by
        self.assertEqual([e["ratio"] for e in af["accepts"]], [3, 3, 3, 3, 3])

    def test_supply_window(self):
        # 27 remembered production cycles of 256 ticks each. Secondaries store 28 in a
        # countdown and lose one per cycle, which is the same 27 (produce_secondary.pynml)
        self.assertEqual(self.industries_meta["supply_window_ticks"], 27 * 256)

    def test_supply_pool_thresholds(self):
        # mines and farms take the parameter defaults as they are; the industry multiplier is 1
        mine = self.industries["coal_mine"]["supply_pool"]
        self.assertEqual(mine["level1"], {"threshold": 16, "production_percent": 150})
        self.assertEqual(mine["level2"], {"threshold": 80, "production_percent": 250})
        # ports multiply both thresholds by 8, and pool every cargo they accept into one count
        port = self.industries["port"]["supply_pool"]
        self.assertEqual(port["level1"], {"threshold": 128, "production_percent": 150})
        self.assertEqual(port["level2"], {"threshold": 640, "production_percent": 250})

    def test_supply_pool_only_where_supplies_drive_production(self):
        # secondaries convert what they are fed instead of pooling it, and FIRS marks some
        # primaries as taking no supplies at all — neither carries a pool
        self.assertNotIn("supply_pool", self.industries["blast_furnace"])
        no_supplies = [
            i for i in self.industries.values()
            if i["type"] == "IndustryPrimaryNoSupplies"
        ]
        self.assertTrue(no_supplies)
        for industry in no_supplies:
            self.assertNotIn("supply_pool", industry)

    def test_version(self):
        # data must come from the release tag, not master: master already renamed
        # liquids_terminal back to oil_terminal
        meta = load_json("meta.json")
        self.assertEqual(meta["firs"], "5.2.0")
        self.assertIn("liquids_terminal", self.industries)
        self.assertNotIn("oil_terminal", self.industries)

    def test_economies(self):
        self.assertEqual(
            set(self.economies),
            {"BASIC_TEMPERATE", "BASIC_ARCTIC", "BASIC_TROPIC", "STEELTOWN", "IN_A_HOT_COUNTRY"},
        )
        self.assertEqual(self.economies["STEELTOWN"]["name"], "Steeltown")

    def test_steeltown_graph_has_coal_chain(self):
        edges = self.economies["STEELTOWN"]["graph"]["edges"]
        self.assertIn({"from": "coal_mine", "to": "COAL", "kind": "produces"}, edges)
        consumers = [e["to"] for e in edges if e["kind"] == "accepts" and e["from"] == "COAL"]
        self.assertIn("coke_oven", consumers)


class VehicleTrackTypes(unittest.TestCase):
    """Which track a vehicle runs on, and what it draws power from there."""

    @classmethod
    def setUpClass(cls):
        cls.by_id = {t["id"]: t for t in load_json("trains.json")["items"]}

    def test_narrow_gauge_vehicle(self):
        t = self.by_id["bean_feast"]
        self.assertEqual(t["base_track_type"], "NG")
        self.assertEqual(t["track_types"], ["NAAN"])

    def test_electric_vehicle_runs_under_the_wires_only(self):
        t = self.by_id["pinhorse"]
        self.assertEqual(t["track_types"], ["ELRL"])
        self.assertEqual(sorted(t["power_by_source"]), ["OHLE"])

    def test_electro_diesel_states_both_tracks_and_both_powers(self):
        # Shoebox: 2500hp under the wires, 950hp on its own — the calculator picks by
        # the chosen track, so both figures have to survive extraction
        t = self.by_id["shoebox"]
        self.assertEqual(sorted(t["track_types"]), ["ELRL", "RAIL"])
        self.assertEqual(t["power_by_source"], {"DIESEL": 950, "OHLE": 2500})

    def test_high_speed_vehicle_carries_a_second_speed(self):
        t = self.by_id["blaze_cab"]
        self.assertTrue(t["lgv_capable"])
        self.assertIn("LGVN", t["track_types"])
        self.assertEqual(t["speed_mph"], 128)
        self.assertEqual(t["speed_lgv_mph"], 155)
        self.assertGreater(t["speed_lgv_internal"], t["speed_internal"])


class Railtypes(unittest.TestCase):
    """Track types of both sets, and the masks that decide what runs on them.

    Vanilla masks are the game's own table (table/railtypes.h); Iron Horse states only
    the *other* types a type relates to, plus labels of sets that are not installed, so
    the extractor normalises both into one shape.
    """

    @classmethod
    def setUpClass(cls):
        cls.iron_horse = {rt["label"]: rt for rt in load_json("trains.json")["meta"]["railtypes"]}
        cls.vanilla = {
            rt["label"]: rt for rt in load_json("vanilla_trains.json")["meta"]["railtypes"]
        }

    def test_vanilla_is_the_games_four(self):
        self.assertEqual(list(self.vanilla), ["RAIL", "ELRL", "MONO", "MGLV"])
        # rail_type.h:20 — the label is MGLV; MAGLEV is the family name, not a label
        self.assertIn("MGLV", self.vanilla)

    def test_vanilla_masks_match_the_game(self):
        # railtypes.h: a plain engine is powered on electrified track as well,
        # an electric one only under the wires, but it travels on both
        self.assertEqual(self.vanilla["RAIL"]["powered"], ["RAIL", "ELRL"])
        self.assertEqual(self.vanilla["ELRL"]["powered"], ["ELRL"])
        self.assertEqual(sorted(self.vanilla["ELRL"]["compatible"]), ["ELRL", "RAIL"])
        self.assertEqual(self.vanilla["MGLV"]["powered"], ["MGLV"])

    def test_vanilla_acceleration_types_match_the_game(self):
        # table/railtypes.h "acceleration type": plain and electrified rail share the normal
        # model, monorail and maglev have their own. The number steps the braking cap
        # (train_settings.h: 120 + 48 per step), so it is the value that matters, not the name
        self.assertEqual(
            [self.vanilla[label]["acceleration_type"] for label in ("RAIL", "ELRL", "MONO", "MGLV")],
            [0, 0, 1, 2],
        )

    def test_unknown_acceleration_model_stops_the_extractor(self):
        # a fourth model would step the braking cap by a number nobody wrote down, so the
        # extractor says so instead of quietly reading it as plain rail
        with self.assertRaises(SystemExit):
            vanilla.acceleration_type("Hyperloop")

    def test_iron_horse_names_one_acceleration_model_for_every_type(self):
        # the extractor writes 0 for every type the set defines; that is only right while the
        # set states one model for all of them, so the template is what this checks
        template = os.path.join(VENDOR, "iron-horse", "src", "templates", "railtype.pynml")
        with open(template, encoding="utf-8") as f:
            models = re.findall(r"acceleration_model:\s*(\w+)", f.read())
        self.assertEqual(set(models), {"ACC_MODEL_RAIL"}, "Iron Horse now varies the model")
        self.assertEqual({rt["acceleration_type"] for rt in self.iron_horse.values()}, {0})

    def test_vanilla_maintenance_multipliers_match_the_game(self):
        # table/railtypes.h "maintenance cost multiplier": what a piece of this track
        # costs to own each month, before the infrastructure base price
        self.assertEqual(
            [rt["maintenance_multiplier"] for rt in self.vanilla.values()], [8, 12, 16, 24]
        )

    @unittest.skipUnless(os.path.exists(vanilla.RAILTYPES_H), "нужен vendor/openttd (make fetch)")
    def test_vanilla_reads_each_multiplier_from_its_own_field(self):
        """The two multipliers must not be read off one field.

        The game's four types state the same number for both (8/8, 12/12, 16/16, 24/24),
        so comparing extracted values against the table proves nothing: an extractor
        reading the maintenance field for both would pass. Feed it a table where they
        differ instead.
        """
        text = vanilla.read(vanilla.RAILTYPES_H)
        shifted = text.replace(
            "/* cost multiplier */", "/* cost multiplier */ 100 +", 4
        )
        with tempfile.NamedTemporaryFile("w", suffix=".h", delete=False, encoding="utf-8") as f:
            f.write(shifted)
            path = f.name
        original, vanilla.RAILTYPES_H = vanilla.RAILTYPES_H, path
        try:
            parsed = {rt["label"]: rt for rt in vanilla.parse_railtypes()}
        finally:
            vanilla.RAILTYPES_H = original
            os.unlink(path)
        self.assertEqual([rt["cost_multiplier"] for rt in parsed.values()], [100] * 4)
        self.assertEqual(
            [rt["maintenance_multiplier"] for rt in parsed.values()], [8, 12, 16, 24]
        )

    @unittest.skipUnless(
        os.path.exists(IRON_HORSE_RAILTYPES), "нужен vendor/iron-horse (make fetch)"
    )
    def test_iron_horse_cost_multipliers_come_from_the_set(self):
        """Compared against the set's own source, not against constants written here.

        `railtype.py` assigns both attributes from `construction_cost`, so the two
        multipliers come out equal for every type of this set; a test on the numbers
        alone would not notice the extractor reading the other one.
        """
        declared = {}
        for path in pathlib.Path(IRON_HORSE_RAILTYPES).glob("*.py"):
            source = path.read_text(encoding="utf-8")
            label = re.search(r"label=\"(\w{4})\"", source)
            cost = re.search(r"construction_cost=(\d+|None)", source)
            if label and cost:
                declared[label.group(1)] = None if cost.group(1) == "None" else int(cost.group(1))
        self.assertEqual(sorted(declared), sorted(self.iron_horse))
        for label, cost in declared.items():
            expected = self.vanilla[label]["cost_multiplier"] if cost is None else cost
            self.assertEqual(self.iron_horse[label]["cost_multiplier"], expected, label)

    def test_iron_horse_maintenance_multipliers_are_what_reaches_the_grf(self):
        # railtype.py assigns `self.maintenance_cost = kwargs.get("construction_cost")`,
        # so what the set declares as maintenance_cost never reaches the game: narrow
        # gauge declares 7 and costs 5. Should the set fix that, this test says so.
        self.assertEqual(self.iron_horse["NAAN"]["maintenance_multiplier"], 5)
        self.assertEqual(self.iron_horse["MTRO"]["maintenance_multiplier"], 10)
        self.assertEqual(self.iron_horse["LGVE"]["maintenance_multiplier"], 16)
        # rail and electrified rail are the game's own types: the set leaves them to it
        self.assertEqual(self.iron_horse["RAIL"]["maintenance_multiplier"], 8)
        self.assertEqual(self.iron_horse["ELRL"]["maintenance_multiplier"], 12)

    def test_no_railtype_states_a_speed_limit(self):
        # neither set limits speed by track: the vehicle decides (max_speed 0 = no limit)
        for table in (self.vanilla, self.iron_horse):
            for rt in table.values():
                self.assertEqual(rt["speed_limit_internal"], 0, rt["label"])

    def test_iron_horse_is_its_six(self):
        self.assertEqual(
            sorted(self.iron_horse), ["ELRL", "LGVE", "LGVN", "MTRO", "NAAN", "RAIL"]
        )
        self.assertEqual(
            sorted(l for l, rt in self.iron_horse.items() if rt["lgv"]), ["LGVE", "LGVN"]
        )

    def test_every_type_relates_to_itself(self):
        # narrow gauge states ["NAAE"] and metro states nothing at all; unnormalised,
        # neither would admit a vehicle onto its own track and both catalogues would
        # come up empty
        for table in (self.vanilla, self.iron_horse):
            for label, rt in table.items():
                self.assertIn(label, rt["powered"], label)
                self.assertIn(label, rt["compatible"], label)

    def test_masks_name_only_types_of_this_set(self):
        # the set keeps legacy labels of other grfs (NAAE, IHA_, IHB_, IHBA) in its lists
        for table in (self.vanilla, self.iron_horse):
            known = set(table)
            for label, rt in table.items():
                self.assertLessEqual(set(rt["powered"]), known, label)
                self.assertLessEqual(set(rt["compatible"]), known, label)

    def test_a_hidden_type_is_marked_as_such(self):
        # lgv.py: RAILTYPE_FLAG_HIDDEN — the set defines plain LGV so high speed vehicles
        # stay compatible with ordinary track, but the game keeps it out of the build menu
        self.assertTrue(self.iron_horse["LGVN"]["hidden"])
        self.assertFalse(self.iron_horse["LGVE"]["hidden"])
        # the game hides none of its own
        for rt in self.vanilla.values():
            self.assertFalse(rt["hidden"], rt["label"])

    def test_powered_implies_compatible(self):
        # the rule is the game's, not the sets': a type you draw power on is one you can
        # travel on (newgrf_act0_railtypes.cpp)
        for table in (self.vanilla, self.iron_horse):
            for label, rt in table.items():
                self.assertLessEqual(set(rt["powered"]), set(rt["compatible"]), label)

    def test_borrowed_types_carry_the_games_names(self):
        # rail and electrified rail belong to the game, so Iron Horse names neither
        self.assertEqual(self.iron_horse["RAIL"]["name"], self.vanilla["RAIL"]["name"])
        self.assertEqual(self.iron_horse["ELRL"]["name"], self.vanilla["ELRL"]["name"])

    def test_high_speed_types_share_one_name(self):
        # english.toml:675,694 — the set names both LGV types the same string, so the
        # interface has to tell them apart itself
        self.assertEqual(self.iron_horse["LGVN"]["name"], self.iron_horse["LGVE"]["name"])

    def test_vehicles_reference_known_types(self):
        for train in load_json("trains.json")["items"]:
            self.assertLessEqual(set(train["track_types"]), set(self.iron_horse), train["id"])
        for train in load_json("vanilla_trains.json")["items"]:
            self.assertIn(train["railtype"], self.vanilla, train["id"])


class VanillaSpriteIds(unittest.TestCase):
    """Base-set sprite numbers: they address OpenGFX2 graphics directly.

    Computed from the game tables (train_sprites.h, sprites.h) and verified by
    decoding ogfx21_base_8.grf from OpenGFX2 Classic 0.8.1.
    """

    @classmethod
    def setUpClass(cls):
        cls.trains = {t["id"]: t for t in load_json("vanilla_trains.json")["items"]}
        cls.cargos = {c["id"]: c for c in load_json("vanilla_cargos.json")["items"]}

    def test_kirby_paul_tank(self):
        t = self.trains["vanilla_0"]
        # engines.h: RVI( 2, G,   7,  64,     300,  47,    50, RC_S,  0, R, S)
        self.assertEqual(t["cost_factor"], 7)
        self.assertEqual(t["running_cost_class"], "running_steam")
        self.assertEqual(t["engine_class"], "steam")
        self.assertEqual(t["default_cargos"], [])  # CT_NONE
        self.assertEqual(t["image_index"], 2)
        self.assertEqual(t["sprite_id"], 0x0B6F)  # 28x12 in the set
        self.assertIsNone(t["sprite_id_rear"])

    def test_dual_headed_has_second_half(self):
        # SH '125': the rear half is the next image_index (train_cmd.cpp:555).
        # The pair shares _engine_sprite_base but differs in _engine_sprite_add,
        # so the W view gives base+6 for the front and base+2 for the rear.
        t = self.trains["vanilla_22"]
        self.assertTrue(t["dual_headed"])
        self.assertEqual(t["image_index"], 6)
        self.assertEqual(t["sprite_id"], 0x0B83)
        self.assertEqual(t["sprite_id_rear"], 0x0B7F)

    def test_image_index_within_tables(self):
        # _engine_sprite_base holds 74 entries; going past it breaks the lookup
        self.assertLessEqual(max(t["image_index"] for t in self.trains.values()), 73)

    def test_cargo_labels_are_the_games(self):
        # cargo_type.h: CT_PASSENGERS{"PASS"}, CT_OIL{"OIL_"}, CT_GOODS{"GOOD"}
        self.assertEqual(self.cargos["passengers"]["label"], "PASS")
        self.assertEqual(self.cargos["oil"]["label"], "OIL_")
        self.assertEqual(self.cargos["goods"]["label"], "GOOD")
        self.assertEqual(self.trains["vanilla_22"]["default_cargos"], ["MAIL"])  # SH '125'
        grain_hopper = next(t for t in self.trains.values() if t["name"] == "Grain Hopper")
        self.assertEqual(grain_hopper["default_cargos"], ["GRAI", "WHEA", "MAIZ"])  # MCT_
        self.assertIsNone(grain_hopper["model_life"])  # engine.cpp:141 — wagons never expire

    def test_cargo_icons(self):
        self.assertEqual(self.cargos["passengers"]["sprite_id"], 4297)  # SPR_CARGO_PASSENGERS
        self.assertEqual(self.cargos["coal"]["sprite_id"], 4298)
        self.assertTrue(all(c["sprite_id"] for c in self.cargos.values()))


@unittest.skipUnless(os.path.exists(vanilla.INDUSTRY_H), "нужен vendor/openttd (make fetch)")
class VanillaIndustryTable(unittest.TestCase):
    """The parse of the game's industry table, checked against what the game declares.

    The only tests here that read `vendor/` rather than the committed JSON — everything else
    in this file runs off the data alone. Without the checkout they are skipped, not failed:
    `make fetch` is a separate step from `make test`.

    The table is read as text, so a stray STR_INDUSTRY_NAME_* inside the block would shift
    every type at once and rename a whole party — plausibly, and with nothing else noticing.
    The one figure that can catch it is the count the game states itself.
    """

    def test_committed_count_matches_the_games_constant(self):
        # the JSON is committed and the constant is read from industry_type.h, so this catches
        # data left behind by a release that added or dropped an industry type
        committed = load_json("vanilla_industries.json")["items"]
        self.assertEqual(len(committed), vanilla.new_industry_offset())

    def test_a_shifted_table_stops_the_build(self):
        text = pathlib.Path(vanilla.INDUSTRY_H).read_text(encoding="utf-8")
        marker = "_origin_industry_specs[NEW_INDUSTRYOFFSET] = {"
        # one more name inside the block: exactly the accident this guards against
        shifted = text.replace(marker, marker + "\n\tSTR_INDUSTRY_NAME_COAL_MINE,", 1)
        with tempfile.NamedTemporaryFile("w", suffix=".h", delete=False, encoding="utf-8") as f:
            f.write(shifted)
            path = f.name
        original, vanilla.INDUSTRY_H = vanilla.INDUSTRY_H, path
        try:
            with self.assertRaises(SystemExit) as cm:
                vanilla.build_industries()
            self.assertIn("NEW_INDUSTRYOFFSET", str(cm.exception))
        finally:
            vanilla.INDUSTRY_H = original
            os.unlink(path)


class VanillaIndustries(unittest.TestCase):
    """Industry types of the base game.

    The index in _origin_industry_specs is the IndustryType a savegame stores, so the order
    of this table is what lets an imported vanilla game name its industries at all. Checked
    against the game's own list: a shifted index would rename every industry of a party at
    once, and nothing else would notice.
    """

    @classmethod
    def setUpClass(cls):
        cls.by_type = {i["type"]: i for i in load_json("vanilla_industries.json")["items"]}

    # _origin_industry_specs of OpenTTD 15.3, in its own order. Written out rather than read
    # back from the parse: comparing the parse with itself would pass through any
    # rearrangement, and it is the order that a savegame addresses by number. A release that
    # genuinely reorders the table must update this list on purpose.
    GAME_ORDER = [
        "Coal Mine", "Power Station", "Sawmill", "Forest", "Oil Refinery", "Oil Rig",
        "Factory", "Printing Works", "Steel Mill", "Farm", "Copper Ore Mine", "Oil Wells",
        "Bank", "Food Processing Plant", "Paper Mill", "Gold Mine", "Bank", "Diamond Mine",
        "Iron Ore Mine", "Fruit Plantation", "Rubber Plantation", "Water Supply",
        "Water Tower", "Factory", "Farm", "Lumber Mill", "Candyfloss Forest", "Sweet Factory",
        "Battery Farm", "Cola Wells", "Toy Shop", "Toy Factory", "Plastic Fountains",
        "Fizzy Drink Factory", "Bubble Generator", "Toffee Quarry", "Sugar Mine",
    ]

    def test_types_are_the_games_own_order(self):
        self.assertEqual([self.by_type[t]["name"] for t in sorted(self.by_type)],
                         self.GAME_ORDER)

    def test_ids_come_from_the_game_string(self):
        for industry in self.by_type.values():
            expected = industry["string_key"].removeprefix("STR_INDUSTRY_NAME_").lower()
            self.assertEqual(industry["id"], expected)


if __name__ == "__main__":
    unittest.main()
