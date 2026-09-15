/**
 * The signal density panel: what it shows, what it warns about, and what it asks for when it
 * cannot compute yet.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { t } from '../../../i18n';
import { useUiStore } from '../../../state/uiStore';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SignalDensity } from '../SignalDensity';
import { activeRailtype, cargoByLabel, trains, trainsMeta } from '../../../dataset';
import { consistPhysics } from '../../../engine/consist';
import { balancingSpeed } from '../../../engine/physics';
import { useLocaleStore } from '../../../state/localeStore';
import { EMPTY_SIGNALS, useRouteStore } from '../../../state/routeStore';
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
  jgrpp: true,
  brakingModel: 'realistic',
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
      <SignalDensity route={route} />
    </MantineProvider>,
  );
}

/** Figures of the summary table, in the order they are drawn. */
function cells() {
  return [...document.querySelectorAll('.cell-num')].map((cell) => cell.textContent!);
}

beforeEach(() => {
  useLocaleStore.getState().setLocale('en');
  useSettingsStore.setState({ game: GAME, calc: CALC });
  useRouteStore.setState({
    network: { railPieces: { RAIL: 10372 }, signals: 1612, stations: 0 },
    signals: EMPTY_SIGNALS,
  });
  useUiStore.setState({ howComputedOpen: {} });
});

afterEach(cleanup);

describe('signal density panel', () => {
  it('shows the braking distance, the useful spacing and what the signals cost', () => {
    draw();
    expect(screen.getByText('Braking distance')).toBeTruthy();
    expect(screen.getByText('Useful spacing')).toBeTruthy();
    // eight figures: saving, then speed, braking, useful spacing, current spacing,
    // recommended heads, upkeep now, upkeep at that spacing
    expect(cells()).toHaveLength(8);
  });

  it('brakes from the speed the trip is run at, not from the consist limit', () => {
    draw();
    const { physics } = consistPhysics(
      ROUTE.entries,
      coal,
      CALC.capacityIndex,
      GAME,
      activeRailtype(GAME, CALC.trackType),
    );
    const settled = balancingSpeed(physics, 0, GAME.accelerationModel);
    // a loaded freight train never reaches its own limit, so the two differ — which is what
    // makes this worth asserting rather than reading either figure
    expect(settled).toBeLessThan(physics.maxSpeedInternal);
    // the figure after the saving is the speed braking is computed from
    // ConvertKmhishSpeedToDisplaySpeed (strings.cpp): both steps truncate, as in the game
    expect(Number(cells()[1]!.replace(/[^\d]/g, ''))).toBe(
      Math.trunc(Math.trunc(settled * 10 * 1.609344) / 16),
    );
  });

  it('asks for the network before it computes anything', () => {
    useRouteStore.setState({ network: { railPieces: {}, signals: 0, stations: 0 } });
    draw();
    expect(screen.getByText(/State the length of the network/)).toBeTruthy();
    expect(cells()).toHaveLength(0);
  });

  it('asks for a consist when there is none', () => {
    draw(null);
    expect(screen.getByText(/Build a consist and pick a cargo first/)).toBeTruthy();
  });

  it('warns instead of promising a saving when signals are too sparse', () => {
    useRouteStore.setState({
      network: { railPieces: { RAIL: 10372 }, signals: 60, stations: 0 },
    });
    draw();
    expect(screen.getByRole('alert').textContent).toMatch(/capacity suffers/);
    // the saving opens the table
    expect(cells()[0]).toMatch(/^[^\d]*0/);
  });

  it('says the descent does nothing under the original acceleration model', () => {
    // the block reads the game off the route it was handed, so that is where the case sets it
    draw({ ...ROUTE, game: { ...GAME, accelerationModel: 'original' } });
    expect(screen.getByText(/does not enter the calculation/)).toBeVisible();
  });

  it('says the game charges nothing when upkeep is switched off', () => {
    draw({ ...ROUTE, game: { ...GAME, infrastructureMaintenance: false } });
    expect(screen.getByText(/network costs nothing to keep/)).toBeVisible();
  });

  it('explains the original braking model instead of measuring a braking distance', async () => {
    draw({ ...ROUTE, game: { ...GAME, brakingModel: 'original' } });
    // the braking row says there is none in view; why the spacing falls back is folded
    expect(screen.getByText(t('signals.noBraking'))).toBeVisible();
    const why = screen.getByText(/stops dead at a signal and occupies exactly one block/);
    expect(why).not.toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: t('howComputed.title') }));
    await waitFor(() => expect(why).toBeVisible());
  });

  it('folds the counting rule, and asks for what it is missing in view', async () => {
    useRouteStore.setState({ network: { railPieces: {}, signals: 0, stations: 0 } });
    draw();
    expect(screen.getByText(/State the length of the network/)).toBeVisible();
    const rule = screen.getByText(/measured in tiles along one track/);
    expect(rule).not.toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: t('howComputed.title') }));
    await waitFor(() => expect(rule).toBeVisible());
  });

  it('opens its answer with the saving, the rest in the order it always had', () => {
    draw();
    const labels = [...document.querySelectorAll('tbody tr')].map(
      (tr) => tr.querySelector('td')?.textContent ?? '',
    );
    expect(labels).toEqual([
      t('signals.saving'),
      t('signals.speed'),
      t('signals.brakingDistance'),
      t('signals.usefulSpacing'),
      t('signals.currentSpacing'),
      t('signals.recommended'),
      t('signals.upkeepNow'),
      t('signals.upkeepRecommended'),
    ]);
  });
});
