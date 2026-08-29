/**
 * The track a route runs on, as the player meets it: one choice for the whole calculator,
 * offered on every tab that searches for consists. Picking it on one tab is picking it
 * everywhere, and the catalogue follows it instead of filtering by a gauge of its own.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ConsistPage from '../consist/ConsistPage';
import IndustrySupplyPage from '../industry-supply/IndustrySupplyPage';
import OptimizerPage from '../optimizer/OptimizerPage';
import RoutePage from '../route/RoutePage';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../engine/settings';
import { useSettingsStore } from '../../state/settingsStore';
import { useConsistStore } from '../../state/consistStore';
import { activeTrains } from '../../dataset';
import { useLocaleStore } from '../../state/localeStore';

function draw(ui: React.ReactNode) {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter>{ui}</MemoryRouter>
    </MantineProvider>,
  );
}

// the label matches the wrapper as well as the field, and Mantine keeps a hidden input
// beside the visible one — the field is the input that is neither
const trackField = (): HTMLInputElement =>
  screen
    .getAllByLabelText(/тип путей/i)
    .find((el) => el.tagName === 'INPUT' && el.getAttribute('type') !== 'hidden') as
    HTMLInputElement;

/**
 * The options of an open Select. Mantine gives each a class named after the component that
 * opened it, so the one thing they share is the attribute (see CLAUDE.md on addressing
 * Mantine components).
 */
const openOptions = (): HTMLElement[] =>
  [...document.querySelectorAll<HTMLElement>('[data-combobox-option]')];

/** Picks by the exact name: "Ж/д" is a substring of most of the others. */
async function pickTrack(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(trackField());
  const option = openOptions().find((el) => el.textContent === name);
  await user.click(option!);
}

beforeEach(() => {
  // track names are data, so the case reads them in one language rather than both
  useLocaleStore.getState().setLocale('ru');
  useSettingsStore.setState({
    game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse', firs: true },
    calc: { ...DEFAULT_CALC_SETTINGS },
  });
});

afterEach(cleanup);

describe('one track type for the whole calculator', () => {
  it('every searching tab offers it', () => {
    for (const Page of [ConsistPage, IndustrySupplyPage, OptimizerPage, RoutePage]) {
      const { unmount } = draw(<Page />);
      expect(trackField()).toBeTruthy();
      unmount();
    }
  });

  it('picking it on one tab is picking it everywhere', async () => {
    const user = userEvent.setup();
    const { unmount } = draw(<OptimizerPage />);
    await pickTrack(user, 'Электрифиц. ж/д');
    expect(useSettingsStore.getState().calc.trackType).toBe('ELRL');
    unmount();

    draw(<ConsistPage />);
    expect(trackField().value).toBe('Электрифиц. ж/д');
  });

  it('the catalogue follows the choice instead of filtering by itself', async () => {
    const user = userEvent.setup();
    draw(<ConsistPage />);
    // there is no track filter of the catalogue's own any more
    expect(screen.queryByLabelText(/^путь$|^track$/i)).toBeNull();

    const rowsOn = async (label: string) => {
      await pickTrack(user, label);
      const table = screen.getAllByRole('table')[0];
      return within(table).getAllByRole('row').length;
    };

    const onNarrowGauge = await rowsOn('Узкоколейная ж/д');
    const onPlainRail = await rowsOn('Ж/д');
    // narrow gauge is a small roster; plain rail is the bulk of the set
    expect(onNarrowGauge).toBeGreaterThan(1);
    expect(onPlainRail).toBeGreaterThan(onNarrowGauge);
  });

  it('does not offer a track the game hides from its build menu', async () => {
    const user = userEvent.setup();
    draw(<OptimizerPage />);
    await user.click(trackField());
    const options = openOptions().map((o) => o.textContent);
    // both high speed tracks share a name; only the electrified one can be built
    expect(options.filter((name) => /высокоскорост/i.test(name ?? ''))).toHaveLength(1);
  });
});

describe('what the catalogue shows on a track', () => {
  /**
   * Whether the catalogue lists a vehicle on this track. It is searched for by name rather
   * than read off the page, because the list is paged and the answer would otherwise depend
   * on which page a vehicle happens to fall.
   */
  const listsVehicle = async (
    user: ReturnType<typeof userEvent.setup>,
    label: string,
    name: string,
  ) => {
    await pickTrack(user, label);
    const search = screen.getByPlaceholderText(/поиск|search/i);
    await user.clear(search);
    await user.type(search, name);
    // a catalogue with nothing in it draws its empty state instead of a table
    const [table] = screen.queryAllByRole('table');
    if (!table) return false;
    return within(table)
      .getAllByRole('row')
      .some((row) => (row.textContent ?? '').includes(name));
  };

  beforeEach(() => {
    // the consist has a table of its own; an empty one keeps the catalogue's first
    useConsistStore.setState({ entries: [] });
  });

  it('draws a dash where a vehicle makes no power here, as the ordering assumes', async () => {
    // the sort map drops a row with no value here rather than ranking it as a zero
    // (`sorting.ts`), and the cell has to say the same thing — a printed 0 would read as a
    // figure the game would give
    const user = userEvent.setup();
    draw(<ConsistPage />);
    await pickTrack(user, 'Ж/д');
    const search = screen.getByPlaceholderText(/поиск|search/i);
    // a wagon: it has no engine of its own on any track
    await user.type(search, 'Coal Hopper');
    const [row] = within(screen.getAllByRole('table')[0]).getAllByRole('row').slice(1);
    const cells = within(row).getAllByRole('cell').map((cell) => cell.textContent);
    expect(cells).toContain('—');
    expect(cells).not.toContain('0');
  });

  it('offers no pure electric where the line carries no wires', async () => {
    // Stalwart is on sale from 1959 to 1992
    useSettingsStore.setState({
      game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse', firs: true },
      calc: { ...DEFAULT_CALC_SETTINGS, priceYear: 1990 },
    });
    const user = userEvent.setup();
    draw(<ConsistPage />);
    // Stalwart draws from the wires and from nothing else
    expect(await listsVehicle(user, 'Электрифиц. ж/д', 'Stalwart')).toBe(true);
    expect(await listsVehicle(user, 'Ж/д', 'Stalwart')).toBe(false);
  });

  it('keeps the vanilla gauges apart, monorail and maglev included', async () => {
    useSettingsStore.setState({
      game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'vanilla', firs: false },
      // a year both the monorail X2001 (1998-2048) and the maglev Leviathan (2020-) sell in
      calc: { ...DEFAULT_CALC_SETTINGS, priceYear: 2040 },
    });
    const user = userEvent.setup();
    draw(<ConsistPage />);

    // the game's own monorail and maglev engines, by the names it gives them
    expect(await listsVehicle(user, 'Монорельсовая ж/д', 'X2001')).toBe(true);
    expect(await listsVehicle(user, 'Магнитная ж/д', 'Leviathan')).toBe(true);
    expect(await listsVehicle(user, 'Ж/д', 'X2001')).toBe(false);
    expect(await listsVehicle(user, 'Ж/д', 'Leviathan')).toBe(false);
  });
});

describe('the best-train list states the power its own figures came from', () => {
  it('shows a dual-power engine the power it makes on this line', () => {
    // A Tornado states 750hp in the data — its diesel figure — and makes 1900 under the
    // wires. The row's profit and speed are computed from the latter, so printing the field
    // would have the line promise one number while being ranked by another.
    const tornado = activeTrains({ ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' })
      .find((train) => train.id === 'tornado')!;
    expect(tornado.power_by_source).toEqual({ DIESEL: 750, OHLE: 1900 });
    expect(tornado.power_hp).toBe(750);

    useSettingsStore.setState({
      game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse', firs: true },
      calc: { ...DEFAULT_CALC_SETTINGS, priceYear: 2000, trackType: 'ELRL' },
    });
    draw(<OptimizerPage />);

    const row = screen
      .queryAllByRole('row')
      .find((r) => (r.textContent ?? '').includes(tornado.name))!;
    expect(row, 'the search on electrified track offers this engine').toBeTruthy();
    // "2× Tornado (3800 лс)" — the count multiplies the per-engine figure
    const text = row.textContent ?? '';
    const count = Number(text.match(/^\d+\s*(\d+)×/)?.[1] ?? 1);
    const printed = Number(text.match(/\((\d+)\s/)![1]);
    expect(printed).toBe(tornado.power_by_source!.OHLE * count);
    expect(printed).not.toBe(tornado.power_hp * count);
  });
});

describe('the switch the track type replaced', () => {
  it('is gone from the tabs that used to carry it', () => {
    // electrification is not a search option any more: it is what the chosen track is
    for (const Page of [OptimizerPage, IndustrySupplyPage]) {
      const { unmount } = draw(<Page />);
      expect(screen.queryByRole('switch', { name: /электрифиц|electrif/i })).toBeNull();
      expect(trackField()).toBeTruthy();
      unmount();
    }
  });
});

describe('a saved choice outlives a change of set', () => {
  it('a track of another set is read as plain rail, not overwritten', async () => {
    // narrow gauge was picked with Iron Horse on; the user turned the set off, and the
    // choice waits for them to come back to it
    useSettingsStore.setState({
      game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'vanilla', firs: false },
      calc: { ...DEFAULT_CALC_SETTINGS, trackType: 'NAAN' },
    });
    draw(<OptimizerPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(trackField().value).toBe('Ж/д');
    expect(useSettingsStore.getState().calc.trackType).toBe('NAAN');
  });

  it('a hidden track of the active set is a dead choice and gives way', async () => {
    // LGVN is in the set but the game never lays it: there is nothing to come back to
    useSettingsStore.setState({
      game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse', firs: true },
      calc: { ...DEFAULT_CALC_SETTINGS, trackType: 'LGVN' },
    });
    draw(<OptimizerPage />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useSettingsStore.getState().calc.trackType).toBe('RAIL');
  });
});

describe('the consist says when a vehicle is not for this track', () => {
  const stalwart = () => activeTrains({ ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' })
    .find((train) => train.name === 'Stalwart')!;

  beforeEach(() => {
    // an electric engine, put together on an electrified line
    useConsistStore.setState({ entries: [{ train: stalwart(), count: 1 }] });
    useSettingsStore.setState({
      game: { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse', firs: true },
      calc: { ...DEFAULT_CALC_SETTINGS, trackType: 'ELRL', priceYear: 1990 },
    });
  });

  it('names the vehicle the track does not carry', async () => {
    const user = userEvent.setup();
    draw(<ConsistPage />);
    expect(screen.queryByRole('alert')).toBeNull();

    await pickTrack(user, 'Ж/д');
    const warning = screen.getByRole('alert');
    expect(warning.textContent).toContain('Stalwart');
    // and beside it stand the very zeroes it explains
    expect(screen.getByText(/^0 лс$/)).toBeTruthy();
  });

  it('says it on the route income tab too, where the track is just as changeable', async () => {
    // that tab prices the same consist on the same track, and no power there turns its trip
    // into a thousand days rather than a plain zero — a figure that needs the explanation
    // more, not less
    const user = userEvent.setup();
    const { unmount } = draw(<RoutePage />);
    expect(screen.queryByRole('alert')).toBeNull();

    await pickTrack(user, 'Ж/д');
    expect(screen.getByRole('alert').textContent).toContain('Stalwart');
    unmount();

    // and it is the shared choice that put it there: the builder says the same
    draw(<ConsistPage />);
    expect(screen.getByRole('alert').textContent).toContain('Stalwart');
  });

  it('goes away once the track is put back', async () => {
    const user = userEvent.setup();
    draw(<ConsistPage />);
    await pickTrack(user, 'Ж/д');
    expect(screen.queryByRole('alert')).not.toBeNull();

    await pickTrack(user, 'Электрифиц. ж/д');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('leaves the consist together', async () => {
    const user = userEvent.setup();
    draw(<ConsistPage />);
    await pickTrack(user, 'Ж/д');
    // what the user built is theirs: a change of track is a question, not a verdict
    expect(useConsistStore.getState().entries).toHaveLength(1);
    expect(screen.getByText('Stalwart')).toBeTruthy();
  });
});
