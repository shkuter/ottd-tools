"""Регрессионные тесты сгенерированных JSON против известных эталонов.

Эталоны Iron Horse сверены с https://grf.farm/iron-horse/4.29.0/ (17.08.2026),
FIRS — с исходниками и конверсией NML price_factor -> prop 0x12.
"""
import json
import os
import unittest

DATA = os.path.join(os.path.dirname(__file__), "..", "..", "web", "src", "data")


def load(name):
    with open(os.path.join(DATA, name)) as f:
        return json.load(f)


class IronHorseKnownValues(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        payload = load("trains.json")
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
        })

    def test_counts(self):
        self.assertEqual(self.meta["counts"]["engines"], 199)
        self.assertGreater(self.meta["counts"]["wagons"], 1400)

    def test_capacity_multipliers(self):
        self.assertEqual(
            self.meta["capacity_param_multipliers"], [0.33, 0.67, 1, 1.33, 1.77]
        )

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


class FirsKnownValues(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cargos = {c["id"]: c for c in load("cargos.json")["items"]}
        cls.industries = {i["id"]: i for i in load("industries.json")["items"]}
        cls.economies = {e["id"]: e for e in load("economies.json")["items"]}

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

    def test_version(self):
        # данные должны собираться с релизного тега, а не с master:
        # в master liquids_terminal уже переименован обратно в oil_terminal
        import json as _json, os as _os
        meta = _json.load(open(_os.path.join(DATA, "meta.json")))
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


class VanillaSpriteIds(unittest.TestCase):
    """Base-set sprite numbers: they address OpenGFX2 graphics directly.

    Computed from the game tables (train_sprites.h, sprites.h) and verified by
    decoding ogfx21_base_8.grf from OpenGFX2 Classic 0.8.1.
    """

    @classmethod
    def setUpClass(cls):
        cls.trains = {t["id"]: t for t in load("vanilla_trains.json")["items"]}
        cls.cargos = {c["id"]: c for c in load("vanilla_cargos.json")["items"]}

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


if __name__ == "__main__":
    unittest.main()
