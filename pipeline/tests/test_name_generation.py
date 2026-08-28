"""Guards for the Russian name generator: overrides reach every source, names stay distinct."""
import json
import os
import tempfile
import unittest

import extract_firs_ru as ru


class Overrides(unittest.TestCase):
    """A fix is keyed by the string id an object declares, whichever source resolves it."""

    TRANSLATION = {"STR_IND_TIMBER_YARD": "Лесопилка"}
    GAME_LANG = {"STR_INDUSTRY_NAME_SAWMILL": "Лесопилка"}
    USED = {"STR_IND_TIMBER_YARD", "TTD_STR_INDUSTRY_NAME_SAWMILL"}

    def resolve(self, string_id):
        return ru.translate(string_id, self.TRANSLATION, self.GAME_LANG)

    def load(self, entries):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump({"overrides": entries}, f)
            path = f.name
        original, ru.OVERRIDES = ru.OVERRIDES, path
        try:
            return ru.load_overrides(self.resolve, self.USED)
        finally:
            ru.OVERRIDES = original
            os.unlink(path)

    def test_fix_on_a_game_locale_string(self):
        # the name FIRS delegates to the game used to be unreachable for a fix
        fixes = self.load([{
            "string_id": "TTD_STR_INDUSTRY_NAME_SAWMILL",
            "from": "Лесопилка",
            "to": "Лесозавод",
        }])
        self.assertEqual(fixes["TTD_STR_INDUSTRY_NAME_SAWMILL"], "Лесозавод")
        self.assertEqual(
            ru.translate("TTD_STR_INDUSTRY_NAME_SAWMILL", self.TRANSLATION, self.GAME_LANG, fixes),
            "Лесозавод",
        )

    def test_fix_on_a_firs_string(self):
        fixes = self.load([{
            "string_id": "STR_IND_TIMBER_YARD",
            "from": "Лесопилка",
            "to": "Лесной склад",
        }])
        self.assertEqual(
            ru.translate("STR_IND_TIMBER_YARD", self.TRANSLATION, self.GAME_LANG, fixes),
            "Лесной склад",
        )

    def test_stale_fix_stops_the_build(self):
        with self.assertRaises(SystemExit) as cm:
            self.load([{
                "string_id": "STR_IND_TIMBER_YARD",
                "from": "Лесной двор",  # upstream says something else
                "to": "Лесной склад",
            }])
        self.assertIn("re-check the fix", str(cm.exception))

    def test_fix_for_an_unused_string_stops_the_build(self):
        with self.assertRaises(SystemExit) as cm:
            self.load([{"string_id": "STR_IND_NOBODY", "from": "x", "to": "y"}])
        self.assertIn("not used by any cargo or industry", str(cm.exception))


class NameCollisions(unittest.TestCase):
    def test_reports_ids_and_their_sources(self):
        found = ru.collisions(
            {"sawmill": "Лесопилка", "timber_yard": "Лесопилка", "forest": "Лес"},
            {"sawmill": "TTD_STR_INDUSTRY_NAME_SAWMILL", "timber_yard": "STR_IND_TIMBER_YARD"},
        )
        self.assertEqual(list(found), ["Лесопилка"])
        self.assertEqual(
            sorted(found["Лесопилка"]),
            [("sawmill", "TTD_STR_INDUSTRY_NAME_SAWMILL"), ("timber_yard", "STR_IND_TIMBER_YARD")],
        )

    def test_missing_names_are_not_a_collision(self):
        # objects without a translation are reported separately, by their own check
        self.assertEqual(ru.collisions({"a": None, "b": None}, {}), {})


class GameNamesMerge(unittest.TestCase):
    """The base game names objects FIRS also names; the dictionary is keyed by id."""

    def test_game_name_fills_an_id_firs_does_not_have(self):
        names = {"logs": "Брёвна"}
        ru.merge_game_names(names, {"wood": "Древесина"}, "cargo")
        self.assertEqual(names, {"logs": "Брёвна", "wood": "Древесина"})

    def test_same_name_from_both_sources_is_no_conflict(self):
        names = {"coal_mine": "Угольная шахта"}
        ru.merge_game_names(names, {"coal_mine": "Угольная шахта"}, "industry")
        self.assertEqual(names["coal_mine"], "Угольная шахта")

    def test_disagreeing_names_stop_the_build(self):
        # last-write-wins would drop the FIRS name and any override written for it
        with self.assertRaises(SystemExit) as cm:
            ru.merge_game_names({"coal_mine": "Шахта"}, {"coal_mine": "Угольная шахта"},
                                "industry")
        self.assertIn("cannot hold both", str(cm.exception))
        self.assertIn("industry coal_mine", str(cm.exception))

    def test_untranslated_game_name_leaves_the_firs_one(self):
        names = {"coal_mine": "Угольная шахта"}
        ru.merge_game_names(names, {"coal_mine": None}, "industry")
        self.assertEqual(names["coal_mine"], "Угольная шахта")


class RailtypeNames(unittest.TestCase):
    """Where a track type's Russian name is allowed to come from."""

    # the two the game names in a form a list can use; the rest come from
    # RAILTYPES_WITHOUT_A_SOURCE, which is what these cases are about
    GAME_LANG = {
        "STR_RAIL_NAME_RAILROAD": "Ж/д",
        "STR_RAIL_NAME_ELRAIL": "Электрифиц. ж/д",
        "STR_RAIL_NAME_MONORAIL": "Монорельсовый",
    }

    def test_a_name_of_ours_wins_over_the_games_adjective(self):
        # the game says "Монорельсовый", which names nothing on its own; ours is the noun
        names = ru.railtype_names(dict(self.GAME_LANG))
        self.assertEqual(names["MONO"], ru.RAILTYPES_WITHOUT_A_SOURCE["STR_RAIL_NAME_MONORAIL"])
        # and a string the game does state usably is still the game's
        self.assertEqual(names["RAIL"], "Ж/д")

    def test_an_override_cannot_stand_in_for_a_name_of_ours(self):
        # ru_overrides.json fixes somebody else's translation; a name we write ourselves has
        # none behind it, so putting one there is an error rather than a silent no-op
        with self.assertRaises(SystemExit) as cm:
            ru.railtype_names(dict(self.GAME_LANG), {"STR_RAIL_NAME_MONORAIL": "Монорельс"})
        self.assertIn("RAILTYPES_WITHOUT_A_SOURCE", str(cm.exception))

    def test_a_track_type_with_no_name_anywhere_stops_the_build(self):
        with self.assertRaises(SystemExit) as cm:
            ru.railtype_names({})
        self.assertIn("no Russian name for track type", str(cm.exception))


if __name__ == "__main__":
    unittest.main()
