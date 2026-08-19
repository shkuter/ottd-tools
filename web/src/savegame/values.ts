/**
 * Reads record values against a table chunk's own field list.
 *
 * File types are the SLE_FILE_* constants the game stores in the table header
 * (saveload.h:640). Bit 0x10 marks a field saved as a list, which is written as a gamma
 * count followed by that many values.
 */

import type { TableField } from './chunks';
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

/** A field value: a number, a string, or a list of numbers for array fields. */
export type FieldValue = number | bigint | string | number[];

/** One decoded record: field name → value. */
export type RecordValues = Map<string, FieldValue>;

/** Reads one record of a table chunk into a name → value map. */
export function readRecord(data: Uint8Array, fields: readonly TableField[]): RecordValues {
  const reader = new ByteReader(data);
  const out = new Map<string, FieldValue>();
  for (const field of fields) {
    out.set(field.name, readField(reader, field.type));
  }
  return out;
}

function readField(reader: ByteReader, type: number): FieldValue {
  const kind = type & TYPE_MASK;
  // strings are stored with a length field of their own, so they never read as a list
  if (kind === FILE_STRING) return reader.string();
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
