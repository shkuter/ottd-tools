/**
 * Registry of persisted stores. The settings page resets everything through this list,
 * so a new store only needs to be added here to be covered by "reset all".
 */
import { deleteSnapshot } from '../savegame/snapshotStore';
import { useConsistStore } from './consistStore';
import { useIndustrySupplyStore } from './industrySupplyStore';
import { useOptimizerStore } from './optimizerStore';
import { useRouteStore } from './routeStore';
import { useSettingsStore } from './settingsStore';

const PERSISTED_STORES = [
  useSettingsStore,
  useConsistStore,
  useRouteStore,
  useOptimizerStore,
  useIndustrySupplyStore,
] as const;

/**
 * Wipe everything the calculator keeps of the user's own doing: the persisted stores in
 * localStorage and the imported game in IndexedDB. The caller reloads the page afterwards,
 * and the snapshot is deleted before that — a reload racing the delete would bring the
 * imported game back.
 */
export async function resetPersistedState(): Promise<void> {
  useSettingsStore.getState().reset();
  useConsistStore.getState().clear();
  for (const store of PERSISTED_STORES) store.persist.clearStorage();
  await deleteSnapshot();
}
