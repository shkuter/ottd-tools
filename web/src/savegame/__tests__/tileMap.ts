/**
 * Синтетическая карта для тестов: набор полей тайла превращается в те же байты, какими их
 * пишет игра, — либо одним чанком `WMAP` патчпака, либо чанком на поле, как пишет ваниль.
 *
 * Живёт отдельным модулем, а не рядом с `describe`: файл `*.test.ts`, из которого что-то
 * импортируют, выполняется целиком у каждого импортёра и заново регистрирует свои тесты.
 */

import { CH_RIFF, type Chunk } from '../chunks';

/** Поля одного тайла; неназванное — ноль, как на пустой земле. */
export interface TileFields {
  type?: number;
  height?: number;
  m1?: number;
  m2?: number;
  m3?: number;
  m4?: number;
  m5?: number;
  m6?: number;
  m7?: number;
  m8?: number;
}

export type MapLayout = 'wmap' | 'fields';

const riff = (id: string, data: Uint8Array): Chunk => ({
  id,
  type: CH_RIFF,
  records: [{ index: 0, data }],
  recordCount: 1,
});

/**
 * Чанки карты `width × height`, где перечисленные тайлы заданы, а остальные пусты.
 * Ключ `tiles` — индекс тайла (`y * width + x`), как нумерует их игра.
 */
export function mapChunks(
  width: number,
  height: number,
  tiles: Record<number, TileFields>,
  layout: MapLayout = 'wmap',
): Map<string, Chunk> {
  const size = width * height;
  const at = (tile: number): TileFields => tiles[tile] ?? {};
  const chunks = new Map<string, Chunk>();

  if (layout === 'wmap') {
    const data = new Uint8Array(size * 12);
    for (let tile = 0; tile < size; tile++) {
      const f = at(tile);
      const t = tile * 8;
      data[t] = f.type ?? 0;
      data[t + 1] = f.height ?? 0;
      data[t + 2] = (f.m2 ?? 0) & 0xff;
      data[t + 3] = ((f.m2 ?? 0) >> 8) & 0xff;
      data[t + 4] = f.m1 ?? 0;
      data[t + 5] = f.m3 ?? 0;
      data[t + 6] = f.m4 ?? 0;
      data[t + 7] = f.m5 ?? 0;
      const e = size * 8 + tile * 4;
      data[e] = f.m6 ?? 0;
      data[e + 1] = f.m7 ?? 0;
      data[e + 2] = (f.m8 ?? 0) & 0xff;
      data[e + 3] = ((f.m8 ?? 0) >> 8) & 0xff;
    }
    chunks.set('WMAP', riff('WMAP', data));
    return chunks;
  }

  const byte = (id: string, read: (f: TileFields) => number) => {
    const data = new Uint8Array(size);
    for (let tile = 0; tile < size; tile++) data[tile] = read(at(tile));
    chunks.set(id, riff(id, data));
  };
  const word = (id: string, read: (f: TileFields) => number) => {
    const data = new Uint8Array(size * 2);
    for (let tile = 0; tile < size; tile++) {
      const value = read(at(tile));
      data[tile * 2] = value & 0xff;
      data[tile * 2 + 1] = (value >> 8) & 0xff;
    }
    chunks.set(id, riff(id, data));
  };
  byte('MAPT', (f) => f.type ?? 0);
  byte('MAPH', (f) => f.height ?? 0);
  byte('MAPO', (f) => f.m1 ?? 0);
  word('MAP2', (f) => f.m2 ?? 0);
  byte('M3LO', (f) => f.m3 ?? 0);
  byte('M3HI', (f) => f.m4 ?? 0);
  byte('MAP5', (f) => f.m5 ?? 0);
  byte('MAPE', (f) => f.m6 ?? 0);
  byte('MAP7', (f) => f.m7 ?? 0);
  word('MAP8', (f) => f.m8 ?? 0);
  return chunks;
}
