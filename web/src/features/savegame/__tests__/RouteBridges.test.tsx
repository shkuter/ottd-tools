/**
 * The two ways out of a route's row: the arrow at its end carries the whole trip to the
 * income tab, and the cargo — a value of the row — leads to the search for a train for it.
 * The refusal is the point of the test: a control that quietly does the wrong thing looks
 * exactly like one that works.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { MemoryRouter, Route, Routes } from 'react-router';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RoutesTab } from '../RoutesTab';
import { GAME_SNAPSHOT } from './gameSnapshot';
import { useConsistStore } from '../../../state/consistStore';
import { useOptimizerStore } from '../../../state/optimizerStore';
import { useRouteStore } from '../../../state/routeStore';
import { useLocaleStore } from '../../../state/localeStore';
import { useSettingsStore } from '../../../state/settingsStore';
import { TRIP_BEFORE, tripOf } from '../../../state/__tests__/tripFixture';
import type { Snapshot } from '../../../savegame/snapshot';
import { trains } from '../../../dataset';
import { t } from '../../../i18n';

function draw(snapshot: Snapshot = GAME_SNAPSHOT.snapshot) {
  return render(
    <MantineProvider forceColorScheme="dark">
      <Notifications transitionDuration={0} />
      <MemoryRouter initialEntries={['/game']}>
        <Routes>
          <Route
            path="/game"
            element={<RoutesTab snapshot={snapshot} settings={GAME_SNAPSHOT.settings} companyId={0} />}
          />
          <Route path="/income" element={<div>income tab</div>} />
          <Route path="/optimizer" element={<div>optimizer tab</div>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

/** The row whose stops read like this. */
function routeRow(text: RegExp): HTMLElement {
  return screen.getByText(text).closest('tr')!;
}

beforeEach(() => {
  useLocaleStore.getState().setLocale('en');
  useRouteStore.setState({ distanceTiles: 7, amount: 11, prefillOrigin: null });
  useConsistStore.setState({ entries: [] });
  useOptimizerStore.setState({ distanceTiles: 300, prefillOrigin: null });
});

afterEach(() => {
  act(() => notifications.clean());
  cleanup();
});

describe('the ways out of a route row', () => {
  it('carries the trip to the income tab and lands there', async () => {
    draw();
    const row = routeRow(/Checkford — Renderbury Works/);

    await userEvent.click(within(row).getByRole('button', { name: /Route income/ }));

    expect(screen.getByText('income tab')).toBeTruthy();
    expect(useConsistStore.getState().entries.length).toBeGreaterThan(0);
    expect(useRouteStore.getState().distanceTiles).toBe(96);
    // the works feeding the loading station made 80 units of it last month
    expect(useRouteStore.getState().productionPerMonth).toBe(80);
    expect(useRouteStore.getState().waitForFullLoad).toBe(true);
    expect(useRouteStore.getState().prefillOrigin!.label).toContain('Checkford');
  });

  it('offers the previous consist and trip back when it replaced a built consist', async () => {
    const engine = trains.find((train) => train.kind === 'engine')!;
    useRouteStore.setState(TRIP_BEFORE);
    // an Iron Horse consist, shown only while that set is on — as it is in the game imported here
    useSettingsStore.getState().setGame('trainSet', 'iron_horse');
    useConsistStore.setState({ entries: [{ train: engine, count: 1 }] });
    draw();

    await userEvent.click(
      within(routeRow(/Checkford — Renderbury Works/)).getByRole('button', { name: /Route income/ }),
    );
    expect(useRouteStore.getState().distanceTiles).toBe(96);

    const button = await waitFor(() =>
      screen.getByRole('button', { name: t('notify.restoreConsist') }),
    );
    await userEvent.click(button);

    expect(useConsistStore.getState().entries).toEqual([{ train: engine, count: 1 }]);
    expect(tripOf(useRouteStore.getState())).toEqual(TRIP_BEFORE);
    // the undo leaves the player where they are
    expect(screen.getByText('income tab')).toBeTruthy();
  });

  it('carries the trip over an empty builder without offering anything back', async () => {
    draw();
    await userEvent.click(
      within(routeRow(/Checkford — Renderbury Works/)).getByRole('button', { name: /Route income/ }),
    );
    expect(screen.getByText('income tab')).toBeTruthy();
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(screen.queryByRole('button', { name: t('notify.restoreConsist') })).toBeNull();
  });

  it('carries cargo, leg and flow to the optimizer through the cargo itself', async () => {
    draw();
    const row = routeRow(/Checkford — Renderbury Works/);

    await userEvent.click(within(row).getByRole('button', { name: /best train/i }));

    expect(screen.getByText('optimizer tab')).toBeTruthy();
    expect(useOptimizerStore.getState().distanceTiles).toBe(96);
    expect(useOptimizerStore.getState().productionPerMonth).toBe(80);
  });

  it('a ring route still carries its consist, and leaves the leg alone', async () => {
    // four stops: the card shows no forecast, but the consist and cargo travel all the same
    const ring: Snapshot = {
      ...GAME_SNAPSHOT.snapshot,
      routes: GAME_SNAPSHOT.snapshot.routes.map((route) =>
        route.id === 0
          ? {
              ...route,
              stops: [
                { kind: 'station' as const, stationId: 0, fullLoad: true },
                { kind: 'station' as const, stationId: 1, fullLoad: false },
                { kind: 'station' as const, stationId: 4, fullLoad: false },
                { kind: 'station' as const, stationId: 0, fullLoad: false },
              ],
            }
          : route,
      ),
    };
    draw(ring);
    const row = routeRow(/Checkford — … — Checkford/);

    const button = within(row).getByRole('button', { name: /Route income/ });
    expect(button.hasAttribute('disabled')).toBe(false);

    await userEvent.click(button);
    expect(useConsistStore.getState().entries.length).toBeGreaterThan(0);
    // the ring said nothing about one leg, so the trip inputs stay as they were
    expect(useRouteStore.getState().distanceTiles).toBe(7);
    expect(useRouteStore.getState().amount).toBe(11);
  });

  it('refuses the income bridge on an unmatched vehicle and says which', async () => {
    draw();
    // the second route is run by a train holding a vehicle from an unknown set
    const row = routeRow(/Renderbury Works — Checkford/);

    const button = within(row).getByRole('button', { name: /Route income/ });
    // marked refused rather than disabled: a disabled button leaves the tab order, and the
    // reason would then be reachable by mouse alone
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.getAttribute('title')).toContain('consist not fully matched');

    await userEvent.click(button);
    // and it stays put: no navigation, nothing written
    expect(screen.queryByText('income tab')).toBeNull();
    expect(useConsistStore.getState().entries).toEqual([]);
  });

  it('names what stops the bridge, not what stops the forecast', async () => {
    // five stops and a fleet built two ways: the forecast column says "more than two stops",
    // the bridge is shut by the fleet, and the reason it states has to be the fleet
    const ringMixed: Snapshot = {
      ...GAME_SNAPSHOT.snapshot,
      routes: GAME_SNAPSHOT.snapshot.routes.map((route) =>
        route.id === 0
          ? {
              ...route,
              stops: [0, 1, 4, 0, 1].map((stationId) => ({
                kind: 'station' as const,
                stationId,
                fullLoad: false,
              })),
              trainIds: [0, 2],
            }
          : route,
      ),
    };
    draw(ringMixed);
    const row = routeRow(/Checkford — … — Renderbury Works/);

    const button = within(row).getByRole('button', { name: /Route income/ });
    expect(button.getAttribute('title')).toContain('trains differ');
    expect(button.getAttribute('title')).not.toContain('more than two stops');
    // the forecast column, meanwhile, states its own reason
    expect(within(row).getByText('more than two stops')).toBeTruthy();
  });

  it('states why a route with no known cargo leads nowhere', () => {
    const noCargo: Snapshot = {
      ...GAME_SNAPSHOT.snapshot,
      trains: GAME_SNAPSHOT.snapshot.trains.map((train) => ({ ...train, cargo: [] })),
    };
    draw(noCargo);
    const row = routeRow(/Checkford — Renderbury Works/);

    // the cargo cell is a dash, and the dash says what it stands for
    expect(within(row).getByTitle('cargo unknown')).toBeTruthy();
  });

  it('still offers the optimizer where the consist shut the income bridge', async () => {
    draw();
    const row = routeRow(/Renderbury Works — Checkford/);

    const button = within(row).getByRole('button', { name: /best train/i });
    expect(button.hasAttribute('disabled')).toBe(false);

    await userEvent.click(button);
    expect(screen.getByText('optimizer tab')).toBeTruthy();
    expect(useOptimizerStore.getState().cargoLabel).toBe('GRVL');
  });
});
