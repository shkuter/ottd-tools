/**
 * The note on a receiving tab. It follows the values, not the act of filling them in, so
 * editing a carried field puts it out and typing the old figure back brings it in again.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import RoutePage from '../RoutePage';
import OptimizerPage from '../../optimizer/OptimizerPage';
import { applyIncomeBridge, applyOptimizerBridge } from '../../savegame/applyBridge';
import { useOptimizerStore } from '../../../state/optimizerStore';
import { useConsistStore } from '../../../state/consistStore';
import { useRouteStore } from '../../../state/routeStore';
import { useLocaleStore } from '../../../state/localeStore';
import { useSettingsStore } from '../../../state/settingsStore';
import { cargoByLabel, trains } from '../../../dataset';
import { vanillaTrains } from '../../../vanilla';
import type { IncomeBridge } from '../../savegame/bridge';

const engine = trains.find((t) => t.kind === 'engine')!;
const cargo = cargoByLabel.get('COAL') ?? [...cargoByLabel.values()][0]!;

const bridge: IncomeBridge = {
  entries: [{ train: engine, count: 1 }],
  cargo,
  trip: { distanceTiles: 96, amount: 240, productionPerMonth: 144, waitForFullLoad: true },
};

function draw() {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter>
        <RoutePage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  useSettingsStore.getState().reset();
  // заметка сравнивает состав, а он из Iron Horse: без набора состав не активен и сравнение
  // идёт по пустому списку (`activeEntries`). По умолчанию наборы выключены.
  useSettingsStore.getState().applySettings({ ironHorse: true, firs: true }, {});
  useLocaleStore.getState().setLocale('en');
  useConsistStore.setState({ entries: [] });
  useRouteStore.setState({
    cargoLabel: 'COAL',
    distanceTiles: 100,
    amount: 100,
    manualDays: null,
    productionPerMonth: 0,
    waitForFullLoad: false,
    prefillOrigin: null,
  });
});

afterEach(cleanup);

const note = () => screen.queryByText(/Values from route/);

describe('the note about where the figures came from', () => {
  it('is absent until a bridge fills the tab in', () => {
    draw();
    expect(note()).toBeNull();
  });

  it('names the route once the bridge has been taken', () => {
    applyIncomeBridge(bridge, 'Coalmouth — Power Station');
    draw();

    expect(note()!.textContent).toContain('Coalmouth — Power Station');
  });

  it('goes out when a carried field is edited, and returns when it is put back', async () => {
    applyIncomeBridge(bridge, 'Coalmouth — Power Station');
    draw();

    useRouteStore.getState().setDistanceTiles(40);
    await screen.findByDisplayValue('40');
    expect(note()).toBeNull();

    useRouteStore.getState().setDistanceTiles(96);
    await screen.findByDisplayValue('96');
    expect(note()!.textContent).toContain('Coalmouth');
  });

  it('goes out when the user types over a carried field', async () => {
    applyIncomeBridge(bridge, 'Coalmouth — Power Station');
    draw();

    const distance = screen.getByDisplayValue('96');
    await userEvent.clear(distance);
    await userEvent.type(distance, '55');

    expect(note()).toBeNull();
  });
});

describe('the same note on the optimizer tab', () => {
  it('names a route as a route, and an industry as an industry', async () => {
    useOptimizerStore.setState({ cargoLabel: 'COAL', distanceTiles: 300, productionPerMonth: 0 });
    applyOptimizerBridge(
      { cargoLabel: 'COAL', distanceTiles: 96, productionPerMonth: 144 },
      { source: 'route', label: 'Coalmouth — Power Station' },
    );
    const first = render(
      <MantineProvider forceColorScheme="dark">
        <MemoryRouter>
          <OptimizerPage />
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(screen.getByText(/Values from route/).textContent).toContain('Coalmouth');
    first.unmount();

    applyOptimizerBridge(
      { cargoLabel: 'COAL', productionPerMonth: 144 },
      { source: 'industry', label: 'Coal Mine (Checkford)' },
    );
    render(
      <MantineProvider forceColorScheme="dark">
        <MemoryRouter>
          <OptimizerPage />
        </MemoryRouter>
      </MantineProvider>,
    );
    // an industry is not a route, and the sentence says so
    const note = screen.getByText(/Values from/);
    expect(note.textContent).toContain('Coal Mine (Checkford)');
    expect(note.textContent).not.toContain('route');
  });
});

describe('a consist left over from another vehicle set', () => {
  it('is left out of the figures, not priced with this set\'s basecost shifts', async () => {
    const vanillaEngine = vanillaTrains.find((t) => t.kind === 'engine')!;
    // an imported vanilla game, and Iron Horse switched on afterwards: the store still holds
    // the vanilla consist, and Iron Horse's shifts would state money no game charges
    useSettingsStore.getState().setGame('ironHorse', true);
    useConsistStore.setState({ entries: [{ train: vanillaEngine, count: 1 }] });
    useRouteStore.setState({ cargoLabel: 'COAL', distanceTiles: 100, manualDays: null });

    draw();

    // the tab states no trip at all rather than one priced with the wrong catalogue
    expect(screen.getByText('Build a consist first on the Consist tab')).toBeTruthy();
  });
});
