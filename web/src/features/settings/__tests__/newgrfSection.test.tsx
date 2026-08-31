/**
 * The NewGRF section as the player meets it: three sets of equal rank in one place, each
 * with its own parameters shown as part of it. The game loads all three the same way, so
 * none of them gets a section of its own — and a set that is off has nothing to configure.
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

/** The set carries the same name in both locales: the game does not translate it either. */
const BASE_COSTS = 'Base Costs';

/** The row a label sits in, whether it is nested under a set or stands on its own. */
function rowOf(label: string | RegExp): HTMLElement {
  return screen.getByText(label).closest('.setting-row') as HTMLElement;
}

beforeEach(() => {
  useLocaleStore.getState().setLocale('en');
  useSettingsStore.setState({
    game: { ...DEFAULT_GAME_SETTINGS },
    calc: { ...DEFAULT_CALC_SETTINGS },
  });
});

afterEach(cleanup);

describe('the NewGRF section', () => {
  it('holds the train-set choice and both switches, none in a section of its own', () => {
    draw();

    const section = screen.getByText('NewGRF sets').closest('fieldset')!;
    // the roster is one per game, so it is a select; the coexisting sets are switches
    for (const set of ['Train set', 'FIRS 5', BASE_COSTS]) {
      expect(section.textContent).toContain(set);
    }
    // the switches are siblings of one rank: no set carries a fieldset of its own
    const own = [...document.querySelectorAll('fieldset')].filter((f) =>
      f.querySelector('legend')?.textContent?.includes(BASE_COSTS),
    );
    expect(own).toHaveLength(0);
  });

  it('keeps a set name the game does not translate', () => {
    useLocaleStore.getState().setLocale('ru');
    draw();
    expect(screen.getByText(BASE_COSTS)).toBeTruthy();
  });

  it('shows the FIRS economy as a parameter of FIRS, not a setting of the same rank', () => {
    useSettingsStore.setState({ game: { ...DEFAULT_GAME_SETTINGS, firs: true } });
    draw();

    expect(rowOf('Economy').className).toContain('setting-row--nested');
    // the set's own switch is not nested — it is what the parameter hangs from
    expect(rowOf('FIRS 5').className).not.toContain('setting-row--nested');
  });

  it('shows the Iron Horse capacity parameter as a parameter of the roster choice', () => {
    useSettingsStore.setState({ game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' } });
    draw();

    expect(rowOf('Wagon capacity GRF parameter').className).toContain('setting-row--nested');
    expect(rowOf('Train set').className).not.toContain('setting-row--nested');
  });

  it('the roster choice changes the roster without touching the other sets', () => {
    useSettingsStore.setState({
      game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'vanilla', firs: true, basecostGrf: true },
    });
    draw();

    // the select shows the chosen roster by its untranslated proper name
    expect(screen.getByDisplayValue('Vanilla OpenTTD')).toBeTruthy();
    // FIRS and Base Costs keep their own switches and their own state
    expect(useSettingsStore.getState().game.firs).toBe(true);
    expect(useSettingsStore.getState().game.basecostGrf).toBe(true);
    // the capacity parameter belongs to Iron Horse and is not offered for vanilla
    expect(screen.queryByText('Wagon capacity GRF parameter')).toBeNull();
  });

  it('nests the Base Costs multipliers the same way', () => {
    useSettingsStore.setState({ game: { ...DEFAULT_GAME_SETTINGS, basecostGrf: true } });
    draw();

    expect(rowOf('Locomotive purchase cost').className).toContain('setting-row--nested');
    expect(rowOf(BASE_COSTS).className).not.toContain('setting-row--nested');
  });

  it('puts each parameter under the set it belongs to, not merely somewhere nested', () => {
    useSettingsStore.setState({
      game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse', firs: true, basecostGrf: true },
    });
    draw();

    // reading the section top to bottom: a set, then what is that set's, then the next set.
    // Nesting alone would not catch a parameter that drifted under a neighbouring switch.
    const labels = [...document.querySelectorAll('.setting-row')]
      .map((row) => row.querySelector('.setting-label > span')?.textContent ?? '')
      .filter(Boolean);
    const at = (label: string) => labels.indexOf(label);

    expect(at('Iron Horse')).toBeLessThan(at('Wagon capacity GRF parameter'));
    expect(at('Wagon capacity GRF parameter')).toBeLessThan(at('FIRS 5'));
    expect(at('FIRS 5')).toBeLessThan(at('Economy'));
    expect(at('Economy')).toBeLessThan(at(BASE_COSTS));
    expect(at(BASE_COSTS)).toBeLessThan(at('Locomotive purchase cost'));
  });

  it('hides the parameters of a set that is switched off', () => {
    draw();

    expect(screen.queryByText('Economy')).toBeNull();
    expect(screen.queryByText('Locomotive purchase cost')).toBeNull();
    expect(screen.queryByText('Wagon capacity GRF parameter')).toBeNull();
  });
});
