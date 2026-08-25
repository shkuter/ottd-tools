/**
 * Order lists. Two on-disk shapes exist: since SLV_ORDERS_OWNED_BY_ORDERLIST (v354, and
 * earlier in JGRPP) the orders sit inside ORDL as a struct list; before that ORDL only
 * points at the first order of a chain in the ORDR pool. The shape is told apart by the
 * fields the table header names, not by the version — JGRPP numbers versions its own way.
 */

import type { Chunk } from '../chunks';
import { asNumber, asPoolRef, readRecord, type RecordValues } from '../values';

/** Order types (order_type.h:53); the type byte keeps them in its low 4 bits
 * (Order::GetType, order_base.h:72). */
const OT_GOTO_STATION = 1;
export const OT_GOTO_DEPOT = 2;
export const OT_GOTO_WAYPOINT = 6;

/** Load type of an order: a value, not a bit mask (order_type.h:77). */
const OLT_FULL_LOAD = 2;
const OLT_FULL_LOAD_ANY = 3;

export interface SavedOrder {
  /** Low 4 bits of the stored type byte. */
  type: number;
  flags: number;
  dest: number;
}

/**
 * Does the order wait to be filled? The load type lives in bits 4…6 of the flags
 * (order_base.h:142) and is compared by value — 4 is "no load", not another full-load bit
 * (IsFullLoadOrderLoadType, openttd-patches/src/order_type.h:149).
 */
export function isFullLoad(order: SavedOrder): boolean {
  const load = (order.flags >> 4) & 7;
  return load === OLT_FULL_LOAD || load === OLT_FULL_LOAD_ANY;
}

export function isStationOrder(order: SavedOrder): boolean {
  return order.type === OT_GOTO_STATION;
}

/** Order list pool index → its orders, resolved from either on-disk shape. */
export function readOrderLists(
  ordl: Chunk | undefined,
  ordr: Chunk | undefined,
): Map<number, SavedOrder[]> {
  const out = new Map<number, SavedOrder[]>();
  if (!ordl?.fields) return out;
  const inline = ordl.fields.find((f) => f.name === 'order_vector' || f.name === 'orders');
  const pool = inline ? undefined : readOrderPool(ordr);
  for (const record of ordl.records) {
    if (record.data.length === 0) continue;
    const values = readRecord(record.data, ordl.fields);
    if (inline) {
      const rows = (values.get(inline.name) as RecordValues[] | undefined) ?? [];
      out.set(record.index, rows.map(orderOfRecord));
    } else {
      out.set(record.index, chainFromPool(values, pool ?? new Map()));
    }
  }
  return out;
}

function orderOfRecord(row: RecordValues): SavedOrder {
  return {
    type: (asNumber(row.get('type')) ?? 0) & 0xf,
    flags: asNumber(row.get('flags')) ?? 0,
    dest: asNumber(row.get('dest')) ?? 0,
  };
}

/** ORDR pool: every order points at the one after it. */
function readOrderPool(
  ordr: Chunk | undefined,
): Map<number, { order: SavedOrder; next: number | null }> {
  const out = new Map<number, { order: SavedOrder; next: number | null }>();
  if (!ordr?.fields) return out;
  for (const record of ordr.records) {
    if (record.data.length === 0) continue;
    const values = readRecord(record.data, ordr.fields);
    out.set(record.index, {
      order: orderOfRecord(values),
      next: asPoolRef(values.get('next')),
    });
  }
  return out;
}

function chainFromPool(
  list: RecordValues,
  pool: Map<number, { order: SavedOrder; next: number | null }>,
): SavedOrder[] {
  const orders: SavedOrder[] = [];
  let at = asPoolRef(list.get('first'));
  // a broken chain must not loop forever
  for (let guard = 0; at !== null && guard < 5000; guard++) {
    const entry = pool.get(at);
    if (!entry) break;
    orders.push(entry.order);
    at = entry.next;
  }
  return orders;
}
