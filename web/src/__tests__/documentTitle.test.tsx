/**
 * The browser tab names the calculator's tab, in the interface language, and the pageview is
 * counted with the title of the page arrived at.
 *
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { t } from '../i18n';
import type { Snapshot } from '../savegame/snapshot';
import {
  resetSnapshotStateForTests,
  saveSnapshot,
  snapshotSettings,
} from '../savegame/snapshotStore';
import { useLocaleStore } from '../state/localeStore';
import { useSettingsStore } from '../state/settingsStore';

/** The titles the pageview counter was handed, in the order it was handed them. */
const counted = vi.hoisted(() => [] as string[]);

vi.mock('../analytics', async () => {
  const { useEffect } = await import('react');
  const { useLocation } = await import('react-router');
  return {
    usePageviews: () => {
      const { pathname } = useLocation();
      useEffect(() => {
        counted.push(document.title);
      }, [pathname]);
    },
  };
});

const SNAPSHOT: Snapshot = {
  soldIds: null,
  companies: [{ id: 0, name: '', isAi: false }],
  towns: [],
  stations: [],
  routes: [],
  trains: [],
  groups: [],
  industries: [],
};

function shell(path: string) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(async () => {
  counted.length = 0;
  useSettingsStore.getState().reset();
  useLocaleStore.getState().setLocale('en');
  resetSnapshotStateForTests();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('ottd-tools');
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
});

afterEach(cleanup);

describe('the document title', () => {
  it('names the open tab beside the site', async () => {
    shell('/income');
    await waitFor(() =>
      expect(document.title).toBe(`${t('nav.income')} — ${t('app.title')}`),
    );
  });

  it('follows the interface language', async () => {
    shell('/income');
    act(() => useLocaleStore.getState().setLocale('ru'));
    await waitFor(() =>
      expect(document.title).toBe(`${t('nav.income', undefined, 'ru')} — ${t('app.title', undefined, 'ru')}`),
    );
  });

  it('names the game tab after its savegame, as the menu does', async () => {
    await saveSnapshot('londworth.sav', SNAPSHOT, 1, snapshotSettings({}, {}));
    shell('/game');
    await waitFor(() => expect(document.title).toBe(`londworth.sav — ${t('app.title')}`));
  });

  it('is the site name alone on a page without a tab', async () => {
    shell('/kit');
    await waitFor(() => expect(document.title).toBe(t('app.title')));
  });

  it('is set before the pageview is counted', async () => {
    shell('/network');
    await waitFor(() => expect(counted.length).toBeGreaterThan(0));
    expect(counted[0]).toBe(`${t('nav.network')} — ${t('app.title')}`);
  });
});
