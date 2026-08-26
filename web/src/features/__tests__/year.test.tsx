/**
 * The buy-menu year as the player meets it: one setting for the whole calculator. A year
 * typed on any tab is the same year every other tab works in, and it outlives a reload
 * because it lives in the settings — the catalogue used to keep its own and forget it.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ConsistPage from '../consist/ConsistPage';
import IndustrySupplyPage from '../industry-supply/IndustrySupplyPage';
import OptimizerPage from '../optimizer/OptimizerPage';
import SettingsPage from '../settings/SettingsPage';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../engine/settings';
import { useSettingsStore } from '../../state/settingsStore';

function draw(ui: React.ReactNode) {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter>{ui}</MemoryRouter>
    </MantineProvider>,
  );
}

/** The settings tab draws the same year, under a label of its own. */
function drawSettings() {
  return draw(<SettingsPage />);
}

/** The year field is labelled the same on every tab that has one. */
function yearField(): HTMLInputElement {
  return screen.getByLabelText(/year/i) as HTMLInputElement;
}

beforeEach(() => {
  useSettingsStore.setState({
    // both sets: the supply tab is hidden without FIRS, and its industry list would be empty
    game: { ...DEFAULT_GAME_SETTINGS, ironHorse: true, firs: true },
    calc: { ...DEFAULT_CALC_SETTINGS },
  });
});

afterEach(cleanup);

describe('one year for the whole calculator', () => {
  it('starts every tab from the same default', () => {
    expect(DEFAULT_CALC_SETTINGS.priceYear).toBe(1950);

    // the optimizer is the tab this requirement was written for: its own default was 1938
    for (const Page of [ConsistPage, IndustrySupplyPage, OptimizerPage]) {
      const { unmount } = draw(<Page />);
      expect(yearField().value).toBe('1950');
      unmount();
    }
  });

  it('writes a year typed on a tab into the settings', async () => {
    const user = userEvent.setup();
    draw(<ConsistPage />);

    await user.clear(yearField());
    await user.type(yearField(), '1975');
    await user.tab();

    expect(useSettingsStore.getState().calc.priceYear).toBe(1975);
  });

  it('takes a year on Enter too, without waiting for the field to be left', async () => {
    const user = userEvent.setup();
    draw(<ConsistPage />);

    await user.clear(yearField());
    await user.type(yearField(), '1975{Enter}');

    expect(useSettingsStore.getState().calc.priceYear).toBe(1975);
  });

  it('does not walk the whole calculator through the years being typed', async () => {
    const user = userEvent.setup();
    draw(<ConsistPage />);
    const seen: number[] = [];
    const stop = useSettingsStore.subscribe((s) => seen.push(s.calc.priceYear));

    await user.clear(yearField());
    await user.type(yearField(), '1975');
    await user.tab();
    stop();

    // 1, 19 and 197 are years the player never asked for: each would recompute every tab
    // and write to localStorage on the way to 1975
    expect(seen).toEqual([1975]);
  });

  it('shows a year set elsewhere, and keeps it across a remount', async () => {
    const user = userEvent.setup();
    const { unmount } = draw(<ConsistPage />);
    await user.clear(yearField());
    await user.type(yearField(), '1975');
    await user.tab();
    unmount();

    // another tab, same year
    const supply = draw(<IndustrySupplyPage />);
    expect(yearField().value).toBe('1975');
    supply.unmount();

    // and the catalogue still has it after being torn down and drawn again
    draw(<ConsistPage />);
    expect(yearField().value).toBe('1975');
  });

  it('takes the year with it when the tab is left without the field being blurred', async () => {
    const user = userEvent.setup();
    const { unmount } = draw(<ConsistPage />);

    await user.clear(yearField());
    await user.type(yearField(), '1975');
    // a tab is left by clicking a link, which Safari and Firefox do not focus — no blur
    unmount();

    expect(useSettingsStore.getState().calc.priceYear).toBe(1975);
  });

  it('keeps a year the game allows but a tab would not think to offer', async () => {
    const user = userEvent.setup();
    draw(<ConsistPage />);

    // an imported game may sit outside any span a field would pick; the range belongs to
    // the setting, and the game accepts the year
    await user.clear(yearField());
    await user.type(yearField(), '1700');
    await user.tab();

    expect(useSettingsStore.getState().calc.priceYear).toBe(1700);
    expect(yearField().value).toBe('1700');
  });

  it('keeps the previous year when the field is emptied', async () => {
    const user = userEvent.setup();
    draw(<ConsistPage />);

    await user.clear(yearField());
    await user.tab();

    expect(useSettingsStore.getState().calc.priceYear).toBe(1950);
    expect(yearField().value).toBe('1950');
  });
});

describe('the year on the settings tab', () => {
  /** The settings field, which carries its own label rather than the tabs' one. */
  function settingsYear(): HTMLInputElement {
    const row = screen.getByText('Calculation year').closest('.setting-row')!;
    return row.querySelector('input')!;
  }

  it('edits the same setting under the same rule as the tabs', async () => {
    const user = userEvent.setup();
    drawSettings();
    const seen: number[] = [];
    const stop = useSettingsStore.subscribe((s) => seen.push(s.calc.priceYear));

    await user.clear(settingsYear());
    await user.type(settingsYear(), '1975');
    await user.tab();
    stop();

    expect(useSettingsStore.getState().calc.priceYear).toBe(1975);
    // and not through 1, 19, 197 on the way — the tabs' field does not, and it is one setting
    expect(seen).toEqual([1975]);
  });

  it('accepts a year outside the span a tab would offer', async () => {
    const user = userEvent.setup();
    drawSettings();

    await user.clear(settingsYear());
    await user.type(settingsYear(), '1700');
    await user.tab();

    expect(useSettingsStore.getState().calc.priceYear).toBe(1700);
  });
});
