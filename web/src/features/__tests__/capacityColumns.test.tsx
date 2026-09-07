/**
 * The two figures the catalogue works out for a chosen cargo: capacity per tile of platform,
 * and capacity times the speed of the vehicle on the chosen track.
 *
 * The formulas themselves are checked in features/consist/__tests__/metrics.test.ts; what is
 * checked here is that the page shows them where it should and hides them where it should not —
 * a column comparable only within one cargo must not stand there before a cargo is picked.
 *
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ConsistPage from '../consist/ConsistPage';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../engine/settings';
import { useSettingsStore } from '../../state/settingsStore';
import { useLocaleStore } from '../../state/localeStore';
import { resetSnapshotStateForTests } from '../../savegame/snapshotStore';
import { activeCargos, activeRailtype, activeTrains, canCarryIn, trainCapacity } from '../../dataset';
import { vehicleLengthUnits } from '../../engine/consist';
import { capacityTimesSpeed } from '../consist/metrics';
import { cargoName } from '../../i18n/names';
import { UNITS_PER_TILE } from '../../engine/units';

const game = { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' as const };
const calc = DEFAULT_CALC_SETTINGS;
const rail = activeRailtype(game, calc.trackType);

function draw() {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter>
        <ConsistPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

const cargoField = (): HTMLInputElement =>
  screen
    .getAllByLabelText(/carries cargo/i)
    .find((el) => el.tagName === 'INPUT' && el.getAttribute('type') !== 'hidden') as
    HTMLInputElement;

const openOptions = (): HTMLElement[] =>
  [...document.querySelectorAll<HTMLElement>('[data-combobox-option]')];

/** The cargo the case filters by: one a plain half-tile wagon of the roster carries. */
const cargo = activeCargos(game).find((c) =>
  activeTrains(game).some(
    (t) =>
      t.kind === 'wagon' &&
      t.length === UNITS_PER_TILE / 2 &&
      trainCapacity(t, calc.capacityIndex) > 0 &&
      canCarryIn(game, t, c),
  ),
)!;

async function pickCargo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(cargoField());
  const name = cargoName(cargo, 'en');
  await user.click(openOptions().find((el) => el.textContent === name)!);
}

/**
 * The rows of the catalogue, each paired with the vehicle it lists.
 *
 * By the sprite, not by the name: 91 names of the roster are shared by vehicles of different
 * capacity and length ("Box Van" covers ten of them), so a row matched by name would be checked
 * against another vehicle's numbers.
 */
function catalogueRows() {
  const byId = new Map(activeTrains(game).map((t) => [t.id, t]));
  return screen
    .getAllByRole('row')
    .map((row) => {
      const id = row.querySelector('img')?.getAttribute('src')?.match(/([^/]+)\.png$/)?.[1];
      return { row, train: id ? byId.get(id) : undefined };
    })
    .filter((r): r is { row: HTMLElement; train: NonNullable<typeof r.train> } => !!r.train);
}

const header = (text: string) => screen.queryByRole('columnheader', { name: text });

/** Which cell of a row a column owns: the assertions are about a column, not about a dash. */
function columnIndex(name: string | RegExp) {
  const headers = screen.getAllByRole('columnheader');
  const index = headers.findIndex((h) =>
    typeof name === 'string' ? h.textContent === name : name.test(h.textContent ?? ''),
  );
  expect(index, `no column ${String(name)}`).toBeGreaterThanOrEqual(0);
  return index;
}

const cellOf = (row: HTMLElement, name: string | RegExp) =>
  within(row).getAllByRole('cell')[columnIndex(name)].textContent;

/**
 * The figure a cell prints, as a number. English formatting groups thousands with a comma and
 * marks the fraction with a dot, so stripping every non-digit would read "106.7" as 1067.
 */
const figureIn = (cell: string | null) => Number(cell!.replace(/,/g, ''));

beforeEach(() => {
  useLocaleStore.getState().setLocale('en');
  useSettingsStore.setState({ game, calc: { ...calc }, speedUnit: 'metric' });
  resetSnapshotStateForTests();
});
afterEach(cleanup);

describe('the catalogue computes two figures per cargo', () => {
  it('keeps both columns away until a cargo is chosen', async () => {
    const user = userEvent.setup();
    draw();
    expect(header('Capacity/tile')).toBeNull();
    expect(screen.queryByText(/Capacity × speed/)).toBeNull();

    await pickCargo(user);
    expect(header('Capacity/tile')).toBeTruthy();
    expect(header('Capacity × speed, km/h')).toBeTruthy();
  });

  it('names the displayed speed unit in the header and counts in it', async () => {
    const user = userEvent.setup();
    draw();
    await pickCargo(user);
    const row = catalogueRows().find((r) => cellOf(r.row, /Capacity × speed/) !== '—')!;
    expect(row, 'no row has a speed figure to read').toBeTruthy();
    const id = row.train.id;
    const metric = cellOf(row.row, 'Capacity × speed, km/h');
    cleanup();

    useSettingsStore.setState({ speedUnit: 'imperial' });
    draw();
    await pickCargo(user);
    expect(header('Capacity × speed, mph')).toBeTruthy();
    expect(header('Capacity × speed, km/h')).toBeNull();
    const again = catalogueRows().find((r) => r.train.id === id)!;
    // miles are the shorter unit, so the same capacity times a smaller figure
    expect(figureIn(cellOf(again.row, 'Capacity × speed, mph'))).toBeLessThan(figureIn(metric));
  });

  it('doubles the capacity of a half-tile wagon in the cell', async () => {
    const user = userEvent.setup();
    draw();
    await pickCargo(user);

    const row = catalogueRows().find(
      (r) => r.train.length === UNITS_PER_TILE / 2 && trainCapacity(r.train, calc.capacityIndex) > 0,
    );
    expect(row, 'no half-tile carrier in the catalogue for this cargo').toBeTruthy();
    const capacity = trainCapacity(row!.train, calc.capacityIndex);
    expect(figureIn(cellOf(row!.row, 'Capacity/tile'))).toBe(capacity * 2);
  });

  it('fills both cells of every row it lists', async () => {
    const user = userEvent.setup();
    draw();
    await pickCargo(user);
    const rows = catalogueRows();
    expect(rows.length).toBeGreaterThan(0);
    let figures = 0;
    for (const { row, train } of rows) {
      for (const column of ['Capacity/tile', /Capacity × speed/] as const) {
        const cell = cellOf(row, column);
        expect(cell, `empty cell in the row of ${train.id}`).toBeTruthy();
        if (cell !== '—') {
          expect(figureIn(cell)).toBeGreaterThan(0);
          figures += 1;
        }
      }
    }
    // a table of nothing but dashes would satisfy the loop above, and it must not satisfy this
    expect(figures).toBeGreaterThan(0);
  });

  it('cycles the new column through three clicks like every other', async () => {
    const user = userEvent.setup();
    draw();
    await pickCargo(user);
    const mark = () =>
      header('Capacity/tile')!.querySelector('.sort-mark')?.getAttribute('data-direction') ?? null;

    await user.click(header('Capacity/tile')!);
    expect(mark()).toBe('ascending');
    await user.click(header('Capacity/tile')!);
    expect(mark()).toBe('descending');
    await user.click(header('Capacity/tile')!);
    expect(mark()).toBeNull();
    expect(header('Year')!.className).toContain('sorted');
  });

  it('orders the rows it lists by the figure in the cell', async () => {
    const user = userEvent.setup();
    draw();
    await pickCargo(user);
    await user.click(header('Capacity/tile')!);
    await user.click(header('Capacity/tile')!);
    const figures = catalogueRows()
      .map(({ row }) => cellOf(row, 'Capacity/tile'))
      .filter((cell) => cell !== '—')
      .map((cell) => figureIn(cell));
    expect(figures.length).toBeGreaterThan(1);
    expect(figures).toEqual([...figures].sort((a, b) => b - a));
  });

  it('puts the sort back to the default when the cargo is cleared', async () => {
    const user = userEvent.setup();
    draw();
    await pickCargo(user);

    await user.click(header('Capacity/tile')!);
    expect(header('Capacity/tile')!.className).toContain('sorted');
    expect(header('Year')!.className).not.toContain('sorted');

    // picking the chosen option again clears the filter, and the columns go with it
    await user.click(cargoField());
    await user.click(openOptions().find((el) => el.textContent === cargoName(cargo, 'en'))!);
    expect(header('Capacity/tile')).toBeNull();
    expect(header('Year')!.className).toContain('sorted');
    const years = catalogueRows().map(({ train }) => train.intro_year);
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });

  it('brings the sort back with the cargo', async () => {
    const user = userEvent.setup();
    draw();
    await pickCargo(user);
    await user.click(header('Capacity/tile')!);
    await user.click(cargoField());
    await user.click(openOptions().find((el) => el.textContent === cargoName(cargo, 'en'))!);
    expect(header('Capacity/tile')).toBeNull();

    // the sort was hidden with its column, not cancelled: picking the cargo again restores it
    await pickCargo(user);
    expect(header('Capacity/tile')!.className).toContain('sorted');
  });
});

describe('a game with wagon speed limits off', () => {
  it('leaves the speed figure empty for wagons and says why', async () => {
    useSettingsStore.setState({ game: { ...game, wagonSpeedLimits: false } });
    const user = userEvent.setup();
    draw();
    await pickCargo(user);

    const row = catalogueRows().find((r) => r.train.kind === 'wagon')!;
    expect(row).toBeTruthy();
    // the wagon still has a capacity per tile: it is only the speed figure that goes away
    expect(figureIn(cellOf(row.row, 'Capacity/tile'))).toBe(
      (trainCapacity(row.train, calc.capacityIndex) * UNITS_PER_TILE) /
        vehicleLengthUnits(row.train),
    );
    expect(cellOf(row.row, /Capacity × speed/)).toBe('—');
    expect(screen.getByText(/wagon speed limits are off/i)).toBeTruthy();
  });

  it('says nothing of the sort when they are on', async () => {
    const user = userEvent.setup();
    draw();
    await pickCargo(user);
    expect(screen.queryByText(/wagon speed limits are off/i)).toBeNull();

    // and the same wagon does have the figure with the setting on
    const row = catalogueRows().find((r) => r.train.kind === 'wagon')!;
    expect(figureIn(cellOf(row.row, /Capacity × speed/))).toBe(
      capacityTimesSpeed(row.train, rail, game, calc, 'metric'),
    );
  });
});
