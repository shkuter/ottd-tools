"""English (Original) town name word tables from the game's table/townname.h.

A town in a savegame usually carries a generator seed, not a string; the web
app regenerates the display name with these tables (see townname.cpp,
MakeEnglishOriginalTownName). Only the word lists live here — the algorithm
(SeedChance shifts, prefix replacements) is ported in TypeScript.
"""
import os
import re

from common import VENDOR, vendor_meta, write_json

TABLE = os.path.join(VENDOR, "openttd", "src", "table", "townname.h")
PARTS = [f"_name_original_english_{i}" for i in range(1, 7)]


def parse_tables(text):
    tables = {}
    for name in PARTS:
        m = re.search(
            rf"{name}\[\] = \{{\n(.*?)\n\}};", text, re.DOTALL
        )
        if m is None:
            raise SystemExit(f"{TABLE}: table {name} not found")
        words = re.findall(r'"((?:[^"\\]|\\.)*)"', m.group(1))
        if not words:
            raise SystemExit(f"{TABLE}: table {name} is empty")
        tables[name.rsplit("_", 1)[1]] = words
    return tables


def main():
    with open(TABLE, encoding="utf-8") as f:
        tables = parse_tables(f.read())
    write_json("town_names.json", {
        "meta": vendor_meta("openttd"),
        "english_original": tables,
    })


if __name__ == "__main__":
    main()
