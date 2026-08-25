/**
 * The import flow as the player drives it: nothing is written until the differences are
 * confirmed, and one confirmation carries both the settings and the snapshot.
 *
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SavegameImportPanel } from '../SavegameImportPanel';
import type { ConfirmedImport } from '../../../savegame/apply';
import type { Snapshot } from '../../../savegame/snapshot';
import { loadSnapshot, resetSnapshotStateForTests } from '../../../savegame/snapshotStore';
import { useSettingsStore } from '../../../state/settingsStore';
import { useLocaleStore } from '../../../state/localeStore';

const SNAPSHOT: Snapshot = {
  companies: [{ id: 0, name: '', isAi: false }],
  towns: [],
  stations: [],
  routes: [],
  trains: [],
  groups: [],
  industries: [],
};

/** What the reader hands back; the panel never touches a worker in these tests. */
let result: ConfirmedImport;

vi.mock('../../../savegame/client', () => ({
  importSavegame: () => Promise.resolve(result),
  SavegameImportError: class extends Error {},
}));

function panel() {
  return render(
    <MantineProvider>
      <SavegameImportPanel />
    </MantineProvider>,
  );
}

async function chooseFile() {
  const file = new File(['savegame'], 'londworth.sav');
  await userEvent.upload(screen.getByLabelText(/Выбрать сейв|Choose a savegame/), file);
}

describe('savegame import panel', () => {
  // vitest is not running with globals, so testing-library does not clean up on its own
  afterEach(cleanup);

  beforeEach(async () => {
    useSettingsStore.getState().reset();
    useLocaleStore.getState().setLocale('ru');
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
      },
      snapshot: SNAPSHOT,
      fileName: 'londworth.sav',
    };
  });

  it('confirming applies the settings and stores the snapshot', async () => {
    panel();
    await chooseFile();
    await screen.findByText(/Коэффициент уменьшения скорости экономики/);

    await userEvent.click(screen.getByRole('button', { name: 'Применить' }));

    await waitFor(() => expect(useSettingsStore.getState().game.dayLengthFactor).toBe(5));
    resetSnapshotStateForTests();
    expect((await loadSnapshot()).record?.fileName).toBe('londworth.sav');
  });

  it('cancelling changes nothing and stores no snapshot', async () => {
    panel();
    await chooseFile();
    await screen.findByText(/Коэффициент уменьшения скорости экономики/);

    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(useSettingsStore.getState().game.dayLengthFactor).toBe(1);
    resetSnapshotStateForTests();
    expect((await loadSnapshot()).record).toBeNull();
  });

  it('with the settings already matching, the confirmation still stores the snapshot', async () => {
    // nothing to apply: the panel says so and offers the snapshot on its own
    result = { ...result, proposal: { ...result.proposal, game: {}, calc: {} } };
    panel();
    await chooseFile();
    await screen.findByText(/Ваши настройки уже соответствуют этой партии/);

    await userEvent.click(screen.getByRole('button', { name: 'Сохранить снапшот' }));

    await screen.findByText(/Снапшот сохранён/);
    resetSnapshotStateForTests();
    expect((await loadSnapshot()).record?.fileName).toBe('londworth.sav');
  });
});
