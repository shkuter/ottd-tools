/**
 * Where a tab's inputs came from, when they were not typed in by hand: a route, an industry
 * or a company of an imported game, carried over by a bridge from the game tab.
 *
 * The note lives on the values, not on the act of filling them in. A tab shows it while its
 * inputs still equal what the bridge wrote, which makes editing any of them put the note
 * out by itself — no setter has to know about it, and no store has to watch another one.
 */

/** The kinds of card a bridge starts from; the note reads differently for each. */
export type PrefillSource = 'route' | 'industry' | 'company';

export interface PrefillOrigin<V> {
  source: PrefillSource;
  /** What to call the source: "Coalmouth — Power Station", an industry's name. */
  label: string;
  /** Only the fields the bridge actually wrote; anything it left alone is absent. */
  values: Partial<V>;
}

/**
 * Whether the tab still holds exactly what the bridge put there. Absent fields are the ones
 * the bridge never touched, so they cannot disagree.
 */
export function prefillMatches<V extends object>(
  origin: PrefillOrigin<V> | null | undefined,
  current: V,
): origin is PrefillOrigin<V> {
  if (!origin) return false;
  const entries = Object.entries(origin.values) as [keyof V, unknown][];
  if (entries.length === 0) return false;
  return entries.every(([key, value]) => sameValue(value, current[key]));
}

/** Structural equality over what a prefill holds: primitives, and lists of flat records. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) =>
        sameValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
      )
    );
  }
  return false;
}
