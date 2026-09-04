/**
 * The panels that price the network itself live on their own tab now. What the route income
 * tab owes in their place is a line saying where they went — an empty stretch under the
 * profitability panel would read as something broken.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import RoutePage from '../RoutePage';
import { trains } from '../../../dataset';
import { useConsistStore } from '../../../state/consistStore';
import { useLocaleStore } from '../../../state/localeStore';
import { useRouteStore } from '../../../state/routeStore';
import { useSettingsStore } from '../../../state/settingsStore';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../../engine/settings';

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
  useLocaleStore.getState().setLocale('en');
  useSettingsStore.setState({
    game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse', infrastructureMaintenance: true },
    calc: { ...DEFAULT_CALC_SETTINGS, trackType: 'RAIL' },
  });
  useConsistStore.setState({
    entries: [{ train: trains.find((t) => t.kind === 'engine' && t.power_hp > 0)!, count: 1 }],
  });
  useRouteStore.setState({ network: { railPieces: { RAIL: 1000 }, signals: 200, stations: 40 } });
});

afterEach(cleanup);

describe('the route income tab after the network panels left it', () => {
  it('points at the tab they moved to', () => {
    draw();

    const link = screen.getByRole('link', { name: 'Network' });
    expect(link.getAttribute('href')).toBe('/network');
  });

  it('no longer carries the panels themselves', () => {
    draw();

    // their headings and their anchors are both gone from this tab
    expect(screen.queryByText('Network upkeep')).toBeNull();
    expect(document.querySelector('#network-maintenance')).toBeNull();
    expect(document.querySelector('#network-corridor')).toBeNull();
    expect(document.querySelector('#network-signals')).toBeNull();
  });
});
