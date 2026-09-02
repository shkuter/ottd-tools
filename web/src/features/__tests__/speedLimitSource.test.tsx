/**
 * What the interface says about the speed limit: which of the three candidates handed it
 * over. The rule itself is tested in `engine/__tests__/wagon-speed-limits.test.ts`; what is
 * checked here is that the summary shows it — a limit whose reason stays inside the engine
 * leaves the player guessing why the train does 120 and not 168.
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
import { useConsistStore } from '../../state/consistStore';
import { resetSnapshotStateForTests } from '../../savegame/snapshotStore';
import { trains } from '../../dataset';
import { useLocaleStore } from '../../state/localeStore';

function draw() {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter>
        <ConsistPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

const game = { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' as const };
const byId = new Map(trains.map((t) => [t.id, t]));
/** A diesel at 105 mph behind wagons at 45: the pair the setting is about. */
const engine = byId.get('wyvern')!;
const wagon = byId.get('coal_hopper_car_type_1_pony_gen_1A')!;
/** A wagon capped exactly where the engine is: then neither of them is the reason. */
const matchingWagon = trains.find(
  (t) => t.kind === 'wagon' && t.speed_internal === engine.speed_internal,
)!;

beforeEach(() => {
  // the cases read the interface's own words and units, so both are pinned rather than
  // inherited from whatever the store was left on
  useLocaleStore.getState().setLocale('en');
  useSettingsStore.setState({ game, calc: { ...DEFAULT_CALC_SETTINGS }, speedUnit: 'metric' });
  useConsistStore.getState().setEntries([
    { train: engine, count: 1 },
    { train: wagon, count: 6 },
  ]);
  resetSnapshotStateForTests();
});
afterEach(() => {
  cleanup();
  useConsistStore.getState().setEntries([]);
});

/** The value cell of a summary row, read the way the player reads it. */
async function summaryRow(label: string) {
  const cell = await screen.findByText(label);
  const row = cell.closest('tr');
  expect(row, `the summary has no ${label} row`).toBeTruthy();
  const cells = within(row!).getAllByRole('cell');
  const text = cells[cells.length - 1]!.textContent ?? '';
  // every case below is about a stated figure: an empty cell would satisfy them vacuously
  expect(text).toMatch(/km\/h/);
  return text;
}

const limitRow = () => summaryRow('Speed limit');

describe('the summary says what binds the consist', () => {
  it('names the wagons when they are the slow half', async () => {
    draw();
    expect(await limitRow()).toContain("wagon's limit");
  });

  it('names the engine once the wagons stop binding', async () => {
    useSettingsStore.setState({ game: { ...game, wagonSpeedLimits: false } });
    draw();
    expect(await limitRow()).toContain("engine's limit");
  });

  it('leaves the settled speed alone: it is not the limit', async () => {
    draw();
    // the balancing speed is what the consist reaches on its power, so no candidate "gave"
    // it — naming one there would explain a figure the limit did not set
    expect(await summaryRow('Top speed on flat (loaded)')).not.toContain('limit');
  });

  it('names nobody when engine and wagons tie at the same figure', async () => {
    useConsistStore.getState().setEntries([
      { train: engine, count: 1 },
      { train: matchingWagon, count: 4 },
    ]);
    draw();
    // nothing but the figure: a renamed label must not turn this into a tautology
    expect((await limitRow()).trim()).toMatch(/^\d+(\.\d+)? km\/h$/);
  });
});
