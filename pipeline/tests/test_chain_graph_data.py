"""What the chain graph needs from the FIRS data: pictures, colours and the layout tuning.

The tuning anchors are read off vendor/firs/src/economies/steeltown.py — slag is listed
under cargos_with_individual_produce_nodes and the wharf under wormhole_industries.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common import REPO_ROOT, load_json  # noqa: E402

PUBLIC = os.path.join(REPO_ROOT, "web", "public")


class ChainGraphData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.economies = {e["id"]: e for e in load_json("economies.json")["items"]}
        cls.industries = {i["id"]: i for i in load_json("industries.json")["items"]}
        cls.cargos = {c["label"]: c for c in load_json("cargos.json")["items"]}

    def test_every_industry_has_both_pictures(self):
        for economy in self.economies.values():
            for industry_id in economy["industry_ids"]:
                industry = self.industries[industry_id]
                for key in ("image", "image_small"):
                    with self.subTest(industry=industry_id, key=key):
                        self.assertTrue(os.path.exists(os.path.join(PUBLIC, industry[key])))

    def test_every_cargo_of_an_economy_has_a_colour(self):
        palette = load_json("game_palette.json")["colours"]
        self.assertEqual(len(palette), 256)
        for economy in self.economies.values():
            for label in economy["cargo_labels"]:
                colour = self.cargos[label]["colour_by_economy"].get(economy["id"])
                with self.subTest(economy=economy["id"], cargo=label):
                    self.assertIsNotNone(colour)
                    self.assertTrue(0 <= colour < 256)

    def test_cargo_colour_is_the_index_firs_assigns(self):
        # cargo.get_cargo_colour(economy) = valid_cargo_colours[numeric id in the economy]
        # (vendor/firs/src/cargo.py:185, global_constants.py:732): coal is slot 2 of the
        # temperate economy (colour 15) and sits much later in Steeltown (189)
        colours = self.cargos["COAL"]["colour_by_economy"]
        self.assertEqual(colours["BASIC_TEMPERATE"], 15)
        self.assertEqual(colours["STEELTOWN"], 189)

    def test_steeltown_tuning_matches_the_economy_file(self):
        graph = self.economies["STEELTOWN"]["graph"]
        tuning = graph["tuning"]
        self.assertIn("SLAG", tuning["clone_produce"])
        self.assertIn("ACID", tuning["clone_accept"])
        self.assertIn("wharf", tuning["wormhole_industries"])
        # town industries join the wormhole list, as doc_helper adds them; the industry
        # record says which ones they are
        self.assertTrue(self.industries["hardware_store"].get("town_industry"))
        self.assertIn("hardware_store", tuning["wormhole_industries"])
        self.assertEqual(tuning["ranks"][0], {
            "rank": "source", "nodes": ["I:quarry", "I:coal_mine", "I:iron_ore_mine"],
        })

    def test_supply_cargos_are_kept_off_the_graph(self):
        graph = self.economies["STEELTOWN"]["graph"]
        self.assertEqual(graph["supply_labels"], ["FMSP", "ENSP", "WELD", "SEAL"])
        for edge in graph["edges"]:
            self.assertNotIn(edge["from"], graph["excluded_labels"])
            self.assertNotIn(edge["to"], graph["excluded_labels"])
        self.assertNotIn("dot", graph)

    def test_economy_without_clones_has_empty_clone_lists(self):
        # the basic economies tune ranks only (a sink for the port); no cargo is cloned
        tuning = self.economies["BASIC_TEMPERATE"]["graph"]["tuning"]
        self.assertEqual(tuning["clone_produce"], [])
        self.assertEqual(tuning["clone_accept"], [])
        self.assertEqual(tuning["clusters"], [])
