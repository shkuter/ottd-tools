/**
 * Sorting, shared by every list in the app. The mechanics are here — three clicks per column,
 * rows without a value at the end, text compared by the locale's collator — while what a column
 * compares by stays with the page: only the page knows what its rows hold, and a catalogue zero
 * ("0 hp") is a value where an optimizer null ("never pays back") is the absence of one.
 */

/** A column is addressed by name; the names are the keys of the page's value map. */
export type SortState<C extends string = string> = { column: C; descending: boolean } | null;

/**
 * What each sortable column compares by. Numbers sort as numbers and names as text, so a list
 * needs both — and the map is the single place a column's value is defined, so a header cannot
 * end up sorting by a different figure than the cell below it shows. `null` is not a value: it
 * says the row has none, and such rows leave the ordering entirely.
 */
export type SortValues<T, C extends string> = Record<C, (row: T) => number | string | null>;

/**
 * The rows in the order the list shows them: the tab's own order when nothing is sorted, and a
 * reordering of exactly those rows otherwise. Sorting is a view, never a second ranking — it
 * must not drop, add or change a row, only move it.
 */
export function sortRows<T, C extends string>(
  rows: readonly T[],
  sort: SortState<C>,
  values: SortValues<T, C>,
  collator: Intl.Collator,
): T[] {
  if (!sort) return [...rows];
  const value = values[sort.column];
  const direction = sort.descending ? -1 : 1;
  // Rows with no value at all leave the comparison and are appended: a placeholder like
  // Infinity would sort to one end, which means it heads the list the moment the user reverses
  // the direction — and a row the calculator knows nothing about is never the answer.
  const rated = rows.filter((row) => value(row) !== null);
  const unrated = rows.filter((row) => value(row) === null);
  const sorted = [...rated].sort((a, b) => {
    const va = value(a)!;
    const vb = value(b)!;
    if (typeof va === 'string' || typeof vb === 'string') {
      return direction * collator.compare(String(va), String(vb));
    }
    return direction * ((va as number) - (vb as number));
  });
  return [...sorted, ...unrated];
}

/** Next state of a header clicked: ascending, then descending, then back to the tab's order. */
export function nextSort<C extends string>(current: SortState<C>, column: C): SortState<C> {
  if (current?.column !== column) return { column, descending: false };
  return current.descending ? null : { column, descending: true };
}
