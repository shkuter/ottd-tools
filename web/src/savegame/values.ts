/**
 * Reads record values against a table chunk's own field list.
 *
 * File types are the SLE_FILE_* constants the game stores in the table header
 * (saveload.h:640). Bit 0x10 marks a field saved as a list, which is written as a gamma
 * count followed by that many values.
 */

import type { Chunk, TableField } from './chunks';
import { ByteReader, SavegameFormatError } from './reader';

const TYPE_MASK = 0xf;
const HAS_LENGTH_FIELD = 1 << 4;

const FILE_I8 = 1;
const FILE_U8 = 2;
const FILE_I16 = 3;
const FILE_U16 = 4;
const FILE_I32 = 5;
const FILE_U32 = 6;
const FILE_I64 = 7;
const FILE_U64 = 8;
const FILE_STRINGID = 9;
const FILE_STRING = 10;
const FILE_STRUCT = 11;

/**
 * A field value: a number, a string, a list of numbers for array fields, or — for struct
 * fields — the list of nested records (a plain struct is a list of length 0 or 1,
 * saveload.cpp:1941).
 */
export type FieldValue = number | bigint | string | number[] | RecordValues[];

/** One decoded record: field name → value. */
export type RecordValues = Map<string, FieldValue>;

/** Reads one record of a table chunk into a name → value map. */
export function readRecord(data: Uint8Array, fields: readonly TableField[]): RecordValues {
  const reader = new ByteReader(data);
  return readFields(reader, fields);
}

function readFields(reader: ByteReader, fields: readonly TableField[]): RecordValues {
  const out = new Map<string, FieldValue>();
  for (const field of fields) {
    out.set(field.name, readField(reader, field));
  }
  return out;
}

function readField(reader: ByteReader, field: TableField): FieldValue {
  const type = field.type;
  const kind = type & TYPE_MASK;
  // strings are stored with a length field of their own, so they never read as a list
  if (kind === FILE_STRING) return reader.string();
  if (kind === FILE_STRUCT) {
    const count = reader.gamma();
    const records: RecordValues[] = [];
    for (let i = 0; i < count; i++) records.push(readFields(reader, field.children ?? []));
    return records;
  }
  if (type & HAS_LENGTH_FIELD) {
    const count = reader.gamma();
    const values: number[] = [];
    for (let i = 0; i < count; i++) values.push(Number(readScalar(reader, kind)));
    return values;
  }
  return readScalar(reader, kind);
}

function readScalar(reader: ByteReader, kind: number): number | bigint {
  switch (kind) {
    case FILE_I8:
      return reader.i8();
    case FILE_U8:
      return reader.u8();
    case FILE_I16:
      return reader.i16();
    case FILE_U16:
    case FILE_STRINGID:
      return reader.u16();
    case FILE_I32:
      return reader.i32();
    case FILE_U32:
      return reader.u32();
    case FILE_I64:
      return reader.i64();
    case FILE_U64:
      return reader.u64();
    default:
      throw new SavegameFormatError(`unsupported field type ${kind}`);
  }
}

/** Value as a plain number; anything that is not numeric reads as undefined. */
export function asNumber(value: FieldValue | undefined): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  return undefined;
}

/**
 * Walks the records of a table chunk, skipping the zero-length ones the array encoding
 * writes for index gaps. `read` gets the decoded record and its pool index; returning
 * undefined drops it.
 */
export function readTable<T>(
  chunk: Chunk | undefined,
  read: (values: RecordValues, index: number) => T | undefined,
): Map<number, T> {
  const out = new Map<number, T>();
  if (!chunk?.fields) return out;
  for (const record of chunk.records) {
    if (record.data.length === 0) continue;
    const value = read(readRecord(record.data, chunk.fields), record.index);
    if (value !== undefined) out.set(record.index, value);
  }
  return out;
}

/** Value as a string; a field the save left empty or stored otherwise reads as ''. */
export function asString(value: FieldValue | undefined): string {
  return typeof value === 'string' ? value : '';
}

/**
 * A pool pointer as a plain index. The game stores every reference as id + 1 so that 0 can
 * mean "none" (SlSaveLoadRef, saveload.cpp), which is what null stands for here.
 */
export function asPoolRef(value: FieldValue | undefined): number | null {
  const stored = asNumber(value) ?? 0;
  return stored > 0 ? stored - 1 : null;
}

/** A list of pool pointers; entries pointing at nothing are dropped. */
export function asPoolRefs(value: FieldValue | undefined): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry === 'number' && entry > 0) out.push(entry - 1);
  }
  return out;
}
