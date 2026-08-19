import { describe, expect, it } from 'vitest';
import { lzo1xCompress } from 'lzo1x';
import { decompressSavegame, readHeader } from '../decompress';
import { SavegameFormatError } from '../reader';

const PAYLOAD = new TextEncoder().encode('PATS'.padEnd(64, '.').repeat(40));

/** Builds the eight byte container header the game writes. */
function header(tag: string, version: number, jgrpp = false): Uint8Array {
  const out = new Uint8Array(8);
  out.set(new TextEncoder().encode(tag));
  new DataView(out.buffer).setUint32(4, ((version | (jgrpp ? 0x8000 : 0)) << 16) >>> 0);
  return out;
}

function join(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
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

/** Wraps payload the way LZOSaveFilter does: checksum, length, then the compressed block. */
function lzoBlocks(bytes: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [];
  for (let at = 0; at < bytes.length; at += 8192) {
    const packed = lzo1xCompress(bytes.subarray(at, at + 8192));
    const head = new Uint8Array(8);
    const view = new DataView(head.buffer);
    view.setUint32(4, packed.length);
    view.setUint32(0, adler32(head.subarray(4, 8), packed));
    blocks.push(head, packed);
  }
  return join(...blocks);
}

describe('заголовок', () => {
  it('распознаёт формат сжатия по тегу, а не по расширению', () => {
    expect(readHeader(header('OTTN', 295)).compression).toBe('none');
    expect(readHeader(header('OTTZ', 295)).compression).toBe('zlib');
    expect(readHeader(header('OTTX', 295)).compression).toBe('xz');
    expect(readHeader(header('OTTD', 295)).compression).toBe('lzo');
  });

  it('снимает флаг патчпака с номера версии', () => {
    const plain = readHeader(header('OTTX', 292));
    expect(plain).toMatchObject({ version: 292, jgrpp: false });
    const patched = readHeader(header('OTTX', 292, true));
    expect(patched).toMatchObject({ version: 292, jgrpp: true });
  });

  it('чужой файл — понятная ошибка', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
    expect(() => readHeader(png)).toThrow(SavegameFormatError);
    expect(() => readHeader(Uint8Array.from([1, 2, 3]))).toThrow(SavegameFormatError);
  });
});

describe('распаковка', () => {
  it('none — поток идёт как есть', async () => {
    const { data } = await decompressSavegame(join(header('OTTN', 295), PAYLOAD));
    expect(data).toEqual(PAYLOAD);
  });

  it('zlib', async () => {
    const file = join(header('OTTZ', 295), await deflate(PAYLOAD));
    const { data } = await decompressSavegame(file);
    expect(data).toEqual(PAYLOAD);
  });

  it('lzo — цепочка блоков с контрольной суммой', async () => {
    const file = join(header('OTTD', 295), lzoBlocks(PAYLOAD));
    const { data } = await decompressSavegame(file);
    expect(data).toEqual(PAYLOAD);
  });

  it('lzo — испорченный блок не проходит проверку', async () => {
    const file = join(header('OTTD', 295), lzoBlocks(PAYLOAD));
    file[file.length - 1] ^= 0xff;
    await expect(decompressSavegame(file)).rejects.toThrow(SavegameFormatError);
  });
});
