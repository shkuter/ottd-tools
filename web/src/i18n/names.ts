/**
 * Names that come from the NewGRF data rather than from the UI. FIRS ships
 * English only (vendor/firs/src/lang holds english.lng and nothing else), so
 * the Russian names live here. Vanilla cargos follow the game's own translation
 * (STR_CARGO_PLURAL_* / STR_INDUSTRY_NAME_* in openttd/src/lang/russian.txt).
 */
import { LOCALES, useLocaleStore, type Locale } from '../state/localeStore';
import cargosRu from './cargos.ru.json';
import industriesRu from './industries.ru.json';

const CARGO_NAMES: Record<string, Record<string, string>> = { ru: cargosRu.names };
const CARGO_UNITS: Record<string, Record<string, string>> = { ru: cargosRu.units };
const INDUSTRY_NAMES: Record<string, Record<string, string>> = { ru: industriesRu };

/** Translated cargo name, or the English one from the data. */
export function cargoName(cargo: { label: string; name: string } | null | undefined): string {
  if (!cargo) return '';
  const { locale } = useLocaleStore.getState();
  return CARGO_NAMES[locale]?.[cargo.label] ?? cargo.name;
}

/** Unit of measure the data spells out in words: litres, tonnes, crates… */
export function cargoUnits(units: string | null | undefined): string {
  if (!units) return '';
  const { locale } = useLocaleStore.getState();
  return CARGO_UNITS[locale]?.[units] ?? units;
}

/** Industry name; economies may rename an industry, hence the optional override. */
export function industryName(
  industry: { id: string; name: string; name_by_economy?: Record<string, string> } | null | undefined,
  economyId?: string,
): string {
  if (!industry) return '';
  const { locale } = useLocaleStore.getState();
  const translated = INDUSTRY_NAMES[locale]?.[industry.id];
  if (translated) return translated;
  return (economyId ? industry.name_by_economy?.[economyId] : undefined) ?? industry.name;
}

/**
 * Cargo pickers read as a list, so order them by what the user actually sees.
 * Takes the locale as an argument rather than reading the store: callers memoise
 * the sorted list, and this way the locale is a real dependency of that memo.
 */
export function sortCargos<T extends { label: string; name: string }>(
  cargos: T[],
  locale: Locale,
): T[] {
  const names = CARGO_NAMES[locale] ?? {};
  const collator = new Intl.Collator(LOCALES[locale].numbers);
  return [...cargos].sort((a, b) =>
    collator.compare(names[a.label] ?? a.name, names[b.label] ?? b.name),
  );
}

/**
 * Node labels in the FIRS chain graph. Graphviz node ids are the cargo label
 * (ACID) or the industry id (coal_mine), so the two dictionaries can be looked
 * up by id directly — anything unknown keeps its English label.
 */
export function localiseDot(dot: string): string {
  const { locale } = useLocaleStore.getState();
  const names = { ...CARGO_NAMES[locale], ...INDUSTRY_NAMES[locale] };
  if (!Object.keys(names).length) return dot;
  return dot.replace(/"([^"]+)" \[([^\]]*?)label="([^"]*)"/g, (full, id, attrs) =>
    names[id] ? `"${id}" [${attrs}label="${names[id]}"` : full,
  );
}
