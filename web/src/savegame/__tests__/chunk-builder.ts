/**
 * Writes savegame chunks the way the game does, for tests that need a layout no fixture
 * has: the old ORDR order pool, a vanilla save with no EIDS, a goods entry without the
 * rating bit. Shared by the tests so the framing rules live in one place.
 */

export const CH_TABLE = 3;
export const CH_SPARSE_TABLE = 4;

/** File types of table fields (saveload.h:640), as far as the tests need them. */
export const U8 = 2;
export const U16 = 4;
export const I32 = 5;
export const U32 = 6;
export const I64 = 7;
export const U32_LIST = 0x16;
export const STR = 0x1a;
/** SLE_FILE_STRUCT (11) always carries the length-field bit, so a struct field reads 0x1b. */
const STRUCT_TYPE = 11;
export const STRUCT = STRUCT_TYPE | 0x10;

/** One field of a table header; a struct field carries the header of its children. */
export type Field = [number, string, Header?];
export type Header = Field[];

export class Writer {
  bytes: number[] = [];

  u8(value: number): this {
    this.bytes.push(value & 0xff);
    return this;
  }

  u16(value: number): this {
    return this.u8(value >>> 8).u8(value);
  }

  u32(value: number): this {
    return this.u16(value >>> 16).u16(value);
  }

  i64(value: number): this {
    return this.u32(value < 0 ? -1 : 0).u32(value);
  }

  /** SlWriteSimpleGamma: 7 bits in one byte, 14 bits as 0b10xxxxxx plus a byte. */
  gamma(value: number): this {
    if (value < 128) return this.u8(value);
    if (value < 1 << 14) return this.u8(0x80 | (value >> 8)).u8(value);
    throw new Error(`gamma out of range: ${value}`);
  }

  /** A saved string is a gamma byte length followed by UTF-8, as the game writes it. */
  str(text: string): this {
    const bytes = new TextEncoder().encode(text);
    this.gamma(bytes.length);
    for (const byte of bytes) this.u8(byte);
    return this;
  }
}

function writeHeader(writer: Writer, fields: Header): void {
  for (const [type, name] of fields) writer.u8(type).str(name);
  writer.u8(0);
  // the header of a struct field follows the parent list, in declaration order
  for (const [type, , children] of fields) {
    if ((type & 0xf) === STRUCT_TYPE) writeHeader(writer, children ?? []);
  }
}

/**
 * One table chunk: the header record, then the payload records. A sparse chunk expects
 * each record to start with its own index, which the record writer emits.
 */
export function chunk(
  id: string,
  type: typeof CH_TABLE | typeof CH_SPARSE_TABLE,
  fields: Header,
  records: ((writer: Writer) => void)[],
): number[] {
  const out = new Writer();
  for (const char of id) out.u8(char.charCodeAt(0));
  out.u8(type);
  const header = new Writer();
  writeHeader(header, fields);
  out.gamma(header.bytes.length + 1);
  out.bytes.push(...header.bytes);
  for (const write of records) {
    const record = new Writer();
    write(record);
    out.gamma(record.bytes.length + 1);
    out.bytes.push(...record.bytes);
  }
  out.gamma(0);
  return out.bytes;
}

/** An uncompressed savegame container around already-written chunks. */
export function savegame(version: number, chunks: number[]): Uint8Array {
  const header = new Writer();
  for (const char of 'OTTN') header.u8(char.charCodeAt(0));
  header.u32(version << 16);
  return new Uint8Array([...header.bytes, ...chunks, 0, 0, 0, 0]);
}
