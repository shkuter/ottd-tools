/**
 * ECMY — the economy state. Only the accumulated inflation is of interest, and only as
 * information: the calculator keeps modelling inflation from the year it is given.
 * Both values are 16.16 fixed point, so 65536 means "no inflation yet" (economy.cpp).
 */

import type { Chunk } from '../chunks';
import { asNumber, readRecord } from '../values';

const ONE = 65536;

export interface SavedInflation {
  /** Multiplier applied to prices so far. */
  prices: number;
  /** Multiplier applied to cargo payments so far. */
  payment: number;
}

export function readInflation(chunk: Chunk | undefined): SavedInflation | undefined {
  if (!chunk?.fields) return undefined;
  const record = chunk.records[0];
  if (!record) return undefined;
  const values = readRecord(record.data, chunk.fields);
  const prices = asNumber(values.get('inflation_prices'));
  const payment = asNumber(values.get('inflation_payment'));
  if (prices == null || payment == null) return undefined;
  return { prices: prices / ONE, payment: payment / ONE };
}
