import { useState, useSyncExternalStore } from 'react';
import { Button, Group, Modal, Text } from '@mantine/core';
import { t } from '../../i18n';
import { getSnapshotState, subscribeSnapshot } from '../../savegame/snapshotStore';
import { resetPersistedState } from '../../state';

/**
 * "Reset everything", asked before it is done: a single press used to wipe the settings, the
 * consist and the imported game with no way back. The window is the game's own — the one the
 * import confirms its differences in — and it lists what goes, so the player sees the imported
 * game among it before agreeing.
 *
 * There is no undo after the confirmation: the reset reloads the page, and nothing of the
 * previous state is left to return to.
 */
export function ResetEverythingButton() {
  const [opened, setOpened] = useState(false);
  // subscribed, not read once: at startup the snapshot is still loading, and a single read
  // would say there is no game to lose
  const stored = useSyncExternalStore(subscribeSnapshot, getSnapshotState);

  async function resetAll() {
    // awaited: the imported game lives in IndexedDB, and reloading before the delete lands
    // would bring it back
    await resetPersistedState();
    // route, optimizer and FIRS state only leaves memory on a reload, so a
    // notification here would be swept away with the page
    location.reload();
  }

  const close = () => setOpened(false);

  return (
    <>
      <Button className="btn-danger" onClick={() => setOpened(true)}>
        {t('settings.reset')}
      </Button>

      <Modal
        opened={opened}
        onClose={close}
        title={t('settings.resetTitle')}
        closeButtonProps={{ 'aria-label': t('settings.resetCloseWindow') }}
      >
        <Text>{t('settings.resetWipes')}</Text>
        {/* the language is not listed: the reset leaves it where it is */}
        <ul>
          <li>{t('settings.resetWipesSettings')}</li>
          <li>{t('settings.resetWipesRoute')}</li>
          {stored.record && (
            <li>{t('settings.resetWipesGame', { fileName: stored.record.fileName })}</li>
          )}
        </ul>
        <Group gap="xs" className="window-actions">
          <Button className="btn-danger" onClick={() => void resetAll()}>
            {t('settings.reset')}
          </Button>
          <Button variant="default" onClick={close}>
            {t('settings.resetCancel')}
          </Button>
        </Group>
      </Modal>
    </>
  );
}
