/**
 * Chunk layer of the savegame stream.
 *
 * A savegame is a flat list of chunks: a four byte id, a type byte, then the payload. What
 * makes an unknown chunk skippable is that every array and table record carries its own
 * length (SlIterateArray, saveload.cpp:677) and a RIFF chunk states its length up front, so
 * the reader can step over data whose layout it knows nothing about.
 */

import { ByteReader, SavegameFormatError } from './reader';

export const CH_RIFF = 0;
export const CH_ARRAY = 1;
export const CH_SPARSE_ARRAY = 2;
export const CH_TABLE = 3;
export const CH_SPARSE_TABLE = 4;
/** JGRPP only: a marker byte saying an extra uint32 of flags precedes the real header. */
const CH_EXT_HDR = 15;
/** The one extended flag in use: a RIFF length wider than 28 bits. */
const SLCEHF_BIG_RIFF = 1;

const SLE_FILE_END = 0;
const SLE_FILE_STRUCT = 11;
const SLE_FILE_TYPE_MASK = 0xf;

/** One field of a table chunk header: the name the game saved and its file type. */
export interface TableField {
  name: string;
  type: number;
}

export interface ChunkRecord {
  index: number;
  data: Uint8Array;
}

export interface Chunk {
  id: string;
  type: number;
  /** Present for table chunks, which describe their own fields. */
  fields?: TableField[];
  /** Records of this chunk — only collected for the chunks that were asked for. */
  records: ChunkRecord[];
  /** Number of records, counted even when the records themselves were skipped. */
  recordCount: number;
}

/**
 * Walks the whole stream, keeping the records of the requested chunks and counting the rest.
 * Chunks are returned in the order the file lists them.
 */
export function readChunks(data: Uint8Array, wanted: Iterable<string>): Map<string, Chunk> {
  const keep = new Set(wanted);
  const reader = new ByteReader(data);
  const chunks = new Map<string, Chunk>();

  for (;;) {
    if (reader.atEnd) break;
    const id = chunkId(reader.u32());
    if (id === '\0\0\0\0') break;

    let marker = reader.u8();
    let flags = 0;
    if ((marker & SLE_FILE_TYPE_MASK) === CH_EXT_HDR) {
      flags = reader.u32();
      marker = reader.u8();
    }
    const type = marker & SLE_FILE_TYPE_MASK;
    const chunk: Chunk = { id, type, records: [], recordCount: 0 };

    if (type === CH_RIFF) {
      let length = (reader.u8() << 16) | ((marker >> 4) << 24);
      length += reader.u16();
      if (flags & SLCEHF_BIG_RIFF) length += reader.u32() * 2 ** 28;
      const payload = reader.take(length);
      chunk.recordCount = 1;
      if (keep.has(id)) chunk.records.push({ index: 0, data: payload });
    } else if (
      type === CH_ARRAY ||
      type === CH_SPARSE_ARRAY ||
      type === CH_TABLE ||
      type === CH_SPARSE_TABLE
    ) {
      readRecords(reader, chunk, keep.has(id));
    } else {
      throw new SavegameFormatError(
        `unknown chunk type ${type} in ${id}`,
        'savegame.error.unknownChunk',
        { chunk: id },
      );
    }

    chunks.set(id, chunk);
  }

  return chunks;
}

function readRecords(reader: ByteReader, chunk: Chunk, keep: boolean): void {
  const sparse = chunk.type === CH_SPARSE_ARRAY || chunk.type === CH_SPARSE_TABLE;
  const table = chunk.type === CH_TABLE || chunk.type === CH_SPARSE_TABLE;
  let expectHeader = table;
  let autoIndex = 0;

  for (;;) {
    const length = reader.gamma();
    if (length === 0) break;
    const end = reader.offset + length - 1;

    if (expectHeader) {
      // the header is the first record of a table chunk and describes every field that follows
      if (keep) chunk.fields = readTableHeader(new ByteReader(reader.take(end - reader.offset)));
      expectHeader = false;
    } else {
      const index = sparse ? reader.gamma() : autoIndex++;
      if (keep) chunk.records.push({ index, data: reader.take(end - reader.offset) });
      chunk.recordCount++;
    }

    if (reader.offset > end) throw new SavegameFormatError(`overran a record of ${chunk.id}`);
    reader.skip(end - reader.offset);
  }
}

/** Field list of a table chunk: pairs of type and name, closed by a zero type. */
export function readTableHeader(reader: ByteReader): TableField[] {
  const fields: TableField[] = [];
  for (;;) {
    const type = reader.u8();
    if (type === SLE_FILE_END) return fields;
    const name = reader.string();
    if ((type & SLE_FILE_TYPE_MASK) === SLE_FILE_STRUCT) {
      // nested structs carry their own header after this list; none of the chunks we read use them
      throw new SavegameFormatError(`field "${name}" is a struct, which is not supported`);
    }
    fields.push({ name, type });
  }
}

function chunkId(value: number): string {
  return String.fromCharCode(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
}
