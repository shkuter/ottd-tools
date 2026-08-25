/**
 * How the tab names things the snapshot only half-names: a train the player never renamed, a
 * consist of catalogue entries, a vehicle of a set the catalogue does not know.
 */

import { activeCargoByLabel, trainById } from '../../dataset';
import { vanillaTrains } from '../../vanilla';
import { t } from '../../i18n';
import { cargoName } from '../../i18n/names';
import type { GameSettings } from '../../engine/settings';
import type { Cargo } from '../../types';
import type { SnapshotConsistEntry, SnapshotTown, SnapshotTrain } from '../../savegame/snapshot';

const vanillaById = new Map(vanillaTrains.map((train) => [train.id, train]));

/** The player's name for the train, or its unit number the way the game titles the window. */
export function trainLabel(train: Pick<SnapshotTrain, 'name' | 'unitNumber'>): string {
  return train.name || t('game.trainNumber', { number: train.unitNumber });
}

/**
 * The consist in one line: "Haar ×1 + Mineral hopper ×11". A vehicle the catalogue does not
 * know keeps its place and its count under a stated name — dropping it would quietly shorten
 * the train.
 */
export function consistText(consist: readonly SnapshotConsistEntry[]): string {
  if (consist.length === 0) return t('game.noConsist');
  return consist.map((entry) => `${vehicleName(entry)} ×${entry.count}`).join(' + ');
}

function vehicleName(entry: SnapshotConsistEntry): string {
  if (entry.catalogueId === null) return t('game.unknownVehicle');
  const train = trainById.get(entry.catalogueId) ?? vanillaById.get(entry.catalogueId);
  return train?.name ?? t('game.unknownVehicle');
}

/**
 * Resolves a cargo the snapshot stores as a label. Built per set of settings, because which
 * cargoes exist at all is what the game's economy decides; a label outside it resolves to
 * nothing, and the interface names it unknown rather than printing the raw four-letter code.
 */
export function cargoLookup(game: GameSettings): (label: string | null) => Cargo | undefined {
  const byLabel = activeCargoByLabel(game);
  return (label) => (label === null ? undefined : byLabel.get(label));
}

/**
 * The same thing as text — what the lists sort by. Sorting compares strings, so it needs the
 * name rather than the cargo, and it must read the same name the cell shows.
 */
export function cargoNamer(game: GameSettings): (label: string | null) => string {
  const lookup = cargoLookup(game);
  return (label) => {
    const cargo = lookup(label);
    return cargo ? cargoName(cargo) : t('game.unknownCargo');
  };
}

/** Towns by id — what `stationName` and `townName` look a place up in. */
export function townsById(towns: readonly SnapshotTown[]): Map<number, SnapshotTown> {
  return new Map(towns.map((town) => [town.id, town]));
}
