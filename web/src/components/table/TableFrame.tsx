import { Table } from '@mantine/core';

/**
 * Scrolls the list so that the cell the keyboard just reached stands clear of the pinned cells
 * of its row. The browser scrolls a focused element into view only while it is out of view
 * altogether; a cell half under a pinned column counts as visible, and its focus frame stays
 * hidden under the column. How far to scroll depends on how wide the pinned columns are, which
 * each list decides, so it is measured here rather than written into the stylesheet.
 */
function keepClearOfPinnedCells(event: React.FocusEvent<HTMLDivElement>) {
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
 */
export function TableFrame({
  rowCount,
  emptyMessage,
  pinEdges = false,
  pinStart = false,
  children,
}: {
  /** How many rows the page is passing in; the frame decides what an empty one looks like. */
  rowCount: number;
  /** What to say when there are none — each tab filters by something of its own. */
  emptyMessage: string;
  pinEdges?: boolean;
  /**
   * Hold only the first column, for a table whose last column is data rather than the action
   * on a row: pinning that one would park one column's values over its neighbour's. The
   * column a row is recognised by is held either way.
   */
  pinStart?: boolean;
  /** The rows themselves — a frame with none of them says so instead. */
  children?: React.ReactNode;
}) {
  const pinned = pinEdges || pinStart;
  return (
    <div
      className={`table-wrap${pinEdges ? ' pin-edges' : ''}${pinStart ? ' pin-start' : ''}`}
      onFocus={pinned ? keepClearOfPinnedCells : undefined}
    >
      {rowCount === 0 ? (
        <p className="table-empty">{emptyMessage}</p>
      ) : (
        <Table>{children}</Table>
      )}
    </div>
  );
}
