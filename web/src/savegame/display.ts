/**
 * Names of a snapshot as the interface shows them: the locale-dependent half of naming,
 * kept apart from `names.ts` so the snapshot builder never pulls the locale store in.
 */

import { t } from '../i18n';
import { useLocaleStore } from '../state/localeStore';
import { stationDisplayName, type StationNameParts } from './names';
import type { SnapshotStation, SnapshotTown } from './snapshot';

/**
 * Display name of a town: what the save or the generator gives, or a numbered stub for a
 * name style the calculator does not generate.
 */
export function townName(town: Pick<SnapshotTown, 'id' | 'name'>): string {
  return town.name ?? t('savegame.townStub', { id: town.id });
}

/** Display name of a station, in the interface's current language. */
export function stationName(
  station: StationNameParts & Pick<SnapshotStation, 'townId'>,
  towns: ReadonlyMap<number, SnapshotTown>,
): string {
  const town = station.townId === null ? undefined : towns.get(station.townId);
  return stationDisplayName(
    station,
    town === undefined ? '' : townName(town),
    useLocaleStore.getState().locale,
  );
}
