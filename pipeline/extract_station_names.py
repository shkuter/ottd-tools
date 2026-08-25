"""Station name suffixes for the savegame snapshot, in both UI languages.

A station the player did not rename is stored as a string id plus a town
reference: STR_SV_STNAME_* from the game's own lang files, or — when the
station is named after a nearby industry — the industry's nearby_station_name
string from FIRS. English goes to web/src/data/station_names.json, Russian to
web/src/i18n/stations.ru.json (checked by `make check-i18n` like the other
generated dictionaries).

Placeholders are normalised to {TOWN} / {NUM}: the game writes {STRING1} /
{STRING} depending on the language, which is plumbing, not meaning.
"""
import argparse
import os
import re
import sys
import tomllib

from common import DATA_DIR, I18N_DIR, VENDOR, load_json, vendor_meta, write_dictionary

GAME_LANG_DIR = os.path.join(VENDOR, "openttd", "src", "lang")
FIRS_EN_TOML = os.path.join(VENDOR, "firs", "src", "grf", "lang", "english.toml")
FIRS_RU_TOML = os.path.join(VENDOR, "firs-ru", "russian.toml")


LANG_LINE = re.compile(r"^(STR_\w+)\s*:(.*)$")
# Waypoints and buoys are not named by a STR_SV_STNAME_* suffix but by their own format
# strings, with a serial variant used from the second one in a town (strings.cpp:1798).
WAYPOINT_STRINGS = (
    "STR_FORMAT_BUOY_NAME",
    "STR_FORMAT_BUOY_NAME_SERIAL",
    "STR_FORMAT_WAYPOINT_NAME",
    "STR_FORMAT_WAYPOINT_NAME_SERIAL",
)
ID_DIRECTIVE = re.compile(r"^##id\s+(0x[0-9a-fA-F]+)")
PLACEHOLDER = re.compile(r"\{STRING\d?\}")
GENDER_MARKUP = re.compile(r"\{G=[^}]*\}")


def game_suffixes(language):
    """STR_SV_STNAME_* -> template with {TOWN}/{NUM}, plus each one's numeric string id.

    Ids are counted the way the game's string compiler does: ##id pins the counter and
    every string line after it takes the next value. A savegame stores the numeric id, so
    the calculator needs the mapping rather than a hand-kept list.
    """
    path = os.path.join(GAME_LANG_DIR, f"{language}.txt")
    templates = {}
    ids = {}
    next_id = 0
    with open(path, encoding="utf-8") as f:
        for line in f:
            directive = ID_DIRECTIVE.match(line)
            if directive is not None:
                next_id = int(directive.group(1), 16)
                continue
            m = LANG_LINE.match(line)
            if m is None:
                continue
            name, text = m.group(1), m.group(2)
            string_id = next_id
            next_id += 1
            if not name.startswith("STR_SV_STNAME") and name not in WAYPOINT_STRINGS:
                continue
            template = GENDER_MARKUP.sub("", PLACEHOLDER.sub("{TOWN}", text)).strip()
            templates[name] = template.replace("{COMMA}", "{NUM}")
            if name.startswith("STR_SV_STNAME"):
                ids[name] = string_id
    if "STR_SV_STNAME_FALLBACK" not in templates:
        raise SystemExit(f"{path}: no STR_SV_STNAME_* strings found")
    return templates, ids


def used_firs_keys():
    """Suffix string ids the extracted industry set references.

    Mostly STR_STATION_*, but a few industries reuse their own name string
    (peatlands: STR_IND_PEATLANDS). Reading industries.json keeps the set in
    step with the economies actually shipped, so run extract_firs.py first.
    """
    items = load_json("industries.json")["items"]
    keys = {i["station_name_key"] for i in items if "station_name_key" in i}
    if not keys:
        raise SystemExit("industries.json has no station_name_key — run extract_firs.py first")
    return keys


def firs_station_names(path, used):
    """Suffix string id -> name from a FIRS translation file (toml)."""
    with open(path, "rb") as f:
        data = tomllib.load(f)
    out = {
        key: GENDER_MARKUP.sub("", value["base"]).strip()
        for key, value in data.items()
        if (key.startswith("STR_STATION_") or key in used) and "base" in value
    }
    missing = sorted(used - set(out))
    if missing:
        raise SystemExit(f"{path}: no string for {missing}")
    return out


def main(check=False):
    used = used_firs_keys()
    english, ids = game_suffixes("english")
    russian, russian_ids = game_suffixes("russian")
    if russian_ids != ids:
        raise SystemExit("string ids differ between locales — the savegame region moved")
    en = {
        "meta": {
            "openttd": vendor_meta("openttd")["describe"],
            "firs": vendor_meta("firs")["describe"],
        },
        "game": english,
        # numeric string id -> key: a savegame names a station by this id
        "game_ids": {str(string_id): name for name, string_id in ids.items()},
        "firs": firs_station_names(FIRS_EN_TOML, used),
    }
    ru = {
        "game": russian,
        "firs": firs_station_names(FIRS_RU_TOML, used),
    }
    ok = write_dictionary(os.path.join(DATA_DIR, "station_names.json"), en, check)
    ok &= write_dictionary(os.path.join(I18N_DIR, "stations.ru.json"), ru, check)
    print(f"station names: game {len(en['game'])}, firs {len(en['firs'])} (ru {len(ru['firs'])})")
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true",
                        help="verify the committed dictionaries instead of writing")
    args = parser.parse_args()
    main(check=args.check)
