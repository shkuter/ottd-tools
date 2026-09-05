/**
 * The chain section of the FIRS tab: pick a target, read the tasks, see what the imported
 * game adds to them.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChainTasks } from '../ChainTasks';
import { economyById } from '../../../dataset';
import { useFirsStore } from '../../../state/firsStore';
import { useLocaleStore } from '../../../state/localeStore';
import { useSettingsStore } from '../../../state/settingsStore';
import { DEFAULT_GAME_SETTINGS } from '../../../engine/settings';
import { inputKey, useIndustrySupplyStore } from '../../../state/industrySupplyStore';
import type { Snapshot, SnapshotIndustry } from '../../../savegame/snapshot';

const steeltown = economyById.get('STEELTOWN')!;

function draw(snapshot: Snapshot | null = null) {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter initialEntries={['/firs']}>
        <ChainTasks economy={steeltown} snapshot={snapshot} />
      </MemoryRouter>
    </MantineProvider>,
  );
}

function industry(over: Partial<SnapshotIndustry> & { id: number }): SnapshotIndustry {
  return { catalogueId: null, townId: null, plot: null, produced: [], ...over };
}

const GAME: Snapshot = {
  soldIds: null,
  companies: [],
  towns: [],
  stations: [],
  routes: [],
  trains: [],
  groups: [],
  industries: [
    industry({ id: 1, catalogueId: 'coke_oven', townId: 5, plot: { x: 10, y: 10 } }),
    industry({
      id: 2,
      catalogueId: 'coal_mine',
      townId: 5,
      plot: { x: 30, y: 10 },
      produced: [{ label: 'COAL', slot: 0, lastMonthProduction: 144, lastMonthTransported: 0 }],
    }),
  ],
};

beforeEach(() => {
  useLocaleStore.setState({ locale: 'en' });
  // the tab exists only with FIRS on, and so does everything the mode reads
  useSettingsStore.setState({ game: { ...DEFAULT_GAME_SETTINGS, firs: true } });
  useFirsStore.setState({ chainTargetId: null, targetOutputPerMonth: null });
});
afterEach(cleanup);

describe('ChainTasks', () => {
  it('says nothing until a target is picked', () => {
    draw();
    expect(screen.getByText(/Choose an industry/)).toBeTruthy();
  });

  it('lists a task per input once a target is picked', () => {
    useFirsStore.setState({ chainTargetId: 'blast_furnace' });
    draw();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThan(3);
    // its own three inputs are there, with the furnace as the consumer
    const furnace = rows.filter((row) => row.textContent?.includes('Blast Furnace'));
    expect(furnace.length).toBeGreaterThanOrEqual(3);
  });

  it('scales the volumes with the wanted output', async () => {
    useFirsStore.setState({ chainTargetId: 'coke_oven' });
    draw();
    const before = volumes();
    // the field names the cargo the chain is sized in, which is the oven's first product
    const field = screen.getByLabelText('Wanted Coke');
    await userEvent.clear(field);
    await userEvent.type(field, '200');
    const after = volumes();
    expect(after.some((v, i) => v > (before[i] ?? 0))).toBe(true);
  });

  it('shows the state, the source and the leg of an imported game', () => {
    useFirsStore.setState({ chainTargetId: 'coke_oven' });
    draw(GAME);
    const row = screen.getAllByRole('row').find((r) => r.textContent?.includes('Coal Mine'))!;
    expect(row.textContent).toContain('20 tiles, same town');
    expect(row.textContent).toContain('standing unfed');
  });

  it('warns that the split between inputs is an assumption', () => {
    useFirsStore.setState({ chainTargetId: 'blast_furnace' });
    draw();
    expect(screen.getByText(/this calculator's assumption/)).toBeTruthy();
  });

  it('points at the game tab while no game is imported', () => {
    useFirsStore.setState({ chainTargetId: 'coke_oven' });
    draw();
    expect(screen.getByText(/Import a game on the Game tab/)).toBeTruthy();
  });

  it('says what "supplied" does and does not claim once a game is there', () => {
    useFirsStore.setState({ chainTargetId: 'coke_oven' });
    draw(GAME);
    expect(screen.getByText(/not that the deliveries keep it inside the supply window/)).toBeTruthy();
    expect(screen.getByText(/measured between industry plots/)).toBeTruthy();
  });
});

/** Numbers in the "Deliver" column, as the rows print them. */
function volumes(): number[] {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => Number(row.children[3]?.textContent?.replace(/[^\d]/g, '') ?? '0'));
}

describe('bridge to the Supply tab', () => {
  it('carries the industry, cargo, leg and output of an imported game', async () => {
    useFirsStore.setState({ chainTargetId: 'coke_oven' });
    useIndustrySupplyStore.setState({ industryId: '', inputs: {}, prefillOrigin: null });
    draw(GAME);
    const row = screen.getAllByRole('row').find((r) => r.textContent?.includes('Coal Mine'))!;
    await userEvent.click(within(row).getByRole('button'));

    const store = useIndustrySupplyStore.getState();
    expect(store.industryId).toBe('coke_oven');
    expect(store.inputs[inputKey('coke_oven', 'COAL')]).toEqual({
      distanceTiles: 20,
      productionPerMonth: 144,
    });
    expect(store.prefillOrigin?.source).toBe('chain');
  });

  it('still opens the tab without a game, leaving the figures alone', async () => {
    useFirsStore.setState({ chainTargetId: 'coke_oven' });
    useIndustrySupplyStore.setState({
      industryId: '',
      inputs: { [inputKey('coke_oven', 'COAL')]: { distanceTiles: 77, productionPerMonth: 55 } },
      prefillOrigin: null,
    });
    draw();
    const row = screen.getAllByRole('row').find((r) => r.textContent?.includes('Coal Mine'))!;
    await userEvent.click(within(row).getByRole('button'));

    const store = useIndustrySupplyStore.getState();
    expect(store.industryId).toBe('coke_oven');
    // the bridge said nothing about them, so what the player typed stands
    expect(store.inputs[inputKey('coke_oven', 'COAL')]).toEqual({
      distanceTiles: 77,
      productionPerMonth: 55,
    });
  });
});

/** The half of the spec that lives in the markup: what a pool target shows instead of a scale. */
describe('a target running on a supply pool', () => {
  it('offers no output field, and says what sizes the chain instead', () => {
    useFirsStore.setState({ chainTargetId: 'port' });
    draw();
    expect(screen.queryByLabelText(/Wanted/)).toBeNull();
    expect(screen.getByText(/Scale comes from this industry's own supply thresholds/)).toBeTruthy();
  });

  it('keeps the output field for a target the chain can size', () => {
    useFirsStore.setState({ chainTargetId: 'coke_oven' });
    draw();
    expect(screen.getByLabelText('Wanted Coke')).toBeTruthy();
    expect(screen.queryByText(/Scale comes from/)).toBeNull();
  });

  it('says a threshold is one count over every input, in the row and under the list', () => {
    useFirsStore.setState({ chainTargetId: 'port' });
    draw();
    const row = screen.getAllByRole('row').find((r) => r.textContent?.includes('level 2'))!;
    // without this the seven rows of a port read as seven times the threshold
    expect(row.textContent).toContain('one count over every input');
    expect(screen.getByText(/counts everything delivered to it as one total/)).toBeTruthy();
  });

  it('blames the chain, not the rule, when nothing states a scale', () => {
    useFirsStore.setState({ chainTargetId: 'general_store' });
    draw();
    const cells = screen.getAllByRole('row').map((r) => r.textContent ?? '');
    expect(cells.some((text) => text.includes('no scale for it in this chain'))).toBe(true);
  });

  it('tells a missing source apart from an unmeasurable one', () => {
    useFirsStore.setState({ chainTargetId: 'coke_oven' });
    // industries of the right kind stand on the map, but the save stated no plots
    const noPlots: Snapshot = {
      ...GAME,
      industries: GAME.industries.map((i) => ({ ...i, plot: null })),
    };
    draw(noPlots);
    expect(screen.getByText(/on the map, distance unknown/)).toBeTruthy();
    cleanup();

    // and a game with no coal mine at all says something else
    useFirsStore.setState({ chainTargetId: 'coke_oven' });
    draw({ ...GAME, industries: GAME.industries.filter((i) => i.catalogueId !== 'coal_mine') });
    expect(screen.getAllByText(/none on the map/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/distance unknown/)).toBeNull();
  });
});
