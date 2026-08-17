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

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: 'en',
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'ottd-tools-locale' },
  ),
);
