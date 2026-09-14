import { Table, UnstyledButton } from '@mantine/core';
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
      aria-sort={active ? (sort.descending ? 'descending' : 'ascending') : undefined}
      onClick={() => onSort(next)}
    >
      {/* The button is what the keyboard reaches, and it has no handler of its own: Enter and
          Space fire a click on it, which bubbles up to the header just as a click of the mouse
          does. Every way in therefore takes exactly one step of the cycle, and a click on the
          cell around the button still sorts. */}
      <UnstyledButton type="button" className="sort-button">
        {children}
        {/* the arrow is a shape of the skin rather than a glyph of the font: a glyph
            carries its font's own size and baseline, and would never line up with
            the same arrow on a dropdown or a stepper */}
        {active && (
          <span
            className="sort-mark"
            data-direction={sort.descending ? 'descending' : 'ascending'}
          />
        )}
      </UnstyledButton>
    </Table.Th>
  );
}
