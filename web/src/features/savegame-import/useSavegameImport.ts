import { useState } from 'react';
import { t } from '../../i18n';
import { useSettingsStore } from '../../state/settingsStore';
import { diffImport, type ImportDiff } from '../../savegame/diff';
import type { ConfirmedImport } from '../../savegame/apply';
import type { Snapshot } from '../../savegame/snapshot';

/**
 * Where an import has got to. Two places show an import — the settings screen and the window
 * over whatever page the player is on — and each drives its own copy of this: starting one in
 * two places at once is not a thing anyone does, and a store shared between them would only
 * add a layer to keep in step.
 */
export type ImportPhase =
  | { phase: 'idle' }
  | { phase: 'reading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; result: ConfirmedImport; diff: ImportDiff }
  | { phase: 'saved'; snapshot: Snapshot };

export type SavegameImport = {
  state: ImportPhase;
  readFile: (file: File) => Promise<void>;
  apply: (result: ConfirmedImport) => Promise<void>;
  reset: () => void;
};

/**
 * Loading a savegame never changes anything on its own: the file is read, the differences
 * are listed, and only a confirmation applies them.
 */
export function useSavegameImport(): SavegameImport {
  const [state, setState] = useState<ImportPhase>({ phase: 'idle' });
  const { game, calc, currency, speedUnit } = useSettingsStore();

  async function readFile(file: File) {
    setState({ phase: 'reading' });
    // the reader, the xz decoder and the chunk walker all live behind this import
    const savegame = await import('../../savegame/client');
    try {
      const result = await savegame.importSavegame(file);
      const diff = diffImport(result.proposal, game, calc, { currency, speedUnit });
      setState({ phase: 'ready', result, diff });
    } catch (error) {
      setState({
        phase: 'error',
        message:
          error instanceof savegame.SavegameImportError
            ? t(error.messageKey, error.params)
            : t('savegame.error.broken'),
      });
    }
  }

  async function apply(result: ConfirmedImport) {
    const { applyImport } = await import('../../savegame/apply');
    await applyImport(result, Date.now());
    setState({ phase: 'saved', snapshot: result.snapshot });
  }

  function reset() {
    setState({ phase: 'idle' });
  }

  return { state, readFile, apply, reset };
}
