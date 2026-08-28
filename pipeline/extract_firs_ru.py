"""Russian names of FIRS cargos and industries, as the game shows them.

FIRS ships English only, but players run a Russian translation built from the same 5.2.0
sources (vendor/firs-ru, see `make fetch-firs-ru`). Every cargo and industry is mapped to
the lang string id FIRS itself declares — `cargo.type_name` and the industry `name`
property — because ids and string ids do not always match (`pipe_shop` is
STR_IND_PIPEWORK_FABRICATOR). Names FIRS leaves to the game (TTD_STR_*) and the whole
vanilla set come from the game's own Russian locale.

Output: web/src/i18n/{cargos,industries}.ru.json
"""
import functools
import json
import os
import re
import tomllib
import argparse
import sys

from common import I18N_DIR, VENDOR, bootstrap_firs, load_json, write_dictionary

fx = bootstrap_firs()
firs = fx.firs
utils = fx.utils

FIRS_RU_TOML = os.path.join(VENDOR, "firs-ru", "russian.toml")
OVERRIDES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ru_overrides.json")

# Short forms for the UI. The translation spells units out inside a sentence
# ("{WEIGHT} стальных заготовок"), which does not fit a table column.
UNITS = {
    "litres": "л",
    "tonnes": "т",
    "bags": "мешков",
    "crates": "ящиков",
    "items": "шт.",
    "passengers": "пасс.",
}
GAME_LANG_DIR = os.path.join(VENDOR, "openttd", "src", "lang")

# Track type names that are ours rather than a translation, and why each has to be.
#
# Iron Horse ships English only (src/lang holds english.toml alone), so its own types have
# nothing to translate from. Two of the game's four are adjectives agreeing with a noun the
# surrounding sentence supplies — "Монорельсовый", "Магнитный" (russian.txt:2985-2990, with
# .m/.n case forms beside them) — and a list of tracks has no such sentence, so those forms
# name nothing on their own. The other two ("Ж/д", "Электрифиц. ж/д") do name their track and
# are taken from the game as they are. Naming the exceptions here rather than in
# ru_overrides.json keeps that file to what it says it is: spelling, letter case and ё over a
# translation, never a name of our own.
RAILTYPES_WITHOUT_A_SOURCE = {
    "STR_RAIL_NAME_MONORAIL": "Монорельсовая ж/д",
    "STR_RAIL_NAME_MAGLEV": "Магнитная ж/д",
    "STR_RAILTYPE_NARROW_GAUGE_NAME": "Узкоколейная ж/д",
    "STR_RAILTYPE_METRO_NAME": "Линия метро",
    "STR_RAILTYPE_LGV_NAME": "Высокоскоростная ж/д",
    "STR_RAILTYPE_LGV_ELECTRIFIED_OHLE_NAME": "Высокоскоростная ж/д",
}

# Leading {G=m} and friends mark grammatical gender for the game's own string system;
# the UI needs the bare nominative.
LANG_MARKUP = re.compile(r"^(?:\{[^}]*\})+")


def load_translation():
    """FIRS string id -> Russian name, from the translation players run.

    Markup and stray whitespace are stripped the same way as in the game's own locale:
    a name that reaches the UI as "{G=f}Кислота" would also sort wrong and make the
    matching ru_overrides.json entry impossible to write.
    """
    if not os.path.exists(FIRS_RU_TOML):
        raise SystemExit(f"{FIRS_RU_TOML} is missing — run make fetch-firs-ru")
    with open(FIRS_RU_TOML, "rb") as f:
        data = tomllib.load(f)
    return {
        key: LANG_MARKUP.sub("", value["base"]).strip()
        for key, value in data.items()
        if "base" in value
    }


def load_game_lang(language="russian"):
    """Game string id -> name, from the game's own locale.

    Case forms (STR_CARGO_PLURAL_COAL.gen) do not match the pattern at all — the id
    stops at the dot — and the UI only ever needs the nominative anyway.
    """
    out = {}
    with open(os.path.join(GAME_LANG_DIR, f"{language}.txt"), encoding="utf-8") as f:
        for line in f:
            match = re.match(r"^(STR_[A-Z0-9_]+)\s*:(.*)$", line)
            if match:
                out[match.group(1)] = LANG_MARKUP.sub("", match.group(2)).strip()
    return out


def load_overrides(resolve, used_string_ids):
    """Fixes applied on top of whichever source names the object, as {string id: name}.

    A fix is keyed by the lang string id the cargo or industry declares, so it reaches a
    name from the FIRS translation and one from the game's own locale alike — the second
    covers what FIRS delegates to the game (TTD_*) and the whole vanilla set.

    Each entry states the string it expects to find, and the string has to be one some
    cargo or industry actually shows: a mismatch means upstream changed the name and the
    fix may no longer apply, an unused string means the fix is dead weight. Either way the
    build stops instead of silently rewriting nothing or the wrong name.
    """
    with open(OVERRIDES, encoding="utf-8") as f:
        entries = json.load(f)["overrides"]
    fixes = {}
    for entry in entries:
        string_id = entry["string_id"]
        if string_id not in used_string_ids:
            raise SystemExit(
                f"ru_overrides.json: {string_id} is not used by any cargo or industry — "
                "drop the fix"
            )
        current = resolve(string_id)
        if current is None:
            raise SystemExit(
                f"ru_overrides.json: {string_id} has no name in the FIRS translation nor in "
                "the game's locale — check the string id"
            )
        if current != entry["from"]:
            raise SystemExit(
                f"ru_overrides.json: {string_id} is {current!r} upstream, "
                f"expected {entry['from']!r} — re-check the fix"
            )
        fixes[string_id] = entry["to"]
    print(f"overrides: {len(entries)} applied")
    return fixes


def translate(string_id, translation, game_lang, fixes=None):
    """Russian name for one lang string id, or None when nothing translates it."""
    if fixes and string_id in fixes:
        return fixes[string_id]
    if string_id.startswith("TTD_"):
        return game_lang.get(string_id[len("TTD_"):])
    return translation.get(string_id)


def cargo_string_ids():
    """cargo id -> lang string id declared by FIRS."""
    return {
        cargo.id: utils.unwrap_nml_string_declaration(cargo.type_name)
        for cargo in firs.cargo_manager
    }


def industry_string_ids(economies):
    """industry id -> lang string id declared by FIRS.

    FIRS allows an industry to be renamed per economy, and the catalogue keeps those
    variants (`name_by_economy`), but a dictionary keyed by industry id can hold only one
    name — i18n/names.ts would then show the base name in Russian and the per-economy one
    in English. No industry uses this today, so the build stops rather than pick a variant.
    """
    out = {}
    for industry in firs.industry_manager:
        ids = []
        for economy in economies:
            variation = industry.economy_variations.get(economy.id)
            if variation is None or not variation.enabled:
                continue
            ids.append(
                utils.unwrap_nml_string_declaration(industry.get_property("name", economy))
            )
        if not ids:
            continue
        if len(set(ids)) > 1:
            raise SystemExit(
                f"{industry.id} is named per economy ({sorted(set(ids))}) — the Russian "
                "dictionary is keyed by industry id and cannot hold both"
            )
        out[industry.id] = ids[0]
    return out


def collisions(names, sources):
    """Names shared by more than one id, as {name: [(id, source string id), ...]}."""
    by_name = {}
    for id_, name in names.items():
        if name:
            by_name.setdefault(name, []).append((id_, sources.get(id_, "?")))
    return {name: ids for name, ids in by_name.items() if len(ids) > 1}


def check_name_collisions(economies, cargos, industries, cargo_sources, industry_sources,
                          vanilla_sources):
    """Two objects of the same kind must read differently where they are seen together.

    The graph and the pickers address an industry by id but show it by name, so two
    industries of one economy under one name are indistinguishable there. Cargos and
    industries live in separate lists, and industries of different economies are never
    seen side by side, so only those pairs are compared. The names come from two sources
    (the game's own locale and the FIRS translation), which is why the sources are named
    in the error: a fix has to go into whichever one is wrong.
    """
    groups = []
    for economy in economies:
        eco_cargos = {c.id: cargos.get(c.id) for c in economy.cargos}
        eco_industries = {
            industry.id: industries.get(industry.id)
            for industry in firs.industry_manager
            if (industry.economy_variations.get(economy.id) is not None
                and industry.economy_variations[economy.id].enabled)
        }
        groups.append((f"economy {economy.id}", "cargos", eco_cargos, cargo_sources))
        groups.append((f"economy {economy.id}", "industries", eco_industries, industry_sources))
    # With FIRS switched off the whole vanilla set is one list, so it is its own group.
    vanilla = {id_: cargos.get(id_) for id_ in vanilla_sources}
    groups.append(("vanilla set", "cargos", vanilla, vanilla_sources))

    for where, kind, names, sources in groups:
        found = collisions(names, sources)
        if found:
            lines = [
                f"  {name!r}: " + ", ".join(f"{id_} ({src})" for id_, src in sorted(ids))
                for name, ids in sorted(found.items())
            ]
            raise SystemExit(
                f"{where}: {kind} share a name — the UI cannot tell them apart:\n"
                + "\n".join(lines)
            )


def vanilla_cargo_names(game_lang, fixes=None):
    """vanilla cargo id -> Russian name.

    extract_vanilla.py records the STR_CARGO_PLURAL_* the game itself uses for the cargo,
    so the name is translated through that id — matching back through the English text
    would break on any two cargos sharing a name.
    """
    fixes = fixes or {}
    return {
        cargo["id"]: fixes.get(cargo["str_plural"]) or game_lang.get(cargo["str_plural"])
        for cargo in load_json("vanilla_cargos.json")["items"]
    }


def vanilla_industry_names(game_lang, fixes=None):
    """vanilla industry id -> Russian name.

    Same route as the vanilla cargos: extract_vanilla.py records the STR_INDUSTRY_NAME_*
    the game itself uses, and the name is translated through that id rather than matched
    back through the English text.
    """
    fixes = fixes or {}
    return {
        industry["id"]: fixes.get(industry["string_key"]) or game_lang.get(industry["string_key"])
        for industry in load_json("vanilla_industries.json")["items"]
    }


def merge_game_names(names, from_game, kind):
    """Folds the game's own names into the FIRS ones, in place, keyed by id.

    The vanilla set shares ids with FIRS where it is the same object; where it is not (WOOD is
    vanilla "wood" and FIRS "logs") the ids differ and both names survive. A shared id whose
    two names disagree would silently lose one of them — and with it any ru_overrides.json fix
    written for that name — so it stops the build instead of being last-write-wins.
    """
    for id_, name in from_game.items():
        if not name:
            continue
        if names.get(id_) not in (None, name):
            raise SystemExit(
                f"{kind} {id_} is {names[id_]!r} in FIRS and {name!r} in the game — "
                f"the dictionary is keyed by {kind} id and cannot hold both"
            )
        names[id_] = name


def units_payload(cargos_data):
    """Units used by the data, checked so a new one cannot slip through untranslated."""
    used = {c["units"] for c in cargos_data if c.get("units")}
    unknown = sorted(used - set(UNITS))
    if unknown:
        raise SystemExit(f"no Russian form for units: {unknown}")
    return {unit: UNITS[unit] for unit in sorted(used)}


@functools.cache
def railtype_string_ids():
    """Track type label -> the lang string id it names itself by, across both sets.

    A label means the same track in either set — RAIL is the game's plain rail whoever
    ships it — so one dictionary serves both, unlike cargo ids, which collide.

    Cached because both callers here want the same table and it costs two file reads; the
    data files do not change while the extractor runs.
    """
    string_ids = {}
    for source in ("trains.json", "vanilla_trains.json"):
        for railtype in load_json(source)["meta"]["railtypes"]:
            string_ids[railtype["label"]] = railtype["string_id"]
    return string_ids


def railtype_names(game_lang, fixes=None):
    """Russian names for every track type of both sets, keyed by label.

    Same route as the vanilla cargos: the name is translated through the string id the type
    declares, with the table above standing in where the source has no usable name.
    """
    fixes = fixes or {}
    # A fix cannot double as a name of ours: ru_overrides.json is for spelling, case and ё on
    # top of somebody else's translation, and a track type we name ourselves has no such
    # translation behind it. Silently ignoring the fix would leave a dead entry that reads
    # like it is doing something, so the build says which file the name belongs in.
    clashing = sorted(set(fixes) & set(RAILTYPES_WITHOUT_A_SOURCE))
    if clashing:
        raise SystemExit(
            f"ru_overrides.json: {', '.join(clashing)} — this track type is named in "
            "RAILTYPES_WITHOUT_A_SOURCE, so edit the name there rather than fixing it here"
        )
    names = {}
    for label, string_id in railtype_string_ids().items():
        # a name of ours outranks the game's string, which a list cannot use as it stands;
        # ru_overrides.json holds fixes *on top of someone else's translation* and never a
        # name of our own, so it does not get to overrule the table (see the check above)
        name = (
            RAILTYPES_WITHOUT_A_SOURCE.get(string_id)
            or fixes.get(string_id)
            or game_lang.get(string_id)
        )
        if not name:
            raise SystemExit(
                f"no Russian name for track type {label} ({string_id}) — add it to "
                "RAILTYPES_WITHOUT_A_SOURCE, or fix the string id"
            )
        names[label] = name
    return names


def main(check=False):
    firs.main()
    economies = list(firs.economy_manager)
    game_lang = load_game_lang()
    cargo_strings = cargo_string_ids()
    industry_strings = industry_string_ids(economies)
    translation = load_translation()
    vanilla_sources = {
        cargo["id"]: cargo["str_plural"] for cargo in load_json("vanilla_cargos.json")["items"]
    }
    vanilla_industry_sources = {
        industry["id"]: industry["string_key"]
        for industry in load_json("vanilla_industries.json")["items"]
    }
    railtype_strings = railtype_string_ids()
    fixes = load_overrides(
        # a fix can name a string of the FIRS translation, one the set delegates to the
        # game (TTD_*), or one that only ever lived in the game's locale — track types
        lambda string_id: (
            translate(string_id, translation, game_lang) or game_lang.get(string_id)
        ),
        set(cargo_strings.values()) | set(industry_strings.values())
        | set(vanilla_sources.values()) | set(vanilla_industry_sources.values())
        | set(railtype_strings.values()),
    )
    cargos = {
        id_: translate(string_id, translation, game_lang, fixes)
        for id_, string_id in cargo_strings.items()
    }
    industries = {
        id_: translate(string_id, translation, game_lang, fixes)
        for id_, string_id in industry_strings.items()
    }
    merge_game_names(cargos, vanilla_cargo_names(game_lang, fixes), "cargo")
    merge_game_names(industries, vanilla_industry_names(game_lang, fixes), "industry")

    check_name_collisions(
        economies, cargos, industries, cargo_strings, industry_strings, vanilla_sources
    )
    missing = sorted(k for k, v in {**cargos, **industries}.items() if not v)
    if missing:
        raise SystemExit(
            f"no Russian name for {missing} — the translation is behind the data sources"
        )
    cargos_data = load_json("cargos.json")["items"]
    ok = write_dictionary(os.path.join(I18N_DIR, "cargos.ru.json"), {
        "names": {id_: name for id_, name in cargos.items() if name},
        "units": units_payload(cargos_data),
    }, check)
    ok &= write_dictionary(os.path.join(I18N_DIR, "industries.ru.json"), {
        id_: name for id_, name in industries.items() if name
    }, check)
    railtypes = railtype_names(game_lang, fixes)
    ok &= write_dictionary(os.path.join(I18N_DIR, "railtypes.ru.json"), railtypes, check)
    print(f"cargos: {len(cargos)}, industries: {len(industries)}, "
          f"railtypes: {len(railtypes)}")
    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--check",
        action="store_true",
        help="report whether the committed dictionaries drifted, write nothing",
    )
    main(**vars(parser.parse_args()))
