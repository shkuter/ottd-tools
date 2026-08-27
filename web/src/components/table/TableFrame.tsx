import { Table } from '@mantine/core';

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
 * column a row is recognised by and the one holding the action on it. It is a class on the
 * frame rather than on every cell: which cells are the edge ones is exactly what
 * `:first-child` / `:last-child` already say.
 */
export function TableFrame({
  rowCount,
  emptyMessage,
  pinEdges = false,
  children,
}: {
  /** How many rows the page is passing in; the frame decides what an empty one looks like. */
  rowCount: number;
  /** What to say when there are none — each tab filters by something of its own. */
  emptyMessage: string;
  pinEdges?: boolean;
  /** The rows themselves — a frame with none of them says so instead. */
  children?: React.ReactNode;
}) {
  return (
    <div className={`table-wrap${pinEdges ? ' pin-edges' : ''}`}>
      {rowCount === 0 ? (
        <p className="table-empty">{emptyMessage}</p>
      ) : (
        <Table>{children}</Table>
      )}
    </div>
  );
}
