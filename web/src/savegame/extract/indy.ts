/**
 * Industries (INDY). `type` is what IIDS resolves to a GRF-local industry id.
 *
 * Two on-disk shapes: since SLV_INDUSTRY_CARGO_REORGANISE (315) production lives in a
 * `produced` struct list with a monthly history; before that the same figures sit in
 * parallel flat arrays — `produced_cargo`, `last_month_production`,
 * `last_month_transported` (industry_sl.cpp:158). Which one a save uses is told by the
 * fields its table header names, not by the version.
 */

import type { Chunk } from '../chunks';
import { asNumber, asPoolRef, readTable, type FieldValue, type RecordValues } from '../values';

export interface SavedProduced {
  cargoIndex: number;
  /** Last finished month, from the history where the save keeps one. */
  lastMonthProduction?: number;
  lastMonthTransported?: number;
}

export interface SavedIndustry {
  index: number;
  /** Industry type — IIDS maps it to the defining GRF. */
  typeId: number;
  /** Town pool index; null when the save states none. */
  town: number | null;
  produced: SavedProduced[];
}

export function readIndustries(chunk: Chunk | undefined): Map<number, SavedIndustry> {
  return readTable(chunk, (values, index) => ({
    index,
    typeId: asNumber(values.get('type')) ?? 0,
    town: asPoolRef(values.get('town')),
    produced: readProduced(values),
  }));
}

function readProduced(values: RecordValues): SavedProduced[] {
  const rows = values.get('produced') as RecordValues[] | undefined;
  if (rows === undefined) return readFlatProduced(values);
  const out: SavedProduced[] = [];
  for (const row of rows) {
    const cargoIndex = asNumber(row.get('cargo'));
    if (cargoIndex === undefined || cargoIndex === 0xff) continue;
    const produced: SavedProduced = { cargoIndex };
    // history[0] is the running month, [1] the finished one (THIS_MONTH / LAST_MONTH,
    // misc/history_type.hpp:45)
    const history = (row.get('history') as RecordValues[] | undefined)?.[1];
    if (history) {
      produced.lastMonthProduction = asNumber(history.get('production'));
      produced.lastMonthTransported = asNumber(history.get('transported'));
    }
    out.push(produced);
  }
  return out;
}

/** Pre-315 layout: one array per figure, indexed the same way. */
function readFlatProduced(values: RecordValues): SavedProduced[] {
  const cargos = values.get('produced_cargo');
  if (!Array.isArray(cargos)) return [];
  const production = values.get('last_month_production');
  const transported = values.get('last_month_transported');
  const out: SavedProduced[] = [];
  (cargos as number[]).forEach((cargoIndex, slot) => {
    if (cargoIndex === 0xff) return;
    out.push({
      cargoIndex,
      lastMonthProduction: numberAt(production, slot),
      lastMonthTransported: numberAt(transported, slot),
    });
  });
  return out;
}

function numberAt(value: FieldValue | undefined, index: number): number | undefined {
  if (!Array.isArray(value)) return undefined;
  const entry = (value as unknown[])[index];
  return typeof entry === 'number' ? entry : undefined;
}
