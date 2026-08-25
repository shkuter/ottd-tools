/**
 * "Reset everything" as the player presses it: the button wipes the stored settings and the
 * imported game together, and only reloads once the deletion has landed. A reload racing it
 * would read the snapshot back out of IndexedDB and the game would still be there.
 *
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '../SettingsPage';
import {
  loadSnapshot,
  resetSnapshotStateForTests,
  saveSnapshot,
  snapshotSettings,
} from '../../../savegame/snapshotStore';
import type { Snapshot } from '../../../savegame/snapshot';
import { useSettingsStore } from '../../../state/settingsStore';

const SNAPSHOT: Snapshot = {
  companies: [{ id: 0, name: '', isAi: false }],
  towns: [],
  stations: [],
  routes: [],
  trains: [],
  groups: [],
  industries: [],
};

/** jsdom implements no navigation, and the page reloads itself at the end of a reset. */
let reloaded = 0;

beforeEach(async () => {
  reloaded = 0;
  vi.spyOn(window, 'location', 'get').mockReturnValue({
    ...window.location,
    reload: () => {
      reloaded++;
    },
  } as unknown as Location);

  useSettingsStore.getState().reset();
  resetSnapshotStateForTests();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase('ottd-tools');
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('reset everything', () => {
  it('deletes the imported game along with the settings', async () => {
    const user = userEvent.setup();
    await saveSnapshot('londworth.sav', SNAPSHOT, 1, snapshotSettings({}, {}));
    useSettingsStore.getState().applySettings({ dayLengthFactor: 8 }, {});

    render(
      <MantineProvider forceColorScheme="dark">
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </MantineProvider>,
    );

    await user.click(await screen.findByText('Reset everything'));

    await waitFor(() => expect(reloaded).toBe(1));
    // the settings are back to their defaults...
    expect(useSettingsStore.getState().game.dayLengthFactor).toBe(1);
    // ...and the savegame is gone from the database, not just from memory
    resetSnapshotStateForTests();
    expect((await loadSnapshot()).record).toBeNull();
  });
});
