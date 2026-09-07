/**
 * The two figures the catalogue works out rather than reads: how much a vehicle carries per
 * tile of platform, and how much it carries times how fast it goes on the chosen track.
 *
 * Both are assumptions of the calculator, not rules of the game — OpenTTD computes neither.
 * They live beside the catalogue that shows them, and each is one function so that a cell and
 * the sort key behind its header can never read a different number.
 */
import type { Railtype, Train } from '../../types';
import type { CalcSettings, GameSettings } from '../../engine/settings';
import { trainCapacity } from '../../dataset';
import { ownLimitBinds, vehicleLengthUnits } from '../../engine/consist';
import { topSpeedOn } from '../../engine/tracktypes';
import { displaySpeed, UNITS_PER_TILE, type SpeedUnit } from '../../engine/units';

/**
 * Capacity per tile of length: what the vehicle carries where the platform, not the vehicle,
 * is the binding constraint. A standard vehicle is half a tile long, so its figure is twice
 * the capacity printed beside it.
 *
 * The length is what the vehicle occupies on the track, so a dual-headed one counts both of
 * its halves: the pair is what the player buys and what the platform has to hold.
 *
 * Null rather than nought for a vehicle that carries nothing: an engine has no such figure at
 * all, and a nought would head the list the moment the sort is reversed. A vehicle of no length
 * would divide by nought — no set states one, and the guard is there so that a set which did
 * could not turn the column into infinities.
 */
export function capacityPerTile(train: Train, calc: CalcSettings): number | null {
  const capacity = trainCapacity(train, calc.capacityIndex);
  const length = vehicleLengthUnits(train);
  if (!capacity || !length) return null;
  return (capacity * UNITS_PER_TILE) / length;
}

/**
 * Capacity times the speed the vehicle reaches on this track, in the unit the interface shows
 * speeds in — the product of the two cells standing beside it, down to the truncation.
 *
 * Null in three cases: the vehicle carries nothing, it states no speed of its own (most vanilla
 * wagons), or its own limit does not bind the train it runs in. The last one is the game's
 * setting: with wagon speed limits off a wagon travels at whatever the engine allows, so
 * multiplying by the limit it carries in the data would state a speed the game never applies.
 */
export function capacityTimesSpeed(
  train: Train,
  track: Railtype | null | undefined,
  game: GameSettings,
  calc: CalcSettings,
  unit: SpeedUnit,
): number | null {
  const capacity = trainCapacity(train, calc.capacityIndex);
  if (!capacity || !ownLimitBinds(train, game)) return null;
  const internal = topSpeedOn(train, track);
  if (internal == null) return null;
  return capacity * displaySpeed(internal, unit);
}
