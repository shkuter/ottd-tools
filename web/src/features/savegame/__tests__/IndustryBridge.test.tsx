/**
 * The bridge on an industry row: the produced cargo itself is the link. It hangs off one
 * cargo, so it belongs to the production column alone — the transported column walks the
 * same list through the same component, and a link placed carelessly would show up twice.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IndustriesTab } from '../IndustriesTab';
import { GAME_SNAPSHOT } from './gameSnapshot';
import { useOptimizerStore } from '../../../state/optimizerStore';
import { useLocaleStore } from '../../../state/localeStore';
import type { Snapshot } from '../../../savegame/snapshot';

function draw(snapshot: Snapshot = GAME_SNAPSHOT.snapshot) {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter initialEntries={['/game']}>
        <Routes>
          <Route
            path="/game"
            element={
              <IndustriesTab snapshot={snapshot} settings={GAME_SNAPSHOT.settings} />
            }
          />
          <Route path="/optimizer" element={<div>optimizer tab</div>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  useLocaleStore.getState().setLocale('en');
  useOptimizerStore.setState({ cargoLabel: 'WOOD', productionPerMonth: 0, prefillOrigin: null });
});

afterEach(cleanup);

describe('the bridge on an industry', () => {
  it('carries that cargo and its month to the optimizer', async () => {
    draw();
    const row = screen.getByText('Iron Ore Mine').closest('tr')!;

    await userEvent.click(within(row).getByRole('button'));

    expect(screen.getByText('optimizer tab')).toBeTruthy();
    expect(useOptimizerStore.getState().cargoLabel).toBe('IORE');
    expect(useOptimizerStore.getState().productionPerMonth).toBe(144);
    // the type alone reads the same for every coal mine of a game, so the town comes too
    expect(useOptimizerStore.getState().prefillOrigin!.label).toBe('Iron Ore Mine (Checkford)');
  });

  it('offers one link per produced cargo, not one per column', () => {
    draw();
    const row = screen.getByText('Iron Ore Mine').closest('tr')!;

    // the row states one produced cargo, and the transported column repeats it plainly
    expect(within(row).getAllByRole('button')).toHaveLength(1);
  });

  it('has no bridge where the save stated no month', () => {
    draw();
    // the power station produces nothing, so neither column has anything to carry
    const row = screen.getByText('Power Station').closest('tr')!;

    expect(within(row).queryAllByRole('button')).toHaveLength(0);
  });

  it('leaves a cargo the active set does not have as plain text', () => {
    // a label no economy of the calculator knows: following it would land the optimizer on
    // some other cargo, because the tab replaces an unknown one on read
    const alien: Snapshot = {
      ...GAME_SNAPSHOT.snapshot,
      industries: GAME_SNAPSHOT.snapshot.industries.map((industry) =>
        industry.id === 1
          ? {
              ...industry,
              produced: [
                { label: 'NOSUCH', slot: 7, lastMonthProduction: 50, lastMonthTransported: 10 },
              ],
            }
          : industry,
      ),
    };
    draw(alien);
    const row = screen.getByText('unknown industry').closest('tr')!;

    expect(within(row).queryAllByRole('button')).toHaveLength(0);
    // the figure is still stated; only the link is gone
    expect(row.textContent).toContain('50');
  });
});
