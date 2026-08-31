/**
 * What the catalogue says about a vehicle whose place in the buy menu is not certain.
 *
 * The rule itself is tested in `engine/__tests__/availability.test.ts`; what is checked here
 * is that the page shows it — a doubt the player never sees is a doubt the calculator kept
 * to itself.
 *
 * @vitest-environment jsdom
 */

import 'fake-indexeddb/auto';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ConsistPage from '../consist/ConsistPage';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../engine/settings';
import { useSettingsStore } from '../../state/settingsStore';
import {
  resetSnapshotStateForTests,
  saveSnapshot,
  snapshotSettings,
} from '../../savegame/snapshotStore';
import type { Snapshot } from '../../savegame/snapshot';
import { activeTrains, availabilityContext } from '../../dataset';
import { vehicleAvailability } from '../../engine/availability';

function draw() {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter>
        <ConsistPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

const game = { ...DEFAULT_GAME_SETTINGS, firs: true };

const EMPTY_SNAPSHOT: Snapshot = {
  soldIds: null, companies: [], towns: [], stations: [], routes: [], trains: [], groups: [],
  industries: [],
};

/** A year where some vehicle of the roster is uncertain, and the vehicle itself. */
function uncertainCase() {
  for (let year = 1860; year <= 2050; year += 1) {
    const context = availabilityContext(game, null);
    const train = activeTrains(game).find(
      (t) => vehicleAvailability(t, year, context).state === 'uncertain',
    );
    if (train) return { year, train };
  }
  throw new Error('no vehicle of the catalogue is ever uncertain — the case is gone');
}

beforeEach(() => {
  useSettingsStore.setState({ game, calc: { ...DEFAULT_CALC_SETTINGS } });
  resetSnapshotStateForTests();
});
afterEach(cleanup);

describe('the catalogue marks a vehicle the game may not be selling', () => {
  it('marks the doubtful one and leaves the certain one alone', async () => {
    const { year, train } = uncertainCase();
    useSettingsStore.setState({ calc: { ...DEFAULT_CALC_SETTINGS, priceYear: year } });
    draw();

    const row = (await screen.findAllByRole('row')).find((r) =>
      within(r).queryByText(train.name),
    );
    expect(row, `no row for ${train.id} in the catalogue of ${year}`).toBeTruthy();
    const mark = within(row!).getByText('?');
    expect(mark.getAttribute('title')).toBeTruthy();

    // and a row about which there is no doubt carries no mark
    const context = availabilityContext(game, null);
    const certain = activeTrains(game).find(
      (t) => vehicleAvailability(t, year, context).state === 'available',
    )!;
    const certainRow = screen.getAllByRole('row').find((r) =>
      within(r).queryByText(certain.name),
    );
    if (certainRow) expect(within(certainRow).queryByText('?')).toBeNull();
  });
});

describe('the catalogue says when its list comes from an imported game', () => {
  it('shows the line while the game answers, and not otherwise', async () => {
    const year = DEFAULT_CALC_SETTINGS.priceYear;
    draw();
    expect(screen.queryByText(/imported game/i)).toBeNull();
    cleanup();

    await saveSnapshot(
      'game.sav',
      { ...EMPTY_SNAPSHOT, soldIds: [activeTrains(game)[0].id] },
      1,
      snapshotSettings(game, { priceYear: year }),
    );
    draw();
    expect(await screen.findByText(/imported game/i)).toBeTruthy();
  });
});
