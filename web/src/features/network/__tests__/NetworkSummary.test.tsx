/**
 * The summary that opens the network tab: what the year costs, what the money mostly goes on,
 * and what is worth trimming — all of it read off the panels below rather than computed here.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import NetworkPage from '../NetworkPage';
import { cargoByLabel, trains } from '../../../dataset';
import { useConsistStore } from '../../../state/consistStore';
import { useLocaleStore } from '../../../state/localeStore';
import { EMPTY_CORRIDOR, EMPTY_SIGNALS, useRouteStore } from '../../../state/routeStore';
import { useSettingsStore } from '../../../state/settingsStore';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type GameSettings,
} from '../../../engine/settings';

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

/** A densely signalled network: closer than the useful spacing, so thinning it saves money. */
const NETWORK = { railPieces: { RAIL: 10_372 }, signals: 4_000, stations: 514 };

function draw() {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter>
        <NetworkPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

/** Money as a number, however the locale spells it. */
function amount(text: string): number {
  return Number(text.replace(/[^\d-]/g, ''));
}

beforeEach(() => {
  useLocaleStore.getState().setLocale('en');
  useSettingsStore.setState({ game: GAME, calc: CALC });
  useConsistStore.setState({
    entries: [
      { train: engine, count: 1 },
      { train: hopper, count: 14 },
    ],
  });
  useRouteStore.setState({
    cargoLabel: coal.label,
    distanceTiles: 100,
    network: NETWORK,
    corridor: EMPTY_CORRIDOR,
    signals: EMPTY_SIGNALS,
  });
});

afterEach(cleanup);

describe('network summary', () => {
  it('states the year and the line most of it goes on', () => {
    draw();

    expect(screen.getByText('Owning it for a year')).toBeTruthy();
    // which line leads is the model's answer (costliestLine covers that); what the summary
    // owes is naming it with its share of the year
    expect(screen.getByText(/Most of it: .+ — \d+% of the year/)).toBeTruthy();
  });

  it('states the same year as the upkeep panel below it', () => {
    draw();

    const summaryTotal = amount(
      screen.getByText('Owning it for a year').parentElement!.querySelector('.cell-num')!.textContent!,
    );
    const panelTotal = amount(
      document.querySelector('#network-maintenance .cell-num.big')!.textContent!,
    );
    expect(summaryTotal).toBe(panelTotal);
  });

  it('offers thinning the signals, and links to the panel that computed it', () => {
    draw();

    const action = screen.getByRole('link', { name: /Thin the signals/ });
    expect(action.getAttribute('href')).toBe('#network-signals');
    // the link has somewhere to go: the panel it names is on the page
    expect(document.querySelector('#network-signals')).toBeTruthy();
  });

  it('states the share of the upkeep each action saves', () => {
    draw();

    const row = screen.getByRole('link', { name: /Thin the signals/ }).closest('tr')!;
    expect(row.textContent).toMatch(/\d+% of the upkeep/);
  });

  it('names an unanswered panel even when another already found a saving', () => {
    // signals pay to thin, but no target track is chosen, so the corridor has no answer yet
    draw();

    expect(screen.getByRole('link', { name: /Thin the signals/ })).toBeTruthy();
    expect(screen.getByText(/Not everything is answered yet/)).toBeTruthy();
  });

  it('asks for the counts instead of showing a total of nothing', () => {
    useRouteStore.setState({ network: { railPieces: {}, signals: 0, stations: 0 } });

    draw();

    expect(screen.getByText(/State what the network holds/)).toBeTruthy();
    expect(screen.queryByText('Owning it for a year')).toBeNull();
  });

  it('shows what owning costs and names what is missing when no trip is stated', () => {
    useConsistStore.setState({ entries: [] });

    draw();

    expect(screen.getByText('Owning it for a year')).toBeTruthy();
    expect(screen.getByText(/computed from a consist/)).toBeTruthy();
  });

  it('says plainly when everything is answered and nothing pays to trim', () => {
    const electric = trains.find((t) => t.id === 'peasweep')!;
    useRouteStore.setState({
      // a line with no signals has nothing to thin, and a corridor of one train does not
      // repay its wire — both panels answered, and neither answer is a saving
      network: { ...NETWORK, signals: 0 },
      corridor: { target: 'ELRL', pieces: 10_000, trains: 1, engineId: electric.id },
    });

    draw();

    expect(screen.getByText(/Nothing here pays to trim/)).toBeTruthy();
  });

  it('does not call a network lean while a panel still cannot answer', () => {
    // the trip is stated, but no target track is chosen, so the corridor panel has no answer
    useRouteStore.setState({ network: { ...NETWORK, signals: 0 }, corridor: EMPTY_CORRIDOR });

    draw();

    expect(screen.getByText(/Not everything is answered yet/)).toBeTruthy();
    expect(screen.queryByText(/Nothing here pays to trim/)).toBeNull();
  });

  it('asks for the counts even when the game charges no upkeep', () => {
    // the counts are stated; the game simply does not bill for them
    useSettingsStore.setState({ game: { ...GAME, infrastructureMaintenance: false } });

    draw();

    // the panel below says the article is switched off; the summary must not answer instead
    // that nothing is owned
    expect(screen.queryByText(/State what the network holds/)).toBeNull();
    expect(screen.getByText('Owning it for a year')).toBeTruthy();
  });
});
