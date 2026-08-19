/**
 * Applies an import the player confirmed. The FIRS economy lives in two stores of its own —
 * the chains tab and the route tab each keep one — so importing has to set both, otherwise
 * the tabs would disagree about which economy the game runs.
 */

import { useFirsStore } from '../state/firsStore';
import { useRouteStore } from '../state/routeStore';
import { useSettingsStore } from '../state/settingsStore';
import type { SavegameImport } from './import';

export function applyImport(proposal: SavegameImport): void {
  useSettingsStore.getState().applySettings(proposal.game, proposal.calc);
  if (proposal.economyId) {
    useFirsStore.getState().setEconomyId(proposal.economyId);
    useRouteStore.getState().setEconomyId(proposal.economyId);
  }
}
