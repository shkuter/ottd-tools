import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCALES, LOCALE_KEY, pickLocale } from '../localeStore';

/**
 * The store picks its starting language when the module is evaluated, so every case here
 * gets its own copy: storage and browser languages are set first, then the module is
 * imported afresh.
 */
async function freshStore(languages: string[], stored?: string, language?: string) {
  localStorage.clear();
  if (stored !== undefined) {
    localStorage.setItem(LOCALE_KEY, JSON.stringify({ state: { locale: stored }, version: 0 }));
  }
  return restart(languages, language);
}

/**
 * Another start of the app on the same storage: only the browser and the module graph are
 * new. Storage is deliberately left as it is — it is the one place a detection could settle
 * into, so a check that it did not must not wipe it first.
 */
async function restart(languages: string[], language?: string) {
  Object.defineProperty(navigator, 'languages', { value: languages, configurable: true });
  Object.defineProperty(navigator, 'language', { value: language, configurable: true });
  vi.resetModules();
  const { useLocaleStore } = await import('../localeStore');
  return useLocaleStore;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'languages');
  Reflect.deleteProperty(navigator, 'language');
  localStorage.clear();
  vi.resetModules();
});

describe('pickLocale', () => {
  it.each([
    [['ru-RU'], 'ru'],
    [['ru'], 'ru'],
    [['RU-ru'], 'ru'],
    [['ru-UA', 'en-US'], 'ru'],
    // the order of preferences decides, not the mere presence of Russian in the list
    [['en-GB', 'ru'], 'en'],
    [['de-DE'], 'en'],
    // languages where Russian is widespread as a second one are not treated as Russian
    [['uk-UA', 'be-BY'], 'en'],
    [[], 'en'],
    // a tag that names an inherited property of the dictionary object is not a language
    [['toString'], 'en'],
  ])('%j → %s', (tags, expected) => {
    expect(pickLocale(tags)).toBe(expected);
  });
});

describe('the languages on offer', () => {
  it('are two, which is what the footer switch assumes', () => {
    // a third language turns that switch into a menu: it names the other language by
    // simply being the one the current one is not
    expect(Object.keys(LOCALES)).toHaveLength(2);
  });
});

describe('the starting language', () => {
  it('follows the browser when no choice has been made', async () => {
    const store = await freshStore(['ru-RU', 'en-US']);
    expect(store.getState().locale).toBe('ru');
  });

  it('settles into storage only once a choice is made', async () => {
    const store = await freshStore(['ru-RU']);
    // nothing written: the next start detects again, so a changed browser language reaches
    // the interface instead of being frozen at what was detected once
    expect(localStorage.getItem(LOCALE_KEY)).toBeNull();
    store.getState().setLocale('en');
    expect(JSON.parse(localStorage.getItem(LOCALE_KEY)!).state.locale).toBe('en');
  });

  it('gives way to a stored choice', async () => {
    const store = await freshStore(['ru-RU'], 'en');
    expect(store.getState().locale).toBe('en');
  });

  it('follows a changed browser language on the next start', async () => {
    const first = await freshStore(['ru-RU']);
    expect(first.getState().locale).toBe('ru');

    // the same storage, untouched: had the first start settled into it, this one would
    // still read Russian instead of detecting afresh
    const second = await restart(['en-US']);
    expect(second.getState().locale).toBe('en');
  });

  it('falls back to the single language when the list is empty', async () => {
    const store = await freshStore([], undefined, 'ru-RU');
    expect(store.getState().locale).toBe('ru');
  });

  it('survives a browser that fills in neither', async () => {
    const store = await freshStore([], undefined, undefined);
    expect(store.getState().locale).toBe('en');
  });
});
