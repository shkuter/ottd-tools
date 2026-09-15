import { useRef } from 'react';
import { Table } from '@mantine/core';
import { t } from '../../i18n';
import { usePinnedLeadingColumns } from './usePinnedLeadingColumns';
import { OVERFLOW_HINT_CLASS, useOverflowHint } from './useOverflowHint';

/**
 * Scrolls the list so that the cell the keyboard just reached stands clear of the pinned cells
 * of its row, and of the overflow hint (`hint`, shown only while there are columns further
 * right). The browser scrolls a focused element into view only while it is out of view
 * altogether; a cell half under a pinned column counts as visible, and its focus frame stays
 * hidden under the column. How far to scroll depends on how wide the pinned columns are, which
 * each list decides, so it is measured here rather than written into the stylesheet.
 */
function keepClearOfPinnedCells(event: React.FocusEvent<HTMLDivElement>, hint: HTMLElement | null) {
  // only for the keyboard: a press of the mouse shows no frame to keep in sight, and a list
  // that jumped under the pointer at every click would move what was about to be clicked
  if (!(event.target as Element).matches(':focus-visible')) return;
  const list = event.currentTarget;
  const cell = (event.target as Element).closest('td, th');
  const row = cell?.parentElement;
  if (!cell || !row || getComputedStyle(cell).position === 'sticky') return;

  const frame = list.getBoundingClientRect();
  let left = frame.left + list.clientLeft;
  let right = left + list.clientWidth;
  // the hint of columns further right stands over the end of the scrolling part while shown
  const hintBox = hint?.getBoundingClientRect();
  if (hintBox && hintBox.width > 0) right = Math.min(right, hintBox.left);
  for (const other of row.children) {
    const style = getComputedStyle(other);
    if (style.position !== 'sticky') continue;
    const box = other.getBoundingClientRect();
    // a cell pinned by its left edge holds the start of the row, one pinned by its right the end
    if (style.left !== 'auto') left = Math.max(left, box.right);
    else right = Math.min(right, box.left);
  }

  const box = cell.getBoundingClientRect();
  if (box.left < left) list.scrollLeft -= left - box.left;
  else if (box.right > right) list.scrollLeft += box.right - right;
}

/**
 * The frame every list on the pages stands in: the border, the sideways scrolling for a table
 * wider than its column, and the message that takes the table's place when nothing is left to
 * show. An empty frame reads as a broken calculation, while the cause is nearly always a filter
 * that excluded everything — so the list says which.
 *
 * There is no vertical scrolling of its own and no header held at the top of the screen: the
 * page is one document with one scrollbar, and a header that stuck would need a list of fixed
 * height to stick inside.
 *
 * `pinEdges` keeps the first and last column in place while the rest scrolls sideways — the
 * column a row is recognised by and the one holding the action on it. `pinStart` keeps only
 * the first, for a table whose last column is data rather than an action: pinning that one
 * would park its values over the neighbour's. Either mode is a class on the frame rather than
 * on every cell: which cells are the edge ones is exactly what `:first-child` / `:last-child`
 * already say.
 *
 * `pinLeading` holds several first columns instead of one, for a list whose row is recognised
 * by more than its first cell: on Best train that is the rank together with the engine — the
 * number, the comparison tick, the sprite and the name. Which cells those are cannot be said
 * with `:first-child`, so the offsets are measured (see usePinnedLeadingColumns).
 */
export function TableFrame({
  rowCount,
  emptyMessage,
  pinEdges = false,
  pinStart = false,
  pinLeading,
  children,
}: {
  /** How many rows the page is passing in; the frame decides what an empty one looks like. */
  rowCount: number;
  /**
   * What to say when there are none — each tab filters by something of its own. A node rather
   * than a string, so the message can carry a link to the tab where the cause is fixed.
   */
  emptyMessage: React.ReactNode;
  pinEdges?: boolean;
  /**
   * Hold only the first column, for a table whose last column is data rather than the action
   * on a row: pinning that one would park one column's values over its neighbour's. The
   * column a row is recognised by is held either way.
   */
  pinStart?: boolean;
  /**
   * How many first columns of the table to hold, counted as columns rather than cells — a
   * heading spanning two columns counts as two. Replaces the first-column pin of `pinEdges` or
   * `pinStart`; the last column of `pinEdges` is held as before.
   */
  pinLeading?: number;
  /** The rows themselves — a frame with none of them says so instead. */
  children?: React.ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLSpanElement>(null);
  usePinnedLeadingColumns(frame, pinLeading);
  useOverflowHint(frame);
  // The scrolling stays with .table-wrap; the holder around it is only there for the hint to
  // stand over the frame's right edge without scrolling along with the table
  return (
    <div className="table-frame">
      <div
        ref={frame}
        className={`table-wrap${pinEdges ? ' pin-edges' : ''}${pinStart ? ' pin-start' : ''}${
          pinLeading ? ' pin-leading' : ''
        }`}
        // on every list, pinned or not: the overflow hint stands over the right end of any list
        // wider than its frame, and a cell reached by the keyboard is kept clear of it as well
        onFocus={(event) => keepClearOfPinnedCells(event, hint.current)}
      >
        {rowCount === 0 ? (
          <p className="table-empty">{emptyMessage}</p>
        ) : (
          <Table>{children}</Table>
        )}
      </div>
      {/*
       * Columns further right: without this the scrollbar, which a touch screen and some systems
       * do not show, is the only sign of them. Hidden from assistive technology — the table is
       * read whole whatever the scroll — and never a tab stop; shown by the stylesheet while the
       * frame carries data-more-end (useOverflowHint).
       */}
      <span ref={hint} className={OVERFLOW_HINT_CLASS} aria-hidden="true">
        <span className="table-overflow-hint__text">{t('table.moreColumns')}</span>
      </span>
    </div>
  );
}
