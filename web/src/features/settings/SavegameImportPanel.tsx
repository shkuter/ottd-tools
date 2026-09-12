import { useSyncExternalStore } from 'react';
import { Group, Text } from '@mantine/core';
import { t } from '../../i18n';
import { getSnapshotState, subscribeSnapshot } from '../../savegame/snapshotStore';
import { SavegameFileButton } from '../savegame-import/SavegameFileButton';
import { SavegameImportResult } from '../savegame-import/SavegameImportResult';
import { useSavegameImport } from '../savegame-import/useSavegameImport';

/**
 * The import as the settings screen offers it: the file is read, the differences are listed
 * in place, and only a confirmation applies them. The same import is reachable from every
 * page through the button in the corner of the window.
 */
export function SavegameImportPanel() {
  const importing = useSavegameImport();
  const stored = useSyncExternalStore(subscribeSnapshot, getSnapshotState);

  return (
    <div className="savegame-import">
      <p className="hint">{t('savegame.intro')}</p>
      <Group gap="xs">
        <SavegameFileButton
          label={
            importing.state.phase === 'reading' ? t('savegame.reading') : t('savegame.choose')
          }
          reading={importing.state.phase === 'reading'}
          onFile={(file) => void importing.readFile(file)}
        />
      </Group>

      <SavegameImportResult
        state={importing.state}
        apply={importing.apply}
        reset={importing.reset}
      />

      {importing.state.phase === 'idle' && stored.droppedOutdated && (
        <Text className="savegame-error">{t('savegame.snapshotOutdated')}</Text>
      )}
    </div>
  );
}
