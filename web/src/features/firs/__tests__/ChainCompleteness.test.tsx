/**
 * The completeness section of the FIRS tab: what the map allows, before anything is built.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChainCompleteness } from '../ChainCompleteness';
import { economyById } from '../../../dataset';
import type { Snapshot, SnapshotIndustry } from '../../../savegame/snapshot';

const steeltown = economyById.get('STEELTOWN')!;

function draw(snapshot: Snapshot | null = null) {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter initialEntries={['/firs']}>
        <ChainCompleteness economy={steeltown} snapshot={snapshot} />
      </MemoryRouter>
    </MantineProvider>,
  );
}

let nextId = 1;
const industry = (catalogueId: string | null): SnapshotIndustry => ({
  id: nextId++,
  catalogueId,
  townId: null,
  plot: null,
  produced: [],
});

const game = (catalogueIds: (string | null)[]): Snapshot =>
  ({
    soldIds: null,
    companies: [],
    towns: [],
    stations: [],
    routes: [],
    trains: [],
    groups: [],
    industries: catalogueIds.map(industry),
  }) as Snapshot;

afterEach(cleanup);

describe('without an imported game', () => {
  it('states nothing and points at the game tab', () => {
    draw(null);
    expect(screen.getByText(/Needs an imported game/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Game' }).getAttribute('href')).toContain('/game');
    expect(screen.queryByText('Chain gaps')).toBeNull();
  });
});

describe('with a game', () => {
  it('names what to build and how many industries it starts', () => {
    draw(game(['coke_oven', 'blast_furnace']));
    expect(screen.getByText(/Build Coal Mine — industries it would start: 2/)).toBeTruthy();
  });

  it('says once that none of these industries closes down', () => {
    draw(game(['coke_oven']));
    expect(screen.getByText(/None of these industries will close down/)).toBeTruthy();
  });

  it('counts the instances one build would start, not the types', () => {
    draw(game(['coke_oven', 'coke_oven', 'coke_oven']));
    expect(screen.getByText(/Build Coal Mine — industries it would start: 3/)).toBeTruthy();
    expect(screen.getByText(/Coke Oven ×3/)).toBeTruthy();
  });

  it('states the closure rule once, and never on a row', () => {
    draw(game(['coal_mine', 'coal_mine', 'coke_oven']));
    expect(screen.getAllByText(/None of these industries will close down/)).toHaveLength(1);
    // no row carries a closure remark of its own, whatever its wording
    for (const item of screen.getAllByRole('listitem')) {
      expect(item.textContent).not.toMatch(/clos/i);
    }
  });

  it('lists a stranded cargo with the industry making it', () => {
    draw(game(['coal_mine']));
    expect(screen.getByText(/Coal:/)).toBeTruthy();
    expect(screen.getByText('Coal Mine')).toBeTruthy();
  });

  it('reports the supply cargoes with no source on the map', () => {
    draw(game(['coal_mine']));
    expect(screen.getByText(/No source on this map for the supply cargoes/)).toBeTruthy();
  });

  it('warns about industries from other sets and still shows the lists', () => {
    draw(game(['coke_oven', null, null]));
    expect(screen.getByText(/Industries on the map from other sets: 2/)).toBeTruthy();
    expect(screen.getByText(/Build Coal Mine/)).toBeTruthy();
  });
});
