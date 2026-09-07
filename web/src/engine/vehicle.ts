/**
 * What one vehicle of a set gives the train it runs in.
 *
 * One module because one rule decides all of it: a dual-headed vehicle is two vehicles in the
 * game, which builds the rear half as a second vehicle of the same type
 * (`train_cmd.cpp: AddRearEngineToMultiheadedTrain`). Which figures that doubles is not ours to
 * choose — the game states it field by field (`engine_type.h: RailVehicleInfo`): power, purchase
 * cost and running cost are already the sum of both halves, while weight and capacity are what
 * one half has.
 */
import type { Train } from '../types';

/** How many vehicles the game builds for this entry of the purchase list: one, or a pair. */
export function vehicleHalves(train: Pick<Train, 'dual_headed'>): 1 | 2 {
  return train.dual_headed ? 2 : 1;
}

/**
 * Length units the vehicle takes up on the track, both halves of a dual-headed one included:
 * the rear half is as long as the front, so the pair occupies twice what the field says.
 */
export function vehicleLengthUnits(train: Pick<Train, 'length' | 'dual_headed'>): number {
  return train.length * vehicleHalves(train);
}

/**
 * What the vehicle weighs empty. The game adds the stated weight once per half
 * (`train.h: Train::GetWeight`), which is why its own purchase window doubles the figure for a
 * multiheaded engine (`engine.cpp: Engine::GetDisplayWeight`). Power needs no such function:
 * there the property is already the sum, and the game halves it per half instead.
 */
export function vehicleWeightT(train: Pick<Train, 'weight_t' | 'dual_headed'>): number {
  return train.weight_t * vehicleHalves(train);
}
