"""Reading the xUSSR sources: every GRF of the set expands, parses and resolves.

The set is nine separate GRFs built from one repository by the C preprocessor, and the
blocks that decide what a GRF contains are `if`s on its own parameters. A source this
extraction cannot resolve is not a smaller catalogue — it is a silently missing one, so
the counts below are asserted rather than printed.
"""
import os
import re
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import xussr_nml as nml  # noqa: E402

SOURCES = os.path.isdir(nml.XUSSR_ROOT)

# Items each GRF declares once its if/else blocks are resolved at the set's default
# parameters. An item is declared more than once on purpose — the sets state a vehicle
# and then override single properties of it (the long name, a disabled climate) — so
# these count declarations, not vehicles.
EXPECTED = {
    "rails": 72,
    "steam": 233,
    "diesel": 402,
    "dmu": 123,
    "electric": 416,
    "emu": 282,
    "wagons": 406,
    "cars": 206,
    "addon": 101,
}


@unittest.skipUnless(SOURCES, "vendor/xussrset is missing — run make fetch-xussr")
class Sources(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.parsed = {}
        for grf in EXPECTED:
            path = nml.preprocess(f"xussr-{grf}.pnml", os.path.join(cls.tmp.name, f"{grf}.nml"))
            cls.parsed[grf] = nml.parse(path, grf)
        cls.grfids = {
            next(s for s in st if type(s).__name__ == "GRF").grfid.value
            for st in cls.parsed.values()
        }

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def resolve(self, grf):
        statements = self.parsed[grf]
        block = next(s for s in statements if type(s).__name__ == "GRF")
        cargos = {
            c.value for s in statements if type(s).__name__ == "CargoTable" for c in s.cargo_list
        }
        scope = nml.base_scope()
        scope.update(nml.grf_parameters(block))
        scope["functions"] = nml.game_functions(self.grfids, cargos)
        return nml.flatten(statements, scope), scope

    def test_every_grf_resolves(self):
        """No `if` is left unanswered: an unresolved one would drop a whole block of items."""
        for grf, expected in EXPECTED.items():
            with self.subTest(grf=grf):
                statements, _ = self.resolve(grf)
                items = [s for s in statements if type(s).__name__ == "Item"]
                self.assertEqual(len(items), expected)

    def test_defaults_are_the_sets_own(self):
        """Extraction reads the set at its default parameters, not at anyone's game."""
        _, scope = self.resolve("rails")
        self.assertEqual(scope["currents_mode"], 1)
        self.assertEqual(scope["gauge_mode"], 1)
        self.assertEqual(scope["speedlimit_mode"], 1)
        _, scope = self.resolve("electric")
        self.assertEqual(scope["new_costs"], 0)
        self.assertEqual(scope["enable_new_ratios"], 0)


@unittest.skipUnless(SOURCES, "vendor/xussrset is missing — run make fetch-xussr")
class Folding(unittest.TestCase):
    """A condition the running game answers must not take a whole block down with it."""

    def scope(self, **names):
        base = {"functions": {}}
        base.update(names)
        return base

    def parse_expr(self, text):
        statements = nml.parse_text(f"if ({text}) {{ }}\n", "test")
        return statements[0].statements[0].expr

    def test_unknown_side_absorbed(self):
        # `unknown && 0` is 0: the sets gate blocks on "another GRF is loaded AND a
        # parameter says so", and the parameter alone can settle it
        expr = self.parse_expr("undefined_thing && (mode == 4)")
        self.assertEqual(nml.evaluate(expr, self.scope(mode=1)), 0)

    def test_unknown_side_still_unknown(self):
        expr = self.parse_expr("undefined_thing && (mode == 4)")
        with self.assertRaises(nml.Unknown):
            nml.evaluate(expr, self.scope(mode=4))


@unittest.skipUnless(SOURCES, "vendor/xussrset is missing — run make fetch-xussr")
class NewRatiosParameter(unittest.TestCase):
    """`enable_new_ratios` moves station ratings, not vehicle figures.

    The catalogue is extracted at the set's defaults, where the parameter is off, and the
    reference party has it off too — so the benchmarks compare directly. That only holds
    while the parameter gates nothing about vehicles, which is what this asserts at the
    source: every block it guards is a FEAT_CARGOS station_rating override.
    """

    def test_it_gates_station_ratings_only(self):
        path = os.path.join(nml.XUSSR_ROOT, "src", "override", "all-ratios.pnml")
        with open(path, encoding="utf-8") as f:
            text = f.read()
        guarded = re.search(r"if \(enable_new_ratios\)\s*\{(.*?)\n\}", text, re.S)
        self.assertIsNotNone(guarded, "all-ratios.pnml has no enable_new_ratios block")
        body = guarded.group(1)
        features = set(re.findall(r"item\(\s*(FEAT_\w+)", body))
        self.assertEqual(features, {"FEAT_CARGOS"})
        self.assertIn("station_rating", body)
        # and nowhere else in the set does it decide anything
        elsewhere = [
            os.path.join(root, f)
            for root, _, files in os.walk(os.path.join(nml.XUSSR_ROOT, "src"))
            for f in files
            if f.endswith(".pnml") and not f.endswith("all-ratios.pnml")
        ]
        for source in elsewhere:
            with open(source, encoding="utf-8") as f:
                for line in f:
                    if "enable_new_ratios" not in line:
                        continue
                    # the parameter's own declaration in each GRF header is not a use
                    self.assertNotIn("if (", line, f"{source}: {line.strip()}")


@unittest.skipUnless(SOURCES, "vendor/xussrset is missing — run make fetch-xussr")
class BaseCostShifts(unittest.TestCase):
    """The shifts the extractor writes are the ones basecost.pnml states.

    Every money figure of the set rides on them, and the extractor spells them out as
    literals because the parser drops `basecost` blocks. Read from the source here, so a
    set that re-tunes its prices fails the suite instead of quietly changing every price.
    """

    def test_shifts_match_the_source(self):
        path = os.path.join(nml.XUSSR_ROOT, "src", "basecost.pnml")
        with open(path, encoding="utf-8") as f:
            text = f.read()
        # the set states one block per value of its own new_costs parameter; the
        # extractor reads the catalogue at the default, 0
        default_block = re.search(
            r"if \(new_costs == 0\)\s*\{\s*basecost\s*\{(.*?)\}", text, re.S
        )
        self.assertIsNotNone(default_block, "basecost.pnml has no new_costs == 0 block")
        stated = {
            name: int(value)
            for name, value in re.findall(r"(PR_\w+):\s*(-?\d+)\s*;", default_block.group(1))
        }
        self.assertEqual(
            stated,
            {
                "PR_BUILD_VEHICLE_TRAIN": 1,
                "PR_BUILD_VEHICLE_WAGON": 3,
                "PR_RUNNING_TRAIN_STEAM": 0,
                "PR_RUNNING_TRAIN_DIESEL": 0,
                "PR_RUNNING_TRAIN_ELECTRIC": 0,
                "PR_RUNNING_ROADVEH": 0,
            },
        )


if __name__ == "__main__":
    unittest.main()
