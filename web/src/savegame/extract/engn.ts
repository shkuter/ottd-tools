/**
 * ENGN — what the game itself says about every engine of the pool.
 *
 * The interesting field is `company_avail`: the companies that may buy the engine right
 * now. The game keeps it per engine because it decides availability from things a data
 * file cannot state — the dates it rolled at startup, the ages it counted since, whether
 * the cargo set left the engine anything to carry. Reading it is how the calculator knows
 * what a buy menu of that game actually offers.
 *
 * `company_hidden` is the player's own doing: engines they folded away in the buy menu.
 * An engine hidden by the company is no longer on its list, so it counts as unavailable.
 */

import type { Chunk } from '../chunks';
import { asNumber, readTable } from '../values';

export interface SavedEngineState {
  /** Bitmask of companies the engine is on sale for; 0 means nobody may buy it. */
  available: number;
  /** Bitmask of companies that hid it from their own buy menu. */
  hidden: number;
}

/** Engine pool index → what the game says about it; empty map when the chunk is absent. */
export function readEngineStates(chunk: Chunk | undefined): Map<number, SavedEngineState> {
  return readTable(chunk, (values) => ({
    available: asNumber(values.get('company_avail')) ?? 0,
    hidden: asNumber(values.get('company_hidden')) ?? 0,
  }));
}

/**
 * Pool indices of the engines a company can buy.
 *
 * With no company to ask for — a save without companies — an engine counts as on sale
 * when any company may buy it: the availability the game computes is the same for all of
 * them, and only hiding is personal.
 */
export function enginesOnSale(
  states: Map<number, SavedEngineState>,
  companyIndex: number | null,
): Set<number> {
  const onSale = new Set<number>();
  for (const [index, state] of states) {
    if (companyIndex === null) {
      if (state.available !== 0) onSale.add(index);
      continue;
    }
    const bit = 1 << companyIndex;
    if ((state.available & bit) !== 0 && (state.hidden & bit) === 0) onSale.add(index);
  }
  return onSale;
}
