/**
 * A sortable header works from the keyboard the way it works under the mouse: the same three
 * steps, one per press, and the direction told to assistive technology on the sorted column only.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider, Table } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { SortableTh } from '../SortableTh';
import type { SortState } from '../sorting';

type Column = 'name' | 'cost';

afterEach(cleanup);

function draw() {
  const steps: SortState<Column>[] = [];
  function Header() {
    const [sort, setSort] = useState<SortState<Column>>(null);
    const step = (next: SortState<Column>) => {
      steps.push(next);
      setSort(next);
    };
    return (
      <Table>
        <Table.Thead>
          <Table.Tr>
            <SortableTh column="name" sort={sort} onSort={step}>
              Name
            </SortableTh>
            <SortableTh column="cost" sort={sort} onSort={step}>
              Cost
            </SortableTh>
          </Table.Tr>
        </Table.Thead>
      </Table>
    );
  }
  render(
    <MantineProvider>
      <Header />
    </MantineProvider>,
  );
  return steps;
}

describe('a sortable header', () => {
  it('takes the three steps of the cycle from Enter', async () => {
    const user = userEvent.setup();
    const steps = draw();

    await user.tab();
    expect(document.activeElement?.closest('th')).toBe(
      screen.getByRole('columnheader', { name: 'Name' }),
    );
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');
    await user.keyboard('{Enter}');

    expect(steps).toEqual([
      { column: 'name', descending: false },
      { column: 'name', descending: true },
      null,
    ]);
  });

  it('takes a step from Space too', async () => {
    const user = userEvent.setup();
    const steps = draw();

    await user.tab();
    await user.keyboard(' ');

    expect(steps).toEqual([{ column: 'name', descending: false }]);
  });

  it('takes exactly one step per click, on the caption or on the cell', async () => {
    const user = userEvent.setup();
    const steps = draw();

    await user.click(screen.getByRole('button', { name: 'Name' }));
    await user.click(screen.getByRole('columnheader', { name: 'Name' }));

    expect(steps).toEqual([
      { column: 'name', descending: false },
      { column: 'name', descending: true },
    ]);
  });

  it('tells the direction on the sorted column only', async () => {
    const user = userEvent.setup();
    draw();
    const name = screen.getByRole('columnheader', { name: 'Name' });
    const cost = screen.getByRole('columnheader', { name: 'Cost' });
    expect(name.hasAttribute('aria-sort')).toBe(false);

    await user.click(name);
    expect(name.getAttribute('aria-sort')).toBe('ascending');
    await user.click(name);
    expect(name.getAttribute('aria-sort')).toBe('descending');
    expect(cost.hasAttribute('aria-sort')).toBe(false);
  });
});
