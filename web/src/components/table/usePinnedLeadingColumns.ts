import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** Sets a class only when it is not already in that state, so a repeated pass writes nothing. */
function setClass(cell: Element, name: string, on: boolean) {
  if (cell.classList.contains(name) !== on) cell.classList.toggle(name, on);
}

/**
 * Holds the first `count` columns of the table in `frame` while the rest scrolls sideways.
 *
 * One column is what `:first-child` can say; several need each held cell to stand where the
 * columns before it end, and how wide those are depends on the data and the language — a name,
 * a sprite — so the offsets are measured and written onto the cells.
 *
 * - Widths come off the first body row: the columns of a table are shared by all its rows, and
 *   a heading spanning two of them (a sprite and a name under one "Engine") gives no width of
 *   either on its own.
 * - Every cell of every row that starts inside the held columns and ends inside them gets its
 *   column's offset and `.pin-lead`; the one that ends on the last held column also gets
 *   `.pin-lead-last`, which carries the edge. A cell spanning past them (a row opened in place)
 *   scrolls with the rest.
 * - When the requested columns would take more than half the visible width, only the first one
 *   is held: on a narrow window there would be nothing left to scroll. The cells that stop being
 *   held lose their offset and classes, or the edge and offsets of a wider window would stay.
 *
 * Exported for the unit test; pages use it through `TableFrame pinLeading`.
 */
export function pinLeadingColumns(frame: HTMLElement, count: number): void {
  const table = frame.querySelector('table');
  const sample = table?.tBodies[0]?.rows[0];
  if (!table || !sample) return;

  const widths: number[] = [];
  for (const cell of sample.cells) {
    const span = cell.colSpan || 1;
    const width = cell.getBoundingClientRect().width;
    for (let i = 0; i < span; i++) widths.push(width / span);
    if (widths.length >= count) break;
  }
  const lefts: number[] = [];
  let total = 0;
  for (let column = 0; column < count; column++) {
    lefts.push(total);
    total += widths[column] ?? 0;
  }
  // how many columns actually stay put: all that were asked for, or the first alone
  const heldCount = total > frame.clientWidth / 2 ? 1 : count;

  for (const row of table.rows) {
    let column = 0;
    for (const cell of row.cells) {
      const start = column;
      column += cell.colSpan || 1;
      const pinned = start < heldCount && column <= heldCount;
      const left = pinned ? `${lefts[start]}px` : '';
      if (cell.style.left !== left) cell.style.left = left;
      setClass(cell, 'pin-lead', pinned);
      setClass(cell, 'pin-lead-last', pinned && column === heldCount);
    }
  }
}

/**
 * Keeps `pinLeadingColumns` true to the table as it changes. It runs after every render — a
 * re-sort, "show more" and a change of language all redraw cells without changing a prop the
 * frame could depend on — and whenever the frame or the table changes size. A pass that finds
 * everything in place writes nothing, so running it often costs no redraw.
 */
export function usePinnedLeadingColumns(
  ref: RefObject<HTMLElement | null>,
  count: number | undefined,
): void {
  const observer = useRef<ResizeObserver | null>(null);
  // read by the observer's callback, which is created once and would otherwise keep the count
  // of the render that created it
  const requestedCount = useRef(count);
  // the table element being watched: an emptied list replaces it with a message and a refilled
  // one brings a new element back, which the old observation knows nothing about
  const observedTable = useRef<HTMLTableElement | null>(null);

  useLayoutEffect(() => {
    requestedCount.current = count;
    const frame = ref.current;
    if (!count || !frame) return;
    pinLeadingColumns(frame, count);
    if (typeof ResizeObserver === 'undefined') return;
    if (!observer.current) {
      observer.current = new ResizeObserver(() => {
        if (ref.current && requestedCount.current) {
          pinLeadingColumns(ref.current, requestedCount.current);
        }
      });
      observer.current.observe(frame);
    }
    const table = frame.querySelector('table');
    if (table !== observedTable.current) {
      if (observedTable.current) observer.current.unobserve(observedTable.current);
      if (table) observer.current.observe(table);
      observedTable.current = table;
    }
  });

  useEffect(
    () => () => {
      observer.current?.disconnect();
      observer.current = null;
      observedTable.current = null;
    },
    [],
  );
}
