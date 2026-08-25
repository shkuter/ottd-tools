/**
 * Applies an import the player confirmed: one confirmation carries both what the savegame
 * states as settings — the FIRS economy included — and the snapshot of its network. Until
 * it is called nothing is written, which is what "load, look, then decide" rests on.
 */

import { useSettingsStore } from '../state/settingsStore';
import type { SavegameImport } from './import';
import type { Snapshot } from './snapshot';
import { saveSnapshot, snapshotSettings } from './snapshotStore';

export interface ConfirmedImport {
  proposal: SavegameImport;
  snapshot: Snapshot;
  fileName: string;
}

export async function applyImport(confirmed: ConfirmedImport, savedAt: number): Promise<void> {
  const { proposal, snapshot, fileName } = confirmed;
  useSettingsStore.getState().applySettings(proposal.game, proposal.calc);
  // the snapshot keeps what the file said, completed with defaults — not what the store
  // ends up with: the tab computes over the game, not over the settings edited since
  await saveSnapshot(fileName, snapshot, savedAt, snapshotSettings(proposal.game, proposal.calc));
}
