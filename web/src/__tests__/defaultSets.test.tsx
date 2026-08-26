/**
 * A calculator that has been told nothing about the player's game runs vanilla: the game
 * loads no NewGRF by itself, a set comes from the savegame. The FIRS tabs follow the set —
 * with FIRS off there are no chains and no industry to supply.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../engine/settings';
import { useSettingsStore } from '../state/settingsStore';

function draw(path = '/') {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  useSettingsStore.setState({
    game: { ...DEFAULT_GAME_SETTINGS },
    calc: { ...DEFAULT_CALC_SETTINGS },
  });
});

afterEach(cleanup);

describe('a fresh calculator', () => {
  it('has every NewGRF switched off', () => {
    expect(DEFAULT_GAME_SETTINGS.ironHorse).toBe(false);
    expect(DEFAULT_GAME_SETTINGS.firs).toBe(false);
    expect(DEFAULT_GAME_SETTINGS.basecostGrf).toBe(false);
  });

  it('hides the FIRS chains tab', async () => {
    draw();
    await screen.findByText('Best train');
    expect(screen.queryByText('FIRS chains')).toBeNull();
  });

  it('does not warn about Iron Horse and inflation when Iron Horse is off', async () => {
    // the fatal GRF error is Iron Horse's; a vanilla game runs inflation perfectly well,
    // and vanilla is what a calculator that has been told nothing computes
    useSettingsStore.setState({ game: { ...DEFAULT_GAME_SETTINGS, inflation: true } });
    draw();
    await screen.findByText('Best train');

    expect(screen.queryByText(/Inflation is on/)).toBeNull();
  });

  it('warns about it once Iron Horse is switched on', async () => {
    useSettingsStore.setState({
      game: { ...DEFAULT_GAME_SETTINGS, inflation: true, ironHorse: true },
    });
    draw();

    expect(await screen.findByText(/Inflation is on/)).toBeTruthy();
  });

  it('sends a direct link to a FIRS tab somewhere useful instead of a dead end', async () => {
    // the address stays registered, so an old link still resolves — but with FIRS off the
    // supply tab has no industries to offer and the graph would draw a set nothing computes with
    for (const path of ['/firs', '/supply']) {
      const { unmount } = draw(path);
      expect(await screen.findByText('Best train for the job')).toBeTruthy();
      unmount();
    }
  });

  it('shows the FIRS chains tab once FIRS is switched on', async () => {
    useSettingsStore.setState({ game: { ...DEFAULT_GAME_SETTINGS, firs: true } });
    draw();
    expect(await screen.findByText('FIRS chains')).toBeTruthy();
  });
});
