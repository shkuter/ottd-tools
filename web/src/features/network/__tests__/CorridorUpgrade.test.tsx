/**
 * The corridor upgrade panel: what it asks for before it will answer, and what it says once
 * it has everything.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { t } from '../../../i18n';
import { useUiStore } from '../../../state/uiStore';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CorridorUpgrade } from '../CorridorUpgrade';
import { activeRailtype, cargoByLabel, selectableRailtypes, trains, trainsMeta } from '../../../dataset';
import { railtypeOptions } from '../../../i18n/names';
import { useLocaleStore } from '../../../state/localeStore';
import { EMPTY_CORRIDOR, useRouteStore } from '../../../state/routeStore';
import { useSettingsStore } from '../../../state/settingsStore';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type GameSettings,
} from '../../../engine/settings';
import type { RouteWithFlowParams } from '../../../engine/trip';

const GAME: GameSettings = {
  ...DEFAULT_GAME_SETTINGS,
  trainSet: 'iron_horse',
  firs: true,
  infrastructureMaintenance: true,
};
const CALC = { ...DEFAULT_CALC_SETTINGS, trackType: 'RAIL', priceYear: 1950 };

const coal = cargoByLabel.get('COAL')!;
const engine = trains.find((t) => t.kind === 'engine' && t.power_hp > 0)!;
const hopper = trains.find(
  (t) => t.kind === 'wagon' && t.id.startsWith('coal_hopper_car_type_1_pony') && (t.capacities[2] ?? 0) > 0,
)!;

const ROUTE: RouteWithFlowParams = {
  entries: [
    { train: engine, count: 1 },
    { train: hopper, count: 14 },
  ],
  cargo: coal,
  payment: coal.initial_payment_by_economy.STEELTOWN,
  distanceTiles: 100,
  meta: trainsMeta,
  game: GAME,
  calc: CALC,
  productionPerMonth: 0,
  waitForFullLoad: false,
};

function draw(route: RouteWithFlowParams | null = ROUTE) {
  return render(
    <MantineProvider forceColorScheme="dark">
      <CorridorUpgrade route={route} />
    </MantineProvider>,
  );
}

beforeEach(() => {
  useLocaleStore.getState().setLocale('en');
  useSettingsStore.setState({ game: GAME, calc: CALC });
  useRouteStore.setState({ corridor: EMPTY_CORRIDOR, network: { railPieces: {}, signals: 0, stations: 0 } });
  useUiStore.setState({ howComputedOpen: {} });
});

afterEach(cleanup);

describe('corridor upgrade panel', () => {
  it('drops a target track the new set does not have', () => {
    // a metro line exists in Iron Horse and in no vanilla table, so switching the set leaves
    // the stored label naming nothing
    useRouteStore.setState({ corridor: { ...EMPTY_CORRIDOR, target: 'MTRO', pieces: 1000 } });
    useSettingsStore.setState({ game: { ...GAME, trainSet: 'vanilla' } });

    draw();

    expect(screen.getByText(/Pick the track to convert to/)).toBeTruthy();
  });

  it('asks for what it is missing, one thing at a time', () => {
    draw(null);
    expect(screen.getByText(/Build a consist and pick a cargo/)).toBeTruthy();
    cleanup();

    draw();
    expect(screen.getByText(/Pick the track to convert to/)).toBeTruthy();
    cleanup();

    useRouteStore.setState({ corridor: { ...EMPTY_CORRIDOR, target: 'ELRL' } });
    draw();
    expect(screen.getByText(/State the length of the corridor/)).toBeTruthy();
    cleanup();

    useRouteStore.setState({ corridor: { ...EMPTY_CORRIDOR, target: 'ELRL', pieces: 1000 } });
    draw();
    expect(screen.getByText(/Pick the engine that would replace/)).toBeTruthy();
  });

  it('does not offer the track the route already runs on', async () => {
    // Mantine draws the options only once the dropdown is open, so a closed select would let
    // any assertion about them pass
    draw();
    const current = activeRailtype(GAME, CALC.trackType);
    await userEvent.click(document.querySelector('.network-inputs input')!);
    // the option class is named after whichever component opened the list; the attribute is
    // what they share (CLAUDE.md, the skin notes on Mantine)
    const offered = [...document.querySelectorAll('[data-combobox-option]')].map(
      (option) => option.textContent,
    );
    const expected = railtypeOptions(selectableRailtypes(GAME))
      .filter((option) => option.railtype.label !== current.label)
      .map((option) => option.name);
    expect(offered).toEqual(expected);
    expect(offered.length).toBeGreaterThan(0);
  });

  /** What the "Load threshold" row says, whatever the figure beside it is. */
  function thresholdRow() {
    const row = [...document.querySelectorAll('tbody tr')].find((tr) =>
      (tr.textContent ?? '').includes('Load threshold'),
    );
    return row?.textContent ?? '';
  }

  it('says how many trains are missing, and stops saying it once they are there', () => {
    const electric = trains.find((t) => t.id === 'peasweep')!;
    const corridor = { target: 'ELRL', pieces: 10_000, engineId: electric.id };
    useRouteStore.setState({ corridor: { ...corridor, trains: 1 } });
    draw();
    const short = thresholdRow();
    expect(short).toMatch(/\d+ short/);
    const threshold = Number(/threshold, trains(\d+)/.exec(short)?.[1]);
    expect(threshold).toBeGreaterThan(1);
    cleanup();

    useRouteStore.setState({ corridor: { ...corridor, trains: threshold } });
    draw();
    expect(thresholdRow()).toContain('the corridor carries enough');
    expect(thresholdRow()).not.toMatch(/short/);
  });

  it('names the counting rule at the length field without anything opened', () => {
    useRouteStore.setState({ corridor: { ...EMPTY_CORRIDOR, target: 'ELRL' } });
    draw();
    const field = screen.getByLabelText(t('corridor.pieces'));
    const root = field.closest('.mantine-InputWrapper-root')!;
    const rule = root.querySelector('.mantine-InputWrapper-description');
    expect(rule?.textContent).toBe(t('network.pieceRuleShort'));
    expect(rule).toBeVisible();
    // the block still says what it is missing, in view
    expect(screen.getByText(t('corridor.needPieces'))).toBeVisible();
  });

  it('folds the full rule and the assumptions under "How it\'s computed"', async () => {
    const electric = trains.find((t) => t.id === 'peasweep')!;
    useRouteStore.setState({
      corridor: { target: 'ELRL', pieces: 1000, trains: 4, engineId: electric.id },
    });
    draw();
    const folded = [
      screen.getByText(/Length in track pieces/),
      screen.getByText(/not a payback time/),
    ];
    for (const text of folded) expect(text).not.toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: t('howComputed.title') }));
    for (const text of folded) await waitFor(() => expect(text).toBeVisible());
    expect(screen.getByText(/bought at full price/)).toBeVisible();
    expect(screen.getByText(/figured on level track/)).toBeVisible();
  });

  it('keeps the warning about a hand-entered time in view', () => {
    const electric = trains.find((t) => t.id === 'peasweep')!;
    useRouteStore.setState({
      corridor: { target: 'ELRL', pieces: 1000, trains: 4, engineId: electric.id },
    });
    draw({ ...ROUTE, loadedDaysOverride: 20 });
    expect(screen.getByText(t('corridor.manualDays'))).toBeVisible();
  });

  it('opens its answer with the yearly delta, the rest in the order it always had', () => {
    const electric = trains.find((t) => t.id === 'peasweep')!;
    useRouteStore.setState({
      corridor: { target: 'ELRL', pieces: 1000, trains: 4, engineId: electric.id },
    });
    draw();
    const labels = [...document.querySelectorAll('tbody tr')].map(
      (tr) => tr.querySelector('td')?.textContent ?? '',
    );
    expect(labels).toEqual([
      t('corridor.yearlyDelta'),
      t('corridor.roundTrip'),
      t('corridor.tripsPerYear'),
      t('corridor.incomePerTrip'),
      t('corridor.runningCost'),
      t('corridor.gradeSpeed'),
      t('corridor.trainProfit'),
      t('corridor.maintenanceDelta'),
      t('corridor.threshold'),
      t('corridor.capital'),
      t('corridor.breakEven'),
    ]);
  });
});
