import { describe, expect, it } from 'vitest';
import { intlLocale, t } from '..';
import { cargoName, cargoUnits, industryName, localiseDot, sortCargos } from '../names';
import { useLocaleStore } from '../../state/localeStore';
import firsCargos from '../../data/cargos.json';
import industries from '../../data/industries.json';
import vanillaCargos from '../../data/vanilla_cargos.json';
import economies from '../../data/economies.json';
import cargosRu from '../cargos.ru.json';
import industriesRu from '../industries.ru.json';
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
  'settings.ironHorse',
  'settings.firs',
  'settings.jgrpp',
  'settings.inflationGrfError',
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
      .filter((c) => !(c.label in cargosRu.names))
      .map((c) => `${c.label} (${c.name})`);
    expect(missing).toEqual([]);
  });

  it('covers every unit of measure in the data', () => {
    const units = new Set(
      allCargos.map((c) => (c as { units?: string }).units).filter((u): u is string => !!u),
    );
    expect([...units].filter((u) => !(u in cargosRu.units))).toEqual([]);
  });

  it('translates names and units, English stays untouched', () => {
    const coal = { label: 'COAL', name: 'Coal' };
    useLocaleStore.getState().setLocale('en');
    expect(cargoName(coal)).toBe('Coal');
    expect(cargoUnits('tonnes')).toBe('tonnes');

    useLocaleStore.getState().setLocale('ru');
    expect(cargoName(coal)).toBe('Уголь');
    expect(cargoUnits('tonnes')).toBe('т');
    // unknown label keeps the name from the data instead of showing the label
    expect(cargoName({ label: 'ZZZZ', name: 'Unobtainium' })).toBe('Unobtainium');
  });

  it('sorts pickers by the name the user sees', () => {
    const list = [
      { label: 'ACID', name: 'Acid' },
      { label: 'COAL', name: 'Coal' },
      { label: 'BEER', name: 'Alcohol' },
    ];
    useLocaleStore.getState().setLocale('en');
    expect(sortCargos(list, 'en').map((c) => c.name)).toEqual(['Acid', 'Alcohol', 'Coal']);

    useLocaleStore.getState().setLocale('ru');
    expect(sortCargos(list, 'ru').map((c) => cargoName(c))).toEqual(['Алкоголь', 'Кислота', 'Уголь']);
  });
});

describe('industry names', () => {
  it('covers every industry in the data', () => {
    const missing = industries.items
      .filter((i) => !(i.id in industriesRu))
      .map((i) => `${i.id} (${i.name})`);
    expect(missing).toEqual([]);
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
