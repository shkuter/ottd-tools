/**
 * The game tab as the player meets it: it exists only once a savegame has been imported, it
 * wears that savegame's file name, and switching company switches everything the company
 * owns — including the group filter, which belongs to a company and cannot outlive it.
 *
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../../../App';
import GamePage from '../GamePage';
import { GAME_SNAPSHOT } from './gameSnapshot';
import {
  loadSnapshot,
  resetSnapshotStateForTests,
  saveSnapshot,
  SNAPSHOT_DB,
} from '../../../savegame/snapshotStore';
import type { SnapshotRecord } from '../../../savegame/snapshotStore';
import { useSettingsStore } from '../../../state/settingsStore';
import { useLocaleStore } from '../../../state/localeStore';

function draw(ui: React.ReactNode, path = '/') {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </MantineProvider>,
  );
}

async function forget() {
  resetSnapshotStateForTests();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(SNAPSHOT_DB.name);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  useSettingsStore.getState().reset();
  useLocaleStore.getState().setLocale('en');
  await forget();
});

afterEach(cleanup);

describe('the tab in the shell', () => {
  it('is not offered while no savegame has been imported', async () => {
    await loadSnapshot();
    draw(<App />);
    await screen.findByText('Best train');
    expect(screen.queryByText(GAME_SNAPSHOT.fileName)).toBeNull();
  });

  it('appears after an import, titled with the file name', async () => {
    await saveSnapshot(GAME_SNAPSHOT.fileName, GAME_SNAPSHOT.snapshot, 1, GAME_SNAPSHOT.settings);
    draw(<App />);
    expect(await screen.findByText(GAME_SNAPSHOT.fileName)).toBeTruthy();
  });

  it('sends a direct link nowhere unpleasant when there is no snapshot', async () => {
    await loadSnapshot();
    draw(<App />, '/game');
    // the main tab, not an empty page and not a crash
    await waitFor(() => expect(screen.getByText('Best train')).toBeTruthy());
    expect(screen.queryByRole('tab', { name: 'Routes' })).toBeNull();
  });
});

describe('the company picker', () => {
  const record: SnapshotRecord = GAME_SNAPSHOT;

  it('opens on the first company a human plays', async () => {
    draw(<GamePage record={record} />);
    expect(await screen.findByDisplayValue('Checks & Co')).toBeTruthy();
  });

  it('drops the group filter when the company changes', async () => {
    const user = userEvent.setup();
    draw(<GamePage record={record} />);

    await user.click(await screen.findByRole('tab', { name: 'Trains' }));
    const groups = await screen.findByRole('combobox', { name: 'Group' });
    await user.click(groups);
    await user.click(await screen.findByText('Ore trains'));
    expect((groups as HTMLInputElement).value).toBe('Ore trains');

    // the other company has no such group; keeping the filter would empty the list under a
    // group that is not theirs
    const companies = screen.getByRole('combobox', { name: 'Company' });
    await user.click(companies);
    await user.click(await screen.findByText('Company 2 (AI)'));
    expect((screen.getByRole('combobox', { name: 'Group' }) as HTMLInputElement).value).toBe(
      'All trains',
    );
  });
});

describe('the lists', () => {
  it('explains an empty list instead of showing an empty frame', async () => {
    const user = userEvent.setup();
    draw(<GamePage record={GAME_SNAPSHOT} />);

    const companies = await screen.findByRole('combobox', { name: 'Company' });
    await user.click(companies);
    await user.click(await screen.findByText('Company 2 (AI)'));

    expect(await screen.findByText('This company runs no routes.')).toBeTruthy();
  });

  it('sorts a column in three steps, the third giving the tab its own order back', async () => {
    const user = userEvent.setup();
    draw(<GamePage record={GAME_SNAPSHOT} />);

    const own = (await screen.findAllByRole('row')).slice(1).map((row) => row.textContent);
    const header = screen.getByText('Distance, tiles');

    await user.click(header);
    await user.click(header);
    await user.click(header);

    const back = screen.getAllByRole('row').slice(1).map((row) => row.textContent);
    expect(back).toEqual(own);
  });

  it('carries no search box: the game has none either', async () => {
    draw(<GamePage record={GAME_SNAPSHOT} />);
    await screen.findByText('Route');
    expect(screen.queryByRole('searchbox')).toBeNull();
    // the pickers are read-only comboboxes; a search box would be a writable text field
    expect(screen.queryAllByRole('textbox')).toEqual([]);
    for (const box of screen.queryAllByRole('combobox')) {
      expect(box.hasAttribute('readonly')).toBe(true);
    }
  });

  it('shows what waits on a station and rates only what the game rates', async () => {
    const user = userEvent.setup();
    draw(<GamePage record={GAME_SNAPSHOT} />);
    await user.click(await screen.findByRole('tab', { name: 'Stations' }));

    const row = (await screen.findByText('Checkford')).closest('tr')!;
    // the name and the figure are separate elements — the name holds together with its
    // icon, the figure may wrap — so the row is read as a whole
    expect(row.textContent).toContain('Quicklime 240');
    // the rated cargo shows its rating; the unrated one leaves the cell blank rather than
    // explaining itself on every row
    expect(row.textContent).toContain('66%');
    expect(row.textContent).not.toContain('not rated');
  });

  it('states the fleet, the fact and the forecast in the route row', async () => {
    draw(<GamePage record={GAME_SNAPSHOT} />);

    const row = (await screen.findByText(/Checkford — Renderbury Works/)).closest('tr')!;
    // two trains, with what they are made of on hover — the row itself has no space for it
    expect(row.textContent).toContain('2');
    expect(within(row).getByTitle(/Covered Mineral Hopper ×8/)).toBeTruthy();
    expect(row.textContent).toContain('Quicklime');
    // the game's own figure for the finished year, and this year's beside it
    expect(row.textContent).toContain('167,700');
    expect(row.textContent).toContain('this year');
  });

  it('names the reason where the model cannot answer, instead of a number', async () => {
    draw(<GamePage record={GAME_SNAPSHOT} />);
    const row = (await screen.findByText(/Renderbury Works — Checkford/)).closest('tr')!;
    expect(row.textContent).toContain('consist not fully matched');
  });

  it('opens a route in place, with its stops and the making of the forecast', async () => {
    const user = userEvent.setup();
    draw(<GamePage record={GAME_SNAPSHOT} />);

    await user.click(await screen.findByText(/Checkford — Renderbury Works/));
    const detail = document.querySelector('.route-detail-body')!;
    expect(detail.textContent).toContain('full load');
    expect(detail.textContent).toContain('Old Faithful');
    expect(detail.textContent).toContain('Round trip, days');
    expect(detail.textContent).toContain('Distance, tiles');
  });

  it('says the forecasts follow the imported game once the settings drift', async () => {
    draw(<GamePage record={GAME_SNAPSHOT} />);
    await screen.findByText('Route');
    expect(screen.queryByText(/Forecasts use the settings/)).toBeNull();

    cleanup();
    useSettingsStore.getState().applySettings({ dayLengthFactor: 8 }, {});
    draw(<GamePage record={GAME_SNAPSHOT} />);
    const banner = await screen.findByText(/Forecasts use the settings/);
    // the setting is named the way the game names it, not by the field holding it
    expect(banner.textContent).toContain('Economy speed reduction factor');
    expect(banner.textContent).not.toContain('dayLengthFactor');
  });

  it('states this year alone while the game has no finished year behind it', async () => {
    const firstYear = {
      ...GAME_SNAPSHOT,
      snapshot: {
        ...GAME_SNAPSHOT.snapshot,
        trains: GAME_SNAPSHOT.snapshot.trains.map((train) => ({ ...train, profitLastYear: 0 })),
      },
    };
    draw(<GamePage record={firstYear} />);

    const row = (await screen.findByText(/Checkford — Renderbury Works/)).closest('tr')!;
    expect(row.textContent).toContain('no finished year yet');
    expect(row.textContent).not.toContain('this year');
  });

  it('leaves out stations nobody owns and waypoints, which are not stations', async () => {
    const user = userEvent.setup();
    draw(<GamePage record={GAME_SNAPSHOT} />);
    await user.click(await screen.findByRole('tab', { name: 'Stations' }));

    await screen.findByText('Checkford');
    expect(screen.queryByText('Nobody Rig')).toBeNull();
    expect(screen.queryByText('Checkford Crossing')).toBeNull();
  });

  it('folds a long rotation into its ends, with the full order in the detail', async () => {
    const user = userEvent.setup();
    // a mail run round four stations: too many for the row, and no forecast either
    const long = {
      ...GAME_SNAPSHOT,
      snapshot: {
        ...GAME_SNAPSHOT.snapshot,
        routes: GAME_SNAPSHOT.snapshot.routes.map((route) =>
          route.id === 0
            ? {
                ...route,
                stops: [
                  { kind: 'station' as const, stationId: 0, fullLoad: true },
                  { kind: 'station' as const, stationId: 1, fullLoad: false },
                  { kind: 'station' as const, stationId: 4, fullLoad: false },
                  { kind: 'station' as const, stationId: 0, fullLoad: false },
                ],
              }
            : route,
        ),
      },
    };
    draw(<GamePage record={long} />);

    const title = await screen.findByText(/Checkford — … — Checkford \(4 stops\)/);
    const row = title.closest('tr')!;
    expect(row.textContent).toContain('more than two stops');
    // the first leg is not the distance of a rotation, so no figure is offered
    expect(row.textContent).toContain('—');

    await user.click(title);
    const detail = document.querySelector('.route-detail-body')!;
    // the order the game runs them in, in full
    expect(detail.textContent).toContain('Renderbury Works');
    expect(detail.textContent).toContain('Rival Yard');
  });

  it('names an unmatched vehicle in a consist instead of dropping it', async () => {
    const user = userEvent.setup();
    draw(<GamePage record={GAME_SNAPSHOT} />);
    await user.click(await screen.findByRole('tab', { name: 'Trains' }));

    // the third train carries three wagons of a set the catalogue does not know
    const row = (await screen.findByText('Train 3')).closest('tr')!;
    expect(row.textContent).toContain('unknown vehicle ×3');
    // and the rest of its consist is still named
    expect(row.textContent).toContain('0-8-0 Haar ×1');
  });

  it('states a train year by year, and says which ones stand still', async () => {
    const user = userEvent.setup();
    draw(<GamePage record={GAME_SNAPSHOT} />);
    await user.click(await screen.findByRole('tab', { name: 'Trains' }));

    const stopped = (await screen.findByText('Old Faithful')).closest('tr')!;
    expect(stopped.textContent).toContain('stopped');
    expect(stopped.textContent).toContain('1951');
    // both years of profit stand in their own columns
    expect(stopped.textContent).toContain('71,300');
    expect(stopped.textContent).toContain('28,900');
  });

  it('keeps the stations of another company out of this one list', async () => {
    const user = userEvent.setup();
    draw(<GamePage record={GAME_SNAPSHOT} />);
    await user.click(await screen.findByRole('tab', { name: 'Stations' }));

    await screen.findByText('Checkford');
    expect(screen.queryByText('Rival Yard')).toBeNull();

    await user.click(screen.getByRole('combobox', { name: 'Company' }));
    await user.click(await screen.findByText('Company 2 (AI)'));
    expect(await screen.findByText('Rival Yard')).toBeTruthy();
  });

  it('shows a cargo the way the rest of the calculator does — icon, then name', async () => {
    const user = userEvent.setup();
    draw(<GamePage record={GAME_SNAPSHOT} />);

    // the routes list names the cargo of the route
    const route = (await screen.findByText(/Checkford — Renderbury Works/)).closest('tr')!;
    expect(route.querySelector('img.cargo-icon')).not.toBeNull();

    // and so do the three lists beside it
    for (const tab of ['Trains', 'Stations', 'Industries']) {
      await user.click(screen.getByRole('tab', { name: tab }));
      await waitFor(() =>
        expect(document.querySelectorAll('img.cargo-icon').length, tab).toBeGreaterThan(0),
      );
    }
  });

  it('names an industry the base game defines, which FIRS has no entry for', async () => {
    const user = userEvent.setup();
    draw(<GamePage record={GAME_SNAPSHOT} />);
    await user.click(await screen.findByRole('tab', { name: 'Industries' }));

    // resolved through the vanilla set: industries.json holds no power station
    expect(await screen.findByText('Power Station')).toBeTruthy();
  });

  it('states what an industry made last month and how much of it left', async () => {
    const user = userEvent.setup();
    draw(<GamePage record={GAME_SNAPSHOT} />);
    await user.click(await screen.findByRole('tab', { name: 'Industries' }));

    const row = (await screen.findByText('Iron Ore Mine')).closest('tr')!;
    expect(row.textContent).toContain('144');
    expect(row.textContent).toContain('96');
    // the share that left is what the game's own industry window shows
    expect(row.textContent).toContain('67%');
  });

  it('lists industries whatever company is picked, naming an unknown type as such', async () => {
    const user = userEvent.setup();
    draw(<GamePage record={GAME_SNAPSHOT} />);
    await user.click(await screen.findByRole('tab', { name: 'Industries' }));

    expect(await screen.findByText('unknown industry')).toBeTruthy();
    const before = screen.getAllByRole('row').length;

    await user.click(screen.getByRole('combobox', { name: 'Company' }));
    await user.click(await screen.findByText('Company 2 (AI)'));
    await user.click(screen.getByRole('tab', { name: 'Industries' }));
    expect(screen.getAllByRole('row')).toHaveLength(before);
  });
});
