/**
 * The network tab states the trip it borrowed from the route income tab rather than entering
 * one of its own — and says so plainly when there is no trip to borrow.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import NetworkPage from '../NetworkPage';
import { trains } from '../../../dataset';
import { useConsistStore } from '../../../state/consistStore';
import { useLocaleStore } from '../../../state/localeStore';
import { useRouteStore } from '../../../state/routeStore';
import { useSettingsStore } from '../../../state/settingsStore';
import { DEFAULT_GAME_SETTINGS } from '../../../engine/settings';

function draw() {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter>
        <NetworkPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  useLocaleStore.getState().setLocale('en');
  // the consist below is an Iron Horse one, and a consist outside the active set is filtered
  // out of the trip exactly as it is on the route income tab
  useSettingsStore.setState({ game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' } });
  useConsistStore.setState({ entries: [] });
  useRouteStore.setState({ cargoLabel: 'COAL', distanceTiles: 120 });
});

afterEach(cleanup);

describe('network tab', () => {
  it('states the trip it borrowed, and links to where it is entered', () => {
    const engine = trains.find((train) => train.kind === 'engine' && train.power_hp > 0)!;
    const wagon = trains.find(
      (train) => train.kind === 'wagon' && train.id.startsWith('coal_hopper_car_type_1_pony'),
    )!;
    useConsistStore.setState({
      entries: [
        { train: engine, count: 1 },
        { train: wagon, count: 5 },
      ],
    });

    draw();

    const summary = screen.getByText(/route income tab/i);
    expect(summary.textContent).toContain('120');
    // what pulls it, and how many vehicles the builder holds — engine included
    expect(summary.textContent).toContain(engine.name);
    expect(summary.textContent).toContain('6');
    expect(screen.getByRole('link', { name: 'Route income' }).getAttribute('href')).toBe('/income');
  });

  it('follows the trip when it changes on the other tab', () => {
    const engine = trains.find((train) => train.kind === 'engine' && train.power_hp > 0)!;
    useConsistStore.setState({ entries: [{ train: engine, count: 1 }] });
    // the signal panel needs counts before it states any figure to compare
    useRouteStore.setState({ network: { railPieces: { RAIL: 5_000 }, signals: 800, stations: 0 } });

    const { rerender } = draw();
    expect(screen.getByText(/route income tab/i).textContent).toContain('120');

    const before = document.querySelector('#network-signals')!.textContent!;

    // the same stores the route income tab writes to; one assembly serves both tabs
    useRouteStore.setState({ distanceTiles: 250 });
    useConsistStore.setState({
      entries: [
        { train: engine, count: 1 },
        {
          train: trains.find(
            (train) => train.kind === 'wagon' && train.id.startsWith('coal_hopper_car_type_1_pony'),
          )!,
          count: 20,
        },
      ],
    });
    rerender(
      <MantineProvider forceColorScheme="dark">
        <MemoryRouter>
          <NetworkPage />
        </MemoryRouter>
      </MantineProvider>,
    );

    const note = screen.getByText(/route income tab/i).textContent!;
    expect(note).toContain('250');
    expect(note).toContain('21');
    // and the panels answer about the new consist, not the old one: a longer train brakes
    // over a longer distance, so the signal figures move with it
    expect(document.querySelector('#network-signals')!.textContent).not.toBe(before);
  });

  it('carries the three panels, in the order the tab asks its questions', () => {
    draw();

    const panels = [...document.querySelectorAll('#network-maintenance, #network-corridor, #network-signals')];
    expect(panels.map((panel) => panel.id)).toEqual([
      'network-maintenance',
      'network-corridor',
      'network-signals',
    ]);
  });

  it('says what is missing when no consist is built, and still prices the network', () => {
    // counts do not depend on the trip, so the upkeep panel answers as it always did
    useRouteStore.setState({ network: { railPieces: { RAIL: 1_000 }, signals: 200, stations: 40 } });

    draw();

    expect(screen.getByText(/no consist is built/i)).toBeTruthy();
    expect(screen.queryByText(/route income tab:/i)).toBeNull();
    const upkeep = document.querySelector('#network-maintenance')!.textContent!;
    expect(upkeep).toContain('Network upkeep');
    // a total, not a dash: the panel has everything it needs
    expect(upkeep).toMatch(/\d/);
  });
});
