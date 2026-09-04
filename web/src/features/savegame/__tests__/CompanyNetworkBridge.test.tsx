/**
 * The bridge on the company card: what the company owns, carried into the network upkeep
 * block of Route income. The card follows the company picked at the top of the tab, and it
 * refuses rather than carries zeroes where the save's map could not be read — a network of
 * nothing is an answer the block would price.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import GamePage from '../GamePage';
import { GAME_SNAPSHOT } from './gameSnapshot';
import type { SnapshotRecord } from '../../../savegame/snapshotStore';
import { EMPTY_NETWORK_INPUTS, useRouteStore } from '../../../state/routeStore';
import { useLocaleStore } from '../../../state/localeStore';

function draw(record: SnapshotRecord = GAME_SNAPSHOT) {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter initialEntries={['/game']}>
        <Routes>
          <Route path="/game" element={<GamePage record={record} />} />
          <Route path="/network" element={<div>network tab</div>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

/** The card's own button; the tabs below carry bridges of their own. */
const bridgeButton = () => screen.getByRole('button', { name: /this network/i });

/** A snapshot of a save whose map could not be read: no company states a network. */
function withoutNetwork(): SnapshotRecord {
  return {
    ...GAME_SNAPSHOT,
    snapshot: {
      ...GAME_SNAPSHOT.snapshot,
      companies: GAME_SNAPSHOT.snapshot.companies.map(({ id, name, isAi }) => ({
        id,
        name,
        isAi,
      })),
    },
  };
}

beforeEach(() => {
  useLocaleStore.getState().setLocale('en');
  useRouteStore.setState({
    cargoLabel: 'COAL',
    distanceTiles: 100,
    amount: 100,
    network: EMPTY_NETWORK_INPUTS,
    prefillOrigin: null,
    networkOrigin: null,
  });
});

afterEach(cleanup);

describe('the bridge on a company card', () => {
  it('carries the counts of the company to the upkeep block, marked as the game’s', async () => {
    draw();
    await userEvent.click(bridgeButton());

    const route = useRouteStore.getState();
    expect(route.network).toEqual({
      railPieces: { RAIL: 240, ELRL: 60 },
      signals: 18,
      stations: 12,
    });
    expect(route.networkOrigin).toMatchObject({ source: 'company', label: 'Checks & Co' });
    expect(await screen.findByText('network tab')).toBeTruthy();
  });

  it('another company means another network', async () => {
    draw();
    await userEvent.click(screen.getByRole('combobox', { name: 'Company' }));
    await userEvent.click(await screen.findByText('Company 2 (AI)'));
    await userEvent.click(bridgeButton());

    expect(useRouteStore.getState().network).toEqual({
      railPieces: { RAIL: 30 },
      signals: 2,
      stations: 3,
    });
  });

  it('leaves the rest of the receiving tab alone', async () => {
    useRouteStore.setState({ cargoLabel: 'IORE', distanceTiles: 42, amount: 77 });
    draw();
    await userEvent.click(bridgeButton());

    const route = useRouteStore.getState();
    expect(route.cargoLabel).toBe('IORE');
    expect(route.distanceTiles).toBe(42);
    expect(route.amount).toBe(77);
  });

  it('refuses, and names why, when the map of the save was not read', async () => {
    draw(withoutNetwork());
    const button = bridgeButton();
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('aria-label')).toContain('map of the save not read');
    expect(screen.getByText('map of the save not read')).toBeTruthy();

    await userEvent.click(button);
    expect(useRouteStore.getState().network).toEqual(EMPTY_NETWORK_INPUTS);
    expect(screen.queryByText('network tab')).toBeNull();
  });

  it('states what the company owns without being taken', () => {
    draw();
    // track is the whole rail network of the company: 240 plain plus 60 electrified
    expect(screen.getByText(/track 300 pcs · signals 18 · station tiles 12/)).toBeTruthy();
  });
});
