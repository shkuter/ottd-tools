/**
 * The braking settings are the patchpack's: vanilla has no braking model at all, and a train
 * there stops dead at a signal. So the rows exist only in a game on JGRPP — and the value a
 * player set on a patchpack game survives the switch, as linear maintenance growth does.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SettingsPage from '../SettingsPage';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../../engine/settings';
import { useSettingsStore } from '../../../state/settingsStore';
import { useLocaleStore } from '../../../state/localeStore';

function draw() {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  useLocaleStore.getState().setLocale('en');
  useSettingsStore.setState({
    game: { ...DEFAULT_GAME_SETTINGS },
    calc: { ...DEFAULT_CALC_SETTINGS },
  });
});

afterEach(cleanup);

describe('the braking settings', () => {
  it('are absent from a game that is not on the patchpack', () => {
    draw();
    expect(screen.queryByText('Train braking model')).toBeNull();
    expect(screen.queryByText(/acceleration\/braking scaling factor/i)).toBeNull();
  });

  it('appear once the game is on JGRPP', () => {
    useSettingsStore.setState({
      game: { ...DEFAULT_GAME_SETTINGS, jgrpp: true },
      calc: { ...DEFAULT_CALC_SETTINGS },
    });
    draw();
    expect(screen.getByText('Train braking model')).toBeTruthy();
    expect(screen.getByText(/acceleration\/braking scaling factor/i)).toBeTruthy();
  });

  it('keep a value set on a patchpack game when the switch goes off', () => {
    useSettingsStore.setState({
      game: { ...DEFAULT_GAME_SETTINGS, jgrpp: true, brakingModel: 'realistic' },
      calc: { ...DEFAULT_CALC_SETTINGS },
    });
    useSettingsStore.getState().setGame('jgrpp', false);
    // the row is gone from the screen, but nothing was rewritten behind it
    expect(useSettingsStore.getState().game.brakingModel).toBe('realistic');
  });
});
