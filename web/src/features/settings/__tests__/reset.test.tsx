/**
 * "Reset everything" as the player presses it: the first press only asks, in a window that
 * lists what goes, and the confirmation wipes the stored settings and the imported game
 * together — reloading only once the deletion has landed. A reload racing it would read the
 * snapshot back out of IndexedDB and the game would still be there.
 *
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
import { useLocaleStore } from '../../../state/localeStore';

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

  useLocaleStore.getState().setLocale('en');
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

function draw() {
  return render(
    <MantineProvider forceColorScheme="dark">
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </MantineProvider>,
  );
}

/** A game and a drifted setting — the two things a reset must not wipe unasked. */
async function givenGameAndSettings() {
  await saveSnapshot('londworth.sav', SNAPSHOT, 1, snapshotSettings({}, {}));
  useSettingsStore.getState().applySettings({ dayLengthFactor: 8 }, {});
}

async function gameIsStored() {
  resetSnapshotStateForTests();
  return (await loadSnapshot()).record !== null;
}

describe('reset everything', () => {
  it('asks first, and wipes nothing on the first press', async () => {
    const user = userEvent.setup();
    await givenGameAndSettings();
    draw();

    await user.click(await screen.findByRole('button', { name: 'Reset everything' }));

    const dialog = await screen.findByRole('dialog');
    // the list names what goes, the imported game among it
    expect(dialog.textContent).toContain('the game and calculation settings');
    expect(dialog.textContent).toContain('the consist and the route');
    expect(dialog.textContent).toContain('londworth.sav');
    // the confirming button wears the danger class, the refusal does not
    const confirm = within(dialog).getByRole('button', { name: 'Reset everything' });
    expect(confirm.classList.contains('btn-danger')).toBe(true);
    expect(within(dialog).getByRole('button', { name: 'Cancel' }).classList.contains('btn-danger'))
      .toBe(false);

    expect(reloaded).toBe(0);
    expect(useSettingsStore.getState().game.dayLengthFactor).toBe(8);
    expect(await gameIsStored()).toBe(true);
  });

  it.each([
    ['Cancel', (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) =>
      user.click(within(dialog).getByRole('button', { name: 'Cancel' }))],
    ['the cross', (user: ReturnType<typeof userEvent.setup>) =>
      user.click(screen.getByLabelText('Close the window'))],
    ['Escape', (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
  ])('closes on %s and keeps everything', async (_how, dismiss) => {
    const user = userEvent.setup();
    await givenGameAndSettings();
    draw();

    await user.click(await screen.findByRole('button', { name: 'Reset everything' }));
    await dismiss(user, await screen.findByRole('dialog'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(reloaded).toBe(0);
    expect(useSettingsStore.getState().game.dayLengthFactor).toBe(8);
    expect(await gameIsStored()).toBe(true);
  });

  it('deletes the imported game along with the settings once confirmed', async () => {
    const user = userEvent.setup();
    await givenGameAndSettings();
    draw();

    await user.click(await screen.findByRole('button', { name: 'Reset everything' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reset everything' }));

    await waitFor(() => expect(reloaded).toBe(1));
    // the settings are back to their defaults...
    expect(useSettingsStore.getState().game.dayLengthFactor).toBe(1);
    // ...and the savegame is gone from the database, not just from memory
    expect(await gameIsStored()).toBe(false);
  });

  it('does not name an imported game when there is none', async () => {
    const user = userEvent.setup();
    resetSnapshotStateForTests();
    await loadSnapshot();
    draw();

    await user.click(await screen.findByRole('button', { name: 'Reset everything' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelectorAll('li')).toHaveLength(2);
    expect(dialog.textContent).not.toContain('imported game');
  });
});
