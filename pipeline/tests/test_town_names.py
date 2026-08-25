"""Guards for the English (Original) town name tables.

The reference names are computed by the same algorithm the game uses
(townname.cpp: MakeEnglishOriginalTownName + SeedChance), so a change in the
extracted word tables shows up as a changed name.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from common import load_json  # noqa: E402

REPLACEMENTS = [
    ("Ce", "Ke"), ("Ci", "Ki"), ("Cunt", "East"), ("Slag", "Pits"),
    ("Slut", "Edin"), ("Drar", "Quar"), ("Dreh", "Bash"), ("Frar", "Shor"),
    ("Grar", "Aber"), ("Brar", "Over"), ("Wrar", "Inve"),
]


def seed_chance(shift, count, seed):
    return (((seed >> shift) & 0xFFFF) * min(count, 0xFFFF)) >> 16


def seed_chance_bias(shift, count, seed, bias):
    return seed_chance(shift, count + bias, seed) - bias


def english_original_name(tables, seed):
    name = ""
    i = seed_chance_bias(0, len(tables["1"]), seed, 50)
    if i >= 0:
        name += tables["1"][i]
    name += tables["2"][seed_chance(4, len(tables["2"]), seed)]
    name += tables["3"][seed_chance(7, len(tables["3"]), seed)]
    name += tables["4"][seed_chance(10, len(tables["4"]), seed)]
    name += tables["5"][seed_chance(13, len(tables["5"]), seed)]
    i = seed_chance_bias(15, len(tables["6"]), seed, 60)
    if i >= 0:
        name += tables["6"][i]
    for org, rep in REPLACEMENTS:
        if name.startswith(org):
            name = rep + name[len(org):]
    return name


class EnglishOriginalTables(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tables = load_json("town_names.json")["english_original"]

    def test_table_sizes(self):
        # table/townname.h, _name_original_english_1..6
        sizes = {k: len(v) for k, v in self.tables.items()}
        self.assertEqual(sizes, {"1": 4, "2": 26, "3": 8, "4": 7, "5": 23, "6": 9})

    def test_known_seeds(self):
        for seed, expected in [
            (0x0, "Invenville"),
            (0x499602D2, "Fladingbury"),
            (0xDEADBEEF, "Sleburg"),
            (0xFFFFFFFF, "Fort Wenfingburg Springs"),
        ]:
            self.assertEqual(english_original_name(self.tables, seed), expected)
