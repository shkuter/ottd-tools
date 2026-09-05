/**
 * The bridges on the card of a picked node: one per input of an industry, one on a cargo.
 * A bridge carries values *and* goes where they are used — writing the stores without the
 * navigation leaves the arrow doing nothing a user can see.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import FirsPage from '../FirsPage';
import { useFirsStore } from '../../../state/firsStore';
import { useLocaleStore } from '../../../state/localeStore';
import { useSettingsStore } from '../../../state/settingsStore';
import { useIndustrySupplyStore, inputKey } from '../../../state/industrySupplyStore';
import { useRouteStore } from '../../../state/routeStore';

function draw() {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter initialEntries={['/firs']}>
        <Routes>
          <Route path="/firs" element={<FirsPage />} />
          <Route path="/supply" element={<div>supply tab</div>} />
          <Route path="/income" element={<div>income tab</div>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  useLocaleStore.getState().setLocale('en');
  useSettingsStore.getState().setGame('firs', true);
  useSettingsStore.getState().setGame('firsEconomy', 'STEELTOWN');
  useFirsStore.setState({ selectedNode: null, chainTargetId: null, economyId: null });
});
afterEach(cleanup);

describe('the bridges of a node card', () => {
  it('takes an input of an industry to the Supply tab', async () => {
    const user = userEvent.setup();
    useFirsStore.setState({ selectedNode: 'blast_furnace', economyId: 'STEELTOWN' });
    draw();

    const arrow = screen.getAllByLabelText(/Supply this input/)[0];
    await user.click(arrow);

    expect(await screen.findByText('supply tab')).toBeDefined();
    const supply = useIndustrySupplyStore.getState();
    expect(supply.industryId).toBe('blast_furnace');
    // the input the arrow hung off, not some other one of the same industry
    expect(supply.prefillOrigin?.values.cargoLabel).toBe('IORE');
    expect(Object.keys(supply.inputs)).toContain(inputKey('blast_furnace', 'IORE'));
  });

  it('takes a cargo to the Route income tab', async () => {
    const user = userEvent.setup();
    useFirsStore.setState({ selectedNode: 'COAL', economyId: 'STEELTOWN' });
    draw();

    await user.click(screen.getByLabelText(/Route income with this cargo/));

    expect(await screen.findByText('income tab')).toBeDefined();
    expect(useRouteStore.getState().cargoLabel).toBe('COAL');
  });
});
