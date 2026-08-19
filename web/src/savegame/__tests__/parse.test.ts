import { describe, expect, it } from 'vitest';
import { MIN_SAVEGAME_VERSION, parseSavegame } from '../parse';
import { SavegameFormatError } from '../reader';
import { fixture } from './chunks.test';

function join(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function header(tag: string, version: number): Uint8Array {
  const out = new Uint8Array(8);
  out.set(new TextEncoder().encode(tag));
  new DataView(out.buffer).setUint32(4, (version << 16) >>> 0);
  return out;
}

function chunkId(id: string): Uint8Array {
  return new TextEncoder().encode(id);
}

/** PATS as pre-295 games wrote it: a plain RIFF block with no field names. */
function positionalPats(): Uint8Array {
  const payload = Uint8Array.from([1, 2, 3, 4]);
  const head = new Uint8Array(4);
  head[0] = 0; // CH_RIFF, high bits of the length are zero
  head[1] = 0;
  new DataView(head.buffer).setUint16(2, payload.length);
  return join(chunkId('PATS'), head, payload);
}

const TERMINATOR = new Uint8Array(4);

describe('граница поддерживаемых версий', () => {
  it('позиционный PATS отклоняется с указанием минимальной версии', async () => {
    const file = join(header('OTTN', 200), positionalPats(), TERMINATOR);
    await expect(parseSavegame(file)).rejects.toMatchObject({
      messageKey: 'savegame.error.tooOld',
      params: { version: 200, minimum: MIN_SAVEGAME_VERSION },
    });
  });

  it('сейв без чанка настроек тоже отклоняется', async () => {
    const file = join(header('OTTN', 300), TERMINATOR);
    await expect(parseSavegame(file)).rejects.toThrow(SavegameFormatError);
  });

  it('чужой файл называется не сейвом', async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    await expect(parseSavegame(png)).rejects.toMatchObject({
      messageKey: 'savegame.error.notASavegame',
    });
  });

  it('неизвестный тип чанка не проходит молча', async () => {
    const bogus = join(chunkId('XXXX'), Uint8Array.from([9]));
    const file = join(header('OTTN', 300), bogus, TERMINATOR);
    await expect(parseSavegame(file)).rejects.toMatchObject({
      messageKey: 'savegame.error.unknownChunk',
      params: { chunk: 'XXXX' },
    });
  });

  it('настоящий сейв проходит проверку', async () => {
    const { header: head, chunks } = await parseSavegame(fixture('londworth-1860'));
    // патчпак нумерует версии по-своему (292), поэтому годность решает тип чанка, а не номер
    expect(head).toMatchObject({ jgrpp: true, version: 292 });
    for (const id of ['PATS', 'NGRF', 'ECMY', 'DATE']) {
      expect(chunks.get(id)?.records.length).toBeGreaterThan(0);
    }
  });
});
