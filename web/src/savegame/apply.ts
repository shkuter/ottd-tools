/**
 * Applies an import the player confirmed: one confirmation carries both what the savegame
 * states as settings — the FIRS economy included — and the snapshot of its network. Until
 * it is called nothing is written, which is what "load, look, then decide" rests on.
 */

import { useSettingsStore } from '../state/settingsStore';
import type { SavegameImport } from './import';
import type { Snapshot } from './snapshot';
import { saveSnapshot } from './snapshotStore';

export interface ConfirmedImport {
  proposal: SavegameImport;
  snapshot: Snapshot;
  fileName: string;
}

export async function applyImport(confirmed: ConfirmedImport, savedAt: number): Promise<void> {
  const { proposal, snapshot, fileName } = confirmed;
  useSettingsStore.getState().applySettings(proposal.game, proposal.calc);
  await saveSnapshot(fileName, snapshot, savedAt);
}
