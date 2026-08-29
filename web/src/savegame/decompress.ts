/**
 * Savegame container: an eight byte header followed by one compressed stream.
 *
 * The header is a four byte tag naming the compressor and a big endian uint32 whose high
 * half is the savegame version (saveload.cpp SaveFileToDisk). JGR's Patchpack marks its own
 * saves by setting bit 0x8000 of that version (SAVEGAME_VERSION_EXT, sl/saveload.cpp:95).
 */

import { lzo1xDecompress } from 'lzo1x';
import { SavegameFormatError } from './reader';

export type SavegameCompression = 'none' | 'zlib' | 'xz' | 'lzo' | 'zstd';

const TAGS: Record<string, SavegameCompression> = {
  OTTN: 'none',
  OTTZ: 'zlib',
  OTTX: 'xz',
  OTTD: 'lzo',
  OTTS: 'zstd',
};

/** Bit the patchpack sets in the version word to flag its extended format. */
const VERSION_EXT = 0x8000;

/** Output buffer the game compresses against, so no LZO block decodes to more (saveload.cpp:2434). */
const LZO_BUFFER_SIZE = 8192;

export interface SavegameHeader {
  compression: SavegameCompression;
  /** Savegame version with the patchpack flag stripped off. */
  version: number;
  jgrpp: boolean;
}

export function readHeader(bytes: Uint8Array): SavegameHeader {
  if (bytes.length < 8) {
    throw new SavegameFormatError('file is too short to be a savegame', 'savegame.error.notASavegame');
  }
  const tag = String.fromCharCode(...bytes.subarray(0, 4));
  const compression = TAGS[tag];
  if (!compression) {
    throw new SavegameFormatError(
      `not an OpenTTD savegame (tag "${printable(tag)}")`,
      'savegame.error.notASavegame',
    );
  }
  const raw = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4) >>> 16;
  return { compression, version: raw & ~VERSION_EXT, jgrpp: (raw & VERSION_EXT) !== 0 };
}

/** Reads the header and unpacks the stream that follows it. */
export async function decompressSavegame(
  bytes: Uint8Array,
): Promise<{ header: SavegameHeader; data: Uint8Array }> {
  const header = readHeader(bytes);
  const body = bytes.subarray(8);
  try {
    switch (header.compression) {
      case 'none':
        return { header, data: body };
      case 'zlib':
        return { header, data: await inflate(body) };
      case 'xz':
        return { header, data: await unxz(body) };
      case 'lzo':
        return { header, data: unlzo(body) };
      case 'zstd':
        return { header, data: await unzstd(body) };
    }
  } catch (err) {
    if (err instanceof SavegameFormatError) throw err;
    // whatever the branch threw — a decoder refusing a broken stream, or the dynamic import
    // of one failing — the player is looking at a file that cannot be read, not at a library
    throw new SavegameFormatError(
      `cannot decompress ${header.compression} stream: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** zlib stream — the platform decompresses it, no dependency needed. */
async function inflate(body: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([body as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * xz stream, the game's default. The decoder is a WebAssembly build of liblzma and is only
 * fetched once a save actually turns out to be xz, so it stays out of the main bundle.
 */
async function unxz(body: Uint8Array): Promise<Uint8Array> {
  const { XzReadableStream } = await import('xz-decompress');
  const source = new Blob([body as BlobPart]).stream();
  return new Uint8Array(await new Response(new XzReadableStream(source)).arrayBuffer());
}

/**
 * zstd stream, written by JGR's Patchpack. Only its autosaves, exit.sav, the world generator
 * save and network transfer get the flag that allows the format (SMF_ZSTD_OK,
 * sl/saveload.cpp); a manual save is still xz. The decoder is plain JavaScript, fetched only
 * once a save turns out to be zstd, so it stays out of the main bundle.
 *
 * The game compresses as it writes (ZSTD_e_continue, then ZSTD_e_end on Finish) and never
 * pledges the source size, so the frame header states no content size and the decoder has to
 * grow its own buffer.
 */
async function unzstd(body: Uint8Array): Promise<Uint8Array> {
  const { decompress } = await import('fzstd');
  return decompress(body);
}

/**
 * LZO stream, written by ancient versions. It is not one stream but a chain of blocks, each
 * prefixed by an Adler-32 checksum and its compressed length (saveload.cpp LZOLoadFilter).
 * The checksum covers the stored length word together with the block payload.
 */
function unlzo(body: Uint8Array): Uint8Array {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const blocks: Uint8Array[] = [];
  let total = 0;
  let at = 0;
  while (at + 8 <= body.length) {
    const checksum = view.getUint32(at);
    const sizeWord = body.subarray(at + 4, at + 8);
    const size = view.getUint32(at + 4);
    const payload = body.subarray(at + 8, at + 8 + size);
    if (payload.length !== size) throw new SavegameFormatError('truncated LZO block');
    if (adler32(sizeWord, payload) !== checksum) {
      throw new SavegameFormatError('bad checksum in LZO block');
    }
    const block = lzo1xDecompress(payload);
    if (block.length > LZO_BUFFER_SIZE) throw new SavegameFormatError('oversized LZO block');
    blocks.push(block);
    total += block.length;
    at += 8 + size;
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const block of blocks) {
    out.set(block, pos);
    pos += block.length;
  }
  return out;
}

function adler32(...parts: Uint8Array[]): number {
  let a = 1;
  let b = 0;
  for (const part of parts) {
    for (const byte of part) {
      a = (a + byte) % 65521;
      b = (b + a) % 65521;
    }
  }
  return ((b << 16) | a) >>> 0;
}

function printable(tag: string): string {
  return [...tag].map((c) => (c >= ' ' && c <= '~' ? c : '?')).join('');
}
