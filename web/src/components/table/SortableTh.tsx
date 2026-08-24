import { Table } from '@mantine/core';
import { nextSort, type SortState } from './sorting';

/**
 * Header that sorts the rows it heads. Three states in a cycle: ascending, descending, and back
 * to the order the tab produced itself — the tab decided that order, and a user who sorted by
 * hand must be able to get it back without re-running anything.
 *
 * The caret marks the sorted column only, the way the game marks its own list: a mark on every
 * sortable header is a library habit, not the game's.
 */
export function SortableTh<C extends string>({
  column,
  sort,
  onSort,
  title,
  colSpan,
  className,
  children,
}: {
  column: C;
  sort: SortState<C>;
  onSort: (next: SortState<C>) => void;
  title?: string;
  colSpan?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const active = sort?.column === column;
  const next = nextSort(sort, column);
  return (
    <Table.Th
      className={`sortable${active ? ' sorted' : ''}${className ? ` ${className}` : ''}`}
      title={title}
      colSpan={colSpan}
      onClick={() => onSort(next)}
    >
      {children}
      <span className="sort-mark">{active ? (sort.descending ? ' ▾' : ' ▴') : ''}</span>
    </Table.Th>
  );
}
