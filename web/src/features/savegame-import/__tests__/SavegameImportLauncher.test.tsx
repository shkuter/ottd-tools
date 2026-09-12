/**
 * The import as it is reached from anywhere: a button in the corner of the window on every
 * page, and the differences shown over the page the player is on rather than on the settings
 * screen.
 *
 * Captions come from the dictionary rather than being typed out, so the checks are about the
 * behaviour and not about the language the interface happens to be in.
 *
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../../App';
import { t } from '../../../i18n';
import { TABS } from '../../../tabs';
import type { ConfirmedImport } from '../../../savegame/apply';
import type { Snapshot } from '../../../savegame/snapshot';
import { loadSnapshot, resetSnapshotStateForTests } from '../../../savegame/snapshotStore';
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

let result: ConfirmedImport;

vi.mock('../../../savegame/client', () => ({
  importSavegame: () => Promise.resolve(result),
  SavegameImportError: class extends Error {},
}));

/**
 * Every address the shell answers to, taken from the shell rather than from the tab table:
 * the interface-elements page is a route without a tab, and the button belongs on it too.
 */
const ROUTES = [...TABS.map((tab) => tab.path), '/kit'];

function shell(path = '/optimizer') {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </MantineProvider>,
  );
}

/** The file input — what a file is handed to. */
function launcher() {
  return screen.getByLabelText(t('savegame.importButton'));
}

/** The plate the caption is written on; the input inside it carries no text of its own. */
function launcherCaption() {
  return document.querySelector('.savegame-launcher label')!.textContent;
}

async function chooseFile() {
  await userEvent.upload(launcher(), new File(['savegame'], 'londworth.sav'));
}

/** A difference the fixture always carries, whatever the interface language is. */
function differenceShown() {
  return screen.findByText(t('settings.dayLength'));
}

describe('the import button in the corner', () => {
  afterEach(cleanup);

  beforeEach(async () => {
    useSettingsStore.getState().reset();
    useLocaleStore.getState().setLocale('en');
    resetSnapshotStateForTests();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('ottd-tools');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    result = {
      proposal: {
        jgrpp: true,
        game: { jgrpp: true, dayLengthFactor: 5 },
        calc: { priceYear: 1975 },
        info: [],
        unreadBaseCostSets: [],
        recognisedSets: [],
        display: {},
      },
      snapshot: SNAPSHOT,
      fileName: 'londworth.sav',
    };
  });

  it.each(ROUTES)('stands on %s', async (path) => {
    shell(path);
    await waitFor(() => expect(launcher()).toBeTruthy());
  });

  it('is called the same before and after an import', async () => {
    // the file name is already on the game tab; a second wording would be a second state
    shell();
    const before = launcherCaption();
    expect(before, 'the button has no caption to compare').toBe(t('savegame.importButton'));

    await chooseFile();
    await differenceShown();
    await userEvent.click(screen.getByRole('button', { name: t('savegame.apply') }));
    await screen.findByText(new RegExp(t('savegame.snapshotSaved', { summary: '' }).slice(0, 12)));

    expect(launcherCaption()).toBe(before);
  });

  it('shows the differences over the tab, keeping what is on it', async () => {
    shell('/optimizer');
    // the window's title is an h2 as well, so the page is asked inside main
    const main = document.querySelector('main')!;
    const heading = main.querySelector('h2')!.textContent;
    // something the player put on the tab: it has to survive the window opening over it.
    // The second number of the tab is the distance; the first one is the year, which the
    // import itself changes
    const field = main.querySelectorAll<HTMLInputElement>('input[inputmode="decimal"]')[1];
    const before = field.value;
    await userEvent.type(field, '123');
    const typed = field.value;
    expect(typed, 'the tab took no input to hold on to').not.toBe(before);

    await chooseFile();

    await screen.findByRole('dialog');
    expect(await differenceShown()).toBeTruthy();
    expect(document.querySelector('main')).toBe(main);
    expect(main.querySelector('h2')!.textContent).toBe(heading);
    expect(field.value, 'the tab under the window lost what was typed into it').toBe(typed);
  });

  it('closes on Escape without applying anything', async () => {
    shell();
    await chooseFile();
    await screen.findByRole('dialog');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(useSettingsStore.getState().game.dayLengthFactor).toBe(1);
    resetSnapshotStateForTests();
    expect((await loadSnapshot()).record).toBeNull();
  });

  it('closes on the cross of its caption bar', async () => {
    shell();
    await chooseFile();
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByLabelText(t('savegame.closeWindow')));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(useSettingsStore.getState().game.dayLengthFactor).toBe(1);
  });

  it('keeps the summary in the window after applying', async () => {
    // the settings change silently: without the summary nothing says that they did
    shell();
    await chooseFile();
    await differenceShown();

    await userEvent.click(screen.getByRole('button', { name: t('savegame.apply') }));

    await waitFor(() => expect(document.querySelector('.savegame-saved')).toBeTruthy());
    expect(screen.getByRole('dialog')).toBeTruthy();
    await waitFor(() => expect(useSettingsStore.getState().game.dayLengthFactor).toBe(5));

    await userEvent.click(screen.getByRole('button', { name: t('savegame.close') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
