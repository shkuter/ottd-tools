/**
 * The network upkeep panel: what it lists, what it adds up to, and what it says when the
 * game charges nothing at all.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NetworkMaintenance } from '../NetworkMaintenance';
import { useLocaleStore } from '../../../state/localeStore';
import { useRouteStore } from '../../../state/routeStore';
import { useSettingsStore } from '../../../state/settingsStore';
import { DEFAULT_GAME_SETTINGS } from '../../../engine/settings';

function draw() {
  return render(
    <MantineProvider forceColorScheme="dark">
      <NetworkMaintenance />
    </MantineProvider>,
  );
}

/** Money cells as numbers, in the order they are drawn. */
function amounts() {
  return [...document.querySelectorAll('.cell-num')].map((cell) =>
    Number(cell.textContent!.replace(/[^\d-]/g, '')),
  );
}

beforeEach(() => {
  useLocaleStore.getState().setLocale('en');
  useSettingsStore.setState({
    game: { ...DEFAULT_GAME_SETTINGS, infrastructureMaintenance: true },
  });
  useRouteStore.setState({
    network: { railPieces: { RAIL: 1000 }, signals: 200, stations: 40 },
  });
});

afterEach(cleanup);

describe('network upkeep panel', () => {
  it('adds its lines up to the total it shows', () => {
    draw();
    const values = amounts();
    const lines = values.slice(0, -1);
    expect(lines.length).toBe(3); // track, signals, station tiles
    expect(values.at(-1)).toBe(lines.reduce((total, v) => total + v, 0));
  });

  it('bills nothing it holds none of', () => {
    useRouteStore.setState({ network: { railPieces: { RAIL: 1000 }, signals: 0, stations: 0 } });
    draw();
    // one track line and the total
    expect(amounts().length).toBe(2);
    // signals keep their input field; what they lose is the billed line
    const rows = [...document.querySelectorAll('tbody tr')].map((tr) => tr.textContent ?? '');
    expect(rows.some((text) => text.includes('Signals'))).toBe(false);
  });

  it('starts empty rather than at a zero nobody typed', () => {
    useRouteStore.setState({ network: { railPieces: {}, signals: 0, stations: 0 } });
    draw();
    const fields = [...document.querySelectorAll<HTMLInputElement>('.network-inputs input')];
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) expect(field.value).toBe('');
  });

  it('charges nothing, and says so, when the game has the whole item off', () => {
    useSettingsStore.setState({
      game: { ...DEFAULT_GAME_SETTINGS, infrastructureMaintenance: false },
    });
    draw();
    expect(amounts().every((v) => v === 0)).toBe(true);
    expect(screen.getByText(/Infrastructure maintenance is off/)).toBeTruthy();
  });
});

/**
 * A count field shows a zero as an empty box — a count nobody stated is not a count of none.
 * Mantine steps an empty field to its `startValue`, which is zero unless told otherwise, so
 * the field would step from empty to zero and look empty again: the arrow appeared dead.
 */
describe('the arrows of an empty count field', () => {
  it('steps up to one rather than back to nothing', async () => {
    useRouteStore.setState({ network: { railPieces: {}, signals: 0, stations: 0 } });
    draw();
    const user = userEvent.setup();

    const signals = screen.getByLabelText('Signals') as HTMLInputElement;
    expect(signals.value, 'a count of none is shown as an empty field').toBe('');

    const up = signals
      .closest('.mantine-InputWrapper-root')!
      .querySelectorAll('.mantine-NumberInput-control')[0];
    await user.click(up);

    expect(signals.value).toBe('1');
    expect(useRouteStore.getState().network.signals).toBe(1);
  });
});
