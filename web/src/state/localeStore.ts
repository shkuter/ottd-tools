import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * UI language. Deliberately kept out of GameSettings/CalcSettings for the same
 * reason as the skin: those must all affect the calculation (see CLAUDE.md).
 */
export type Locale = 'en' | 'ru';

/** Self-names (never translated) plus the locale used for number formatting. */
export const LOCALES: Record<Locale, { name: string; numbers: string }> = {
  en: { name: 'English', numbers: 'en-GB' },
  ru: { name: 'Русский', numbers: 'ru-RU' },
};

/** What the browser says the user reads, most preferred first. */
function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  return tags.filter((tag) => typeof tag === 'string' && tag.length > 0);
}

/**
 * The first tag whose language — the part before the region — we have a dictionary for.
 * Matching on the language alone is deliberate: Russian is read in as many regions as there
 * are tags for it, and a list of them is wrong the day it is written. Languages where
 * Russian is merely widespread as a second one are not treated as Russian: the point is the
 * language the user reads, not the one we guess they could.
 */
export function pickLocale(tags: readonly string[]): Locale {
  for (const tag of tags) {
    const language = tag.split('-')[0].toLowerCase();
    if (Object.hasOwn(LOCALES, language)) return language as Locale;
  }
  return 'en';
}

/** Where the language lives; exported so checks address the real key, not a copy of it. */
export const LOCALE_KEY = 'ottd-tools-locale';

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      /*
       * Only a starting value, and only for someone who has never chosen: persist
       * overwrites it from storage whenever the key is there, and writes nothing back
       * until the state changes. So the detection runs afresh on every start until the
       * first setLocale — which stores the choice and ends the detection for good.
       */
      locale: pickLocale(browserLanguages()),
      setLocale: (locale) => set({ locale }),
    }),
    { name: LOCALE_KEY },
  ),
);
