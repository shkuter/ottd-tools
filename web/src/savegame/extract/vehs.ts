/**
 * Trains from the vehicle pool (VEHS, sparse table). Every record is one unit; a consist
 * is the `next` chain from a front engine.
 */

import type { Chunk } from '../chunks';
import { asNumber, asPoolRef, asPoolRefs, asString, readTable, type RecordValues } from '../values';

const VEH_TRAIN = 0;

/** Ground vehicle subtype bits (vehicle_base.h:83). */
export const TS_FRONT = 1 << 0;
export const TS_ARTICULATED_PART = 1 << 1;
const TS_ENGINE = 1 << 3;
const TS_MULTIHEADED = 1 << 5;

/** Rear half of a dual-headed engine: it is part of the vehicle in front of it. */
export function isRearDualheaded(subtype: number): boolean {
  // ground_vehicle.hpp:336 — IsMultiheaded() && !IsEngine()
  return (subtype & TS_MULTIHEADED) !== 0 && (subtype & TS_ENGINE) === 0;
}

export interface SavedTrainUnit {
  index: number;
  /** Pool index of the next unit in the consist; null closes the chain. */
  next: number | null;
  subtype: number;
  /** Engine pool index — what EIDS resolves to a GRF id. */
  engineType: number;
  owner: number;
  unitNumber: number;
  cargoType: number;
  cargoCap: number;
  /** Cargo packet pool refs; the loaded amount is the CAPA sum over them. */
  packetRefs: number[];
  /** Game money; the pool stores it shifted by 8 fractional bits (vehicle_base.h). */
  profitThisYear: number;
  profitLastYear: number;
  buildYear: number;
  /** Order list pool index the unit runs; null for none. */
  ordersRef: number | null;
  groupId: number;
  vehStatus: number;
  /** Player-given name; empty when the game numbers it. */
  name: string;
}

export function readTrains(chunk: Chunk | undefined): Map<number, SavedTrainUnit> {
  return readTable(chunk, (values, index) => {
    // the pool holds every vehicle type; road vehicles, ships and aircraft are skipped
    if (asNumber(values.get('type')) !== VEH_TRAIN) return undefined;
    const train = (values.get('train') as RecordValues[] | undefined)?.[0];
    const common = (train?.get('common') as RecordValues[] | undefined)?.[0];
    if (!common) return undefined;
    return {
      index,
      next: asPoolRef(common.get('next')),
      subtype: asNumber(common.get('subtype')) ?? 0,
      engineType: asNumber(common.get('engine_type')) ?? 0,
      owner: asNumber(common.get('owner')) ?? 0,
      unitNumber: asNumber(common.get('unitnumber')) ?? 0,
      cargoType: asNumber(common.get('cargo_type')) ?? 0xff,
      cargoCap: asNumber(common.get('cargo_cap')) ?? 0,
      packetRefs: asPoolRefs(common.get('cargo.packets')),
      profitThisYear: money(common.get('profit_this_year')),
      profitLastYear: money(common.get('profit_last_year')),
      buildYear: asNumber(common.get('build_year')) ?? 0,
      ordersRef: asPoolRef(common.get('orders')),
      groupId: asNumber(common.get('group_id')) ?? 0,
      vehStatus: asNumber(common.get('vehstatus')) ?? 0,
      name: asString(common.get('name')),
    };
  });
}

/**
 * Profit fields carry 8 fractional bits; the game shows them shifted, not truncated
 * (GetDisplayProfitThisYear, vehicle_base.h:572), which differs for a loss.
 */
function money(value: unknown): number {
  if (typeof value === 'bigint') return Number(value >> 8n);
  if (typeof value === 'number') return Math.floor(value / 256);
  return 0;
}
