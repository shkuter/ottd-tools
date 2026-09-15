import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** The hint beside the frame; the class the stylesheet draws it by. */
export const OVERFLOW_HINT_CLASS = 'table-overflow-hint';

/** Writes a custom property only when it changes, so a repeated pass costs no style recalc. */
function setProperty(element: HTMLElement, name: string, value: string) {
  if (element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
}

/**
 * Says whether the list in `frame` has columns further right than it shows, and where the hint
 * that says so has to stop.
 *
 * - `data-more-end` on the frame while the table is wider than the frame and not scrolled to
 *   its right edge — a pixel of slack, since a fractional width never quite reaches the end;
 * - `--table-pinned-end` on the frame's parent (where the hint stands): the width of the column
 *   held at the right edge, found as the last cell of a row that is sticky and not pinned by its
 *   left, so the hint ends where that column's edge begins and does not cover it;
 * - `--table-scrollbar` beside it: the height of the frame's own scrollbar, which the hint
 *   leaves uncovered.
 *
 * Exported for the unit test; pages get it through `TableFrame`.
 */
export function updateOverflowHint(frame: HTMLElement): void {
  const more = frame.scrollWidth - frame.clientWidth - frame.scrollLeft > 1;
  if (frame.hasAttribute('data-more-end') !== more) frame.toggleAttribute('data-more-end', more);

  const holder = frame.parentElement;
  if (!holder) return;
  let pinnedEnd = 0;
  const row = frame.querySelector('tbody tr') ?? frame.querySelector('tr');
  if (row) {
    for (const cell of row.children) {
      const style = getComputedStyle(cell);
      if (style.position !== 'sticky') continue;
      // a cell pinned by its left edge holds the start of the row, one pinned by its right the end
      if (style.left === 'auto' || style.left === '') pinnedEnd = cell.getBoundingClientRect().width;
    }
  }
  setProperty(holder, '--table-pinned-end', `${pinnedEnd}px`);
  const scrollbar = Math.max(0, frame.offsetHeight - frame.clientHeight - 2 * frame.clientTop);
  setProperty(holder, '--table-scrollbar', `${scrollbar}px`);
}

/**
 * Keeps `updateOverflowHint` true to the list: on a scroll of the frame, when the frame or the
 * table changes size (a wider window, another language) and after every render (another set of
 * columns, rows shown or sorted). Like the held columns, a pass that finds everything in place
 * writes nothing.
 */
export function useOverflowHint(ref: RefObject<HTMLElement | null>): void {
  const observer = useRef<ResizeObserver | null>(null);
  const observedTable = useRef<HTMLTableElement | null>(null);

  useLayoutEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    updateOverflowHint(frame);
    if (typeof ResizeObserver === 'undefined') return;
    if (!observer.current) {
      observer.current = new ResizeObserver(() => {
        if (ref.current) updateOverflowHint(ref.current);
      });
      observer.current.observe(frame);
    }
    // an emptied list replaces its table with a message, and a refilled one brings a new one
    const table = frame.querySelector('table');
    if (table !== observedTable.current) {
      if (observedTable.current) observer.current.unobserve(observedTable.current);
      if (table) observer.current.observe(table);
      observedTable.current = table;
    }
  });

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const onScroll = () => updateOverflowHint(frame);
    frame.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      frame.removeEventListener('scroll', onScroll);
      observer.current?.disconnect();
      observer.current = null;
      observedTable.current = null;
    };
  }, [ref]);
}
