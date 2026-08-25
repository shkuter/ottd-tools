/**
 * The cargo packet pool (CAPA): a waiting or loaded amount is the sum of `count` over the
 * packet refs a station's goods entry or a vehicle keeps. Only the counts survive here —
 * the pool of a large game is the biggest chunk read, so it is reduced immediately.
 */

import type { Chunk } from '../chunks';
import { asNumber, readTable } from '../values';

/** Packet pool index → cargo units in that packet. */
export function readPacketCounts(chunk: Chunk | undefined): Map<number, number> {
  // reading only `count` still walks every field of every record; the field list is
  // short enough that the simple path costs little
  return readTable(chunk, (values) => asNumber(values.get('count')));
}

/** Sum of packet counts over a list of refs; refs to missing packets count as zero. */
export function sumPackets(counts: Map<number, number>, refs: readonly number[]): number {
  let total = 0;
  for (const ref of refs) total += counts.get(ref) ?? 0;
  return total;
}
