/**
 * What the consist panel offers beside the vehicles: clearing them with a way back, and the
 * step that follows a built consist — pricing it on a route.
 *
 * @vitest-environment jsdom
 */
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { MemoryRouter } from 'react-router';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ConsistPage from '../ConsistPage';
import { vanillaTrains } from '../../../vanilla';
import { t } from '../../../i18n';
import { useConsistStore } from '../../../state/consistStore';
import { useLocaleStore } from '../../../state/localeStore';
import { useRouteStore } from '../../../state/routeStore';
import { useSettingsStore } from '../../../state/settingsStore';

/** A vehicle of the set a fresh calculator starts on, so the panel lists it. */
const engine = vanillaTrains.find((train) => train.kind === 'engine')!;

function draw() {
  return render(
    <MantineProvider>
      <Notifications transitionDuration={0} />
      <MemoryRouter initialEntries={['/consist']}>
        <ConsistPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  useSettingsStore.getState().reset();
  useLocaleStore.getState().setLocale('en');
  useRouteStore.setState({ distanceTiles: 7, prefillOrigin: null });
});

afterEach(() => {
  act(() => notifications.clean());
  cleanup();
});

describe('clearing the consist', () => {
  it('empties the builder and offers the consist back', async () => {
    const user = userEvent.setup();
    useConsistStore.setState({ entries: [{ train: engine, count: 3 }] });
    draw();

    await user.click(screen.getByRole('button', { name: t('consist.clear') }));
    expect(useConsistStore.getState().entries).toEqual([]);

    const restore = await waitFor(() =>
      screen.getByRole('button', { name: t('notify.restoreConsist') }),
    );
    await user.click(restore);

    expect(useConsistStore.getState().entries).toEqual([{ train: engine, count: 3 }]);
    expect(useRouteStore.getState().distanceTiles).toBe(7);
  });
});

describe('the consist figures', () => {
  it('agrees the length with its unit when the consist is one tile long', () => {
    // two half-tile vehicles make exactly one tile
    const halfTile = vanillaTrains.find(
      (train) => train.kind === 'engine' && !train.dual_headed && train.length === 8,
    )!;
    useConsistStore.setState({ entries: [{ train: halfTile, count: 2 }] });
    draw();
    const row = screen.getByText(t('consist.stats.length')).closest('tr')!;
    expect(row.textContent).toContain('1 tile');
    expect(row.textContent).not.toContain('1 tiles');
  });
});

describe('the way on to the income tab', () => {
  it('stands under the figures of a built consist', () => {
    useConsistStore.setState({ entries: [{ train: engine, count: 1 }] });
    draw();
    const link = screen.getByRole('link', { name: t('consist.toIncome') });
    expect(link.getAttribute('href')).toBe('/income');
    // under the figures, not somewhere else on the panel
    const summary = document.querySelector('.consist-side .summary-table')!;
    expect(summary.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is not offered while the builder is empty', () => {
    useConsistStore.setState({ entries: [] });
    draw();
    expect(screen.queryByRole('link', { name: t('consist.toIncome') })).toBeNull();
  });
});
