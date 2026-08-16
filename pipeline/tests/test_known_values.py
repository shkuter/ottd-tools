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


if __name__ == "__main__":
    unittest.main()
