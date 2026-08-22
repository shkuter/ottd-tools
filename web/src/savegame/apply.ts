/**
 * Applies an import the player confirmed. Everything a savegame states is a setting, the
 * FIRS economy included, so one call carries all of it.
 */

import { useSettingsStore } from '../state/settingsStore';
import type { SavegameImport } from './import';

export function applyImport(proposal: SavegameImport): void {
  useSettingsStore.getState().applySettings(proposal.game, proposal.calc);
}
