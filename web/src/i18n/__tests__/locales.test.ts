import { describe, expect, it } from 'vitest';
import { intlLocale, t } from '..';
import {
  cargoName, cargoUnits, industryName, localiseDot, railtypeName, railtypeOptions, sortCargos,
  trainName, trainSetName,
} from '../names';
import { LOCALES, useLocaleStore, type Locale } from '../../state/localeStore';
import firsCargos from '../../data/cargos.json';
import industries from '../../data/industries.json';
import vanillaCargos from '../../data/vanilla_cargos.json';
import vanillaIndustries from '../../data/vanilla_industries.json';
import economies from '../../data/economies.json';
import cargosRu from '../cargos.ru.json';
import industriesRu from '../industries.ru.json';
import stationNames from '../../data/station_names.json';
import stationsRu from '../stations.ru.json';
import railtypesRu from '../railtypes.ru.json';
import trainsJson from '../../data/trains.json';
import vanillaTrainsJson from '../../data/vanilla_trains.json';
import xussrTrainsJson from '../../data/xussr_trains.json';
import trainsXussrRu from '../trains_xussr.ru.json';
import en from '../en.json';
import ru from '../ru.json';

/**
 * Guards the dictionaries the way settings-effect.test.ts guards the settings:
 * a string added to en.json without a translation fails here instead of showing
 * up as English text in the Russian UI.
 */
const dictionaries = { en, ru } as Record<string, Record<string, string>>;

/** Proper nouns and GRF error text that stay English on purpose. */
const KEPT_IN_ENGLISH = new Set([
  'app.title',
  'settings.firs',
  // набор зовётся Base Costs и в русской игре: собственного перевода у него нет
  'settings.basecostGrf',
  'settings.jgrpp',
  'settings.inflationGrfError',
  // JGRPP-специфичная строка без русского перевода в самой игре
  // (vendor/openttd-patches/src/lang/extra/*): в русской игре она тоже английская
  'settings.introRandomisation',
  // имя машины как образец значения в поле: имена машин в игре не переводятся
  'kit.sampleValue',
  // названия самих наборов NewGRF: в игре они тоже английские
  'savegame.grf.ironHorse',
  'savegame.grf.xussr',
  'savegame.grf.xussrSubways',
  'savegame.grf.xussrIvolga',
  'savegame.grf.firs',
  'savegame.grf.baseCostsMod',
  'savegame.grf.alteredCosts',
]);

describe('locales', () => {
  it('every locale has exactly the English key set', () => {
    const expected = Object.keys(en).sort();
    for (const [locale, strings] of Object.entries(dictionaries)) {
      expect(Object.keys(strings).sort(), locale).toEqual(expected);
    }
  });

  it('no string is empty', () => {
    for (const [locale, strings] of Object.entries(dictionaries)) {
      for (const [key, value] of Object.entries(strings)) {
        expect(value.trim(), `${locale}/${key}`).not.toBe('');
      }
    }
  });

  it('russian strings are actually translated', () => {
    for (const [key, value] of Object.entries(dictionaries.ru)) {
      if (KEPT_IN_ENGLISH.has(key)) continue;
      // hints quote setting ids (economy.day_length_factor) — Cyrillic elsewhere in the string is enough
      expect(/[а-яё]/i.test(value), `ru/${key}: ${value}`).toBe(true);
    }
  });
});

describe('t()', () => {
  it('follows the locale store and formats numbers to match', () => {
    useLocaleStore.getState().setLocale('en');
    expect(t('nav.settings')).toBe('Settings');
    expect(intlLocale()).toBe('en-GB');

    useLocaleStore.getState().setLocale('ru');
    expect(t('nav.settings')).toBe('Настройки');
    expect(intlLocale()).toBe('ru-RU');
    // thousands separator comes from the UI language, not from a hardcoded tag
    expect((1234).toLocaleString(intlLocale())).not.toBe((1234).toLocaleString('en-GB'));
  });

  it('falls back to the key when a string is missing', () => {
    expect(t('nope.not.a.key')).toBe('nope.not.a.key');
  });
});

/**
 * Cargo names are data, not UI strings, so a FIRS or vanilla update can add
 * cargos the dictionary does not know about — that shows up here.
 */
describe('cargo names', () => {
  const allCargos = [...firsCargos.items, ...vanillaCargos.items];

  it('covers every cargo in the data', () => {
    const missing = allCargos
      .filter((c) => !(c.id in cargosRu.names))
      .map((c) => `${c.id} (${c.name})`);
    expect(missing).toEqual([]);
  });

  it('covers every unit of measure in the data', () => {
    const units = new Set(
      allCargos.map((c) => (c as { units?: string }).units).filter((u): u is string => !!u),
    );
    expect([...units].filter((u) => !(u in cargosRu.units))).toEqual([]);
  });

  it('translates names and units, English stays untouched', () => {
    const coal = { id: 'coal', name: 'Coal' };
    useLocaleStore.getState().setLocale('en');
    expect(cargoName(coal)).toBe('Coal');
    expect(cargoUnits('tonnes')).toBe('tonnes');

    useLocaleStore.getState().setLocale('ru');
    expect(cargoName(coal)).toBe('Уголь');
    expect(cargoUnits('tonnes')).toBe('т');
    // unknown id keeps the name from the data instead of showing the id
    expect(cargoName({ id: 'unobtainium', name: 'Unobtainium' })).toBe('Unobtainium');
  });

  it('tells apart the two cargos sharing the WOOD label', () => {
    // vanilla WOOD is the game's Wood, FIRS WOOD is Logs — one label, two names
    const vanillaWood = vanillaCargos.items.find((c) => c.label === 'WOOD')!;
    const firsWood = firsCargos.items.find((c) => c.label === 'WOOD')!;
    useLocaleStore.getState().setLocale('ru');
    expect(cargoName(vanillaWood)).toBe('Древесина');
    expect(cargoName(firsWood)).toBe('Брёвна');
  });

  it('sorts pickers by the name the user sees', () => {
    const list = [
      { id: 'acid', name: 'Acid' },
      { id: 'coal', name: 'Coal' },
      { id: 'alcohol', name: 'Alcohol' },
    ];
    useLocaleStore.getState().setLocale('en');
    expect(sortCargos(list, 'en').map((c) => c.name)).toEqual(['Acid', 'Alcohol', 'Coal']);

    useLocaleStore.getState().setLocale('ru');
    expect(sortCargos(list, 'ru').map((c) => cargoName(c))).toEqual(['Алкоголь', 'Кислота', 'Уголь']);
  });

  it('keeps passengers and mail at the top, as the game does', () => {
    const list = [
      { id: 'coal', name: 'Coal' },
      { id: 'mail', name: 'Mail' },
      { id: 'acid', name: 'Acid' },
      { id: 'passengers', name: 'Passengers' },
    ];
    for (const locale of ['en', 'ru'] as const) {
      useLocaleStore.getState().setLocale(locale);
      const order = sortCargos(list, locale).map((c) => c.id);
      // pinned first in a fixed order, everything else alphabetical
      expect(order).toEqual(['passengers', 'mail', 'acid', 'coal']);
    }
  });
});

describe('station name suffixes', () => {
  // Snapshot station names are assembled from these dictionaries; a key with no
  // Russian counterpart would surface as an English suffix in the Russian UI.
  it('russian dictionary mirrors the english key set', () => {
    expect(Object.keys(stationsRu.game).sort()).toEqual(Object.keys(stationNames.game).sort());
    expect(Object.keys(stationsRu.firs).sort()).toEqual(Object.keys(stationNames.firs).sort());
  });

  it('covers every industry station suffix in the data', () => {
    const missing = industries.items
      .filter((i) => 'station_name_key' in i)
      .map((i) => (i as { station_name_key: string }).station_name_key)
      .filter((key) => !(key in stationNames.firs) || !(key in stationsRu.firs));
    expect(missing).toEqual([]);
  });

  it('town placeholder survives in both languages', () => {
    for (const dict of [stationNames.game, stationsRu.game] as Record<string, string>[]) {
      for (const [key, template] of Object.entries(dict)) {
        expect(template, key).toContain('{TOWN}');
      }
    }
  });
});

describe('industry names', () => {
  it('covers every industry in the data', () => {
    // the vanilla set alongside FIRS, the way the cargo check reads both: a game played
    // without FIRS names its industries from these, and an untranslated one would quietly
    // fall back to English
    const all = [...industries.items, ...vanillaIndustries.items];
    const missing = all
      .filter((i) => !(i.id in industriesRu))
      .map((i) => `${i.id} (${i.name})`);
    expect(missing).toEqual([]);
  });

  it('two industries of one economy never share a Russian name', () => {
    // graph nodes and pickers address an industry by id but show it by name, so a shared
    // name leaves two chains looking like one industry
    useLocaleStore.getState().setLocale('ru');
    for (const economy of economies.items) {
      const byName = new Map<string, string[]>();
      for (const id of economy.industry_ids) {
        const industry = industries.items.find((i) => i.id === id);
        if (!industry) continue;
        const name = industryName(industry, economy.id);
        byName.set(name, [...(byName.get(name) ?? []), id]);
      }
      const clashes = [...byName].filter(([, ids]) => ids.length > 1);
      expect(clashes, `${economy.id}: ${JSON.stringify(clashes)}`).toEqual([]);
    }
  });

  it('translates the name, English stays untouched', () => {
    const mine = { id: 'coal_mine', name: 'Coal Mine' };
    useLocaleStore.getState().setLocale('en');
    expect(industryName(mine)).toBe('Coal Mine');

    useLocaleStore.getState().setLocale('ru');
    expect(industryName(mine)).toBe('Угольная шахта');
    expect(industryName({ id: 'nope', name: 'Widget Works' })).toBe('Widget Works');
  });

  it('relabels both cargo and industry nodes of the chain graph', () => {
    useLocaleStore.getState().setLocale('ru');
    const dot = localiseDot(economies.items[0].graph.dot);
    expect(dot).toContain('"COAL" [shape=ellipse, style=filled, fillcolor="#f5efd8", label="Уголь"]');
    expect(dot).toContain('label="Угольная шахта"');
    expect(dot).not.toContain('label="Coal Mine"');
    // edges carry node ids, not labels — they must survive untouched
    expect(dot).toContain('"coal_mine" -> "COAL"');
  });
});

/*
 * A slash is written without spaces around it — between two figures of one
 * quantity ("144/144") and where it reads as "per" ("Profit/year"). The
 * dictionaries once held ten of each spelling, split along tab lines, and the
 * same quantity was named "Income/trip" on one tab and "Income / trip" on
 * another. Nothing on screen shows which spelling a string uses until the two
 * stand side by side.
 */
describe('a slash in a dictionary', () => {
  it.each(Object.entries({ en, ru }))('is written without spaces in %s', (_locale, dictionary) => {
    const spaced = Object.entries(dictionary as Record<string, string>)
      .filter(([, value]) => value.includes(' / '))
      .map(([key, value]) => `${key}: ${value}`);

    expect(spaced, 'a slash joins, so it is not spaced apart').toEqual([]);
  });
});

describe('track type names', () => {
  const ironHorseRailtypes = trainsJson.meta.railtypes;
  const vanilla = vanillaTrainsJson.meta.railtypes;

  it('the dictionary covers every track type of both sets', () => {
    // one dictionary serves both: a label means the same track whoever ships it
    const missing = [...ironHorseRailtypes, ...vanilla]
      .map((rt) => rt.label)
      .filter((label) => !(label in railtypesRu));
    expect(missing).toEqual([]);
  });

  it('carries no entry the data has no track for', () => {
    const known = new Set([...ironHorseRailtypes, ...vanilla].map((rt) => rt.label));
    expect(Object.keys(railtypesRu).filter((label) => !known.has(label))).toEqual([]);
  });

  it('russian names read as names, not as bare adjectives', () => {
    // the game's own russian.txt states them as adjectives agreeing with a noun
    // ("Монорельсовый"), which name nothing on their own
    useLocaleStore.setState({ locale: 'ru' });
    for (const railtype of vanilla) {
      expect(railtypeName(railtype), railtype.label).toMatch(/ж\/д|метро/i);
    }
  });

  it('a name two tracks share is told apart in every language', () => {
    // Iron Horse names both its high speed types "Dedicated High Speed Railway"
    for (const locale of Object.keys(LOCALES) as Locale[]) {
      useLocaleStore.setState({ locale });
      const names = railtypeOptions(ironHorseRailtypes).map((option) => option.name);
      expect(new Set(names).size, locale).toBe(names.length);
      const highSpeed = railtypeOptions(ironHorseRailtypes).filter((o) =>
        ['LGVN', 'LGVE'].includes(o.railtype.label),
      );
      expect(highSpeed.every((o) => o.name.includes('('))).toBe(true);
    }
  });

  it('leaves a name no other track shares alone', () => {
    useLocaleStore.setState({ locale: 'ru' });
    const rail = railtypeOptions(ironHorseRailtypes).find((o) => o.railtype.label === 'RAIL')!;
    // the game names it so; only the adjectival strings are replaced
    expect(rail.name).toBe('Ж/д');
  });
});

describe('xussr vehicle names', () => {
  const items = xussrTrainsJson.items;
  const names = trainsXussrRu.trains as Record<string, string>;

  it('the dictionary covers every vehicle of the set', () => {
    // the set translates every name it shows in the buy menu, so nothing is left out;
    // a vehicle added without a Russian string would surface here (spec: localisation)
    expect(items.map((train) => train.id).filter((id) => !(id in names))).toEqual([]);
  });

  it('carries no entry the data has no vehicle for', () => {
    const known = new Set(items.map((train) => train.id));
    expect(Object.keys(names).filter((id) => !known.has(id))).toEqual([]);
  });

  it('shows the set name in Russian, the data name otherwise', () => {
    // both are the names the game itself prints in its buy menu, each in its language
    const vl80t = items.find((train) => train.id === 'xussr_vl80t')!;
    useLocaleStore.setState({ locale: 'ru' });
    expect(trainName(vl80t)).toBe('Электровоз ВЛ80ᵀ-702 «Выло»');
    useLocaleStore.setState({ locale: 'en' });
    expect(trainName(vl80t)).toBe('VL80ᵀ-702 "Vylo" (Electric)');
  });

  it('iron horse names stay english on the russian ui, like in the game', () => {
    useLocaleStore.setState({ locale: 'ru' });
    expect(trainName({ id: 'abernant', name: '0-8-4 Abernant' })).toBe('0-8-4 Abernant');
  });
});

describe('roster names', () => {
  // подпись набора нужна и в настройках, и в списке различий импорта: держи её в двух
  // местах — четвёртый ростер добавят в одно, и половину ничто не поймает
  it('every roster is named, and only vanilla is translated', () => {
    useLocaleStore.setState({ locale: 'ru' });
    expect(trainSetName('iron_horse')).toBe('Iron Horse');
    expect(trainSetName('xussr')).toBe('xUSSR Railway Set');
    expect(trainSetName('vanilla')).toBe(ru['settings.trainSetVanilla']);
    useLocaleStore.setState({ locale: 'en' });
    expect(trainSetName('vanilla')).toBe(en['settings.trainSetVanilla']);
  });
});

describe('xussr track type names', () => {
  const railtypes = xussrTrainsJson.meta.railtypes;
  const names = trainsXussrRu.railtypes as Record<string, string>;

  it('the dictionary covers every track of the set', () => {
    // hidden RAIL/ELRL are named by the vanilla dictionary the sets share
    const missing = railtypes
      .map((rt) => rt.label)
      .filter((label) => !(label in names) && !['RAIL', 'ELRL'].includes(label));
    expect(missing).toEqual([]);
  });

  it('the set names only its own tracks, never the shared ones', () => {
    // the shared dictionary holds names of ours (the game's own are adjectives that name
    // nothing), so a set's translation adds to it rather than replacing entries in it.
    // A set that started naming RAIL would rename it under every roster at once, and the
    // merge in names.ts deliberately lets the shared dictionary win — this keeps the two
    // from ever having to disagree.
    const shared = Object.keys(railtypesRu);
    const clashes = Object.keys(names).filter((label) => shared.includes(label));
    expect(clashes).toEqual([]);
  });

  it('russian names come from the set locale', () => {
    useLocaleStore.setState({ locale: 'ru' });
    const era1 = railtypes.find((rt) => rt.label === 'ERA1')!;
    expect(railtypeName(era1)).toBe('Ж/д перем. тока 25кВ');
  });
});

describe('track types a set names alike', () => {
  const named = (labels: string[], catenary: boolean[]) =>
    labels.map((label, i) => ({
      label,
      name: 'Same Name Railway',
      catenary: catenary[i],
    }));

  it('tells apart namesakes that differ in wires', () => {
    useLocaleStore.setState({ locale: 'en' });
    const options = railtypeOptions(named(['AAAA', 'BBBB'], [false, true]));
    expect(new Set(options.map((o) => o.name)).size).toBe(2);
    // each says which one it is, and "unelectrified" must not pass for "electrified"
    expect(options[0].name).toBe(`Same Name Railway (${en['railtype.unelectrified']})`);
    expect(options[1].name).toBe(`Same Name Railway (${en['railtype.electrified']})`);
  });

  it('falls back to the label when even the wires agree', () => {
    // a set is free to name two tracks alike and electrify both; the menu still has to
    // offer a choice rather than two identical lines
    useLocaleStore.setState({ locale: 'en' });
    const options = railtypeOptions(named(['AAAA', 'BBBB'], [true, true]));
    expect(new Set(options.map((o) => o.name)).size).toBe(2);
    expect(options.map((o) => o.name).join(' ')).toContain('AAAA');
  });
});
