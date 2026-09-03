/**
 * Чтение карты: два формата — один набор читалок, и отказ вместо мусора там, где раскладка
 * незнакома.
 */
import { describe, expect, it } from 'vitest';
import { CH_RIFF, type Chunk } from '../chunks';
import { readTiles, type TileMap } from '../extract/tiles';
import { mapChunks, type TileFields } from './tileMap';

const SIZE = { width: 4, height: 4 };

/** Тайлы с разными значениями во всех полях — чтобы перепутанные поля были видны. */
const TILES: Record<number, TileFields> = {
  0: { type: 0x91, height: 3, m1: 0x05, m2: 0x1234, m3: 0x47, m4: 0x0b, m5: 0xc3, m6: 0x39, m7: 0x11, m8: 0x0a41 },
  5: { type: 0x20, height: 9, m1: 0x1f, m2: 0xffff, m3: 0xf0, m4: 0x3f, m5: 0x0c, m6: 0x01, m7: 0x1e, m8: 0xffff },
  15: { type: 0x50, height: 0, m1: 0x00, m2: 0x0001, m3: 0x00, m4: 0x00, m5: 0x80, m6: 0x08, m7: 0x00, m8: 0x0040 },
};

const FIELDS = ['type', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'] as const;

const dump = (tiles: TileMap) =>
  Array.from({ length: tiles.size }, (_, tile) => ({
    z: tiles.z(tile),
    ...Object.fromEntries(FIELDS.map((field) => [field, tiles[field](tile)])),
  }));

const riff = (id: string, length: number): Chunk => ({
  id,
  type: CH_RIFF,
  records: [{ index: 0, data: new Uint8Array(length) }],
  recordCount: 1,
});

describe('карта читается одинаково в обоих форматах', () => {
  it('чанк патчпака и чанки ванили дают одни и те же значения', () => {
    const patchpack = readTiles(mapChunks(4, 4, TILES, 'wmap'), SIZE);
    const upstream = readTiles(mapChunks(4, 4, TILES, 'fields'), SIZE);
    expect(patchpack).toBeDefined();
    expect(upstream).toBeDefined();
    expect(dump(patchpack!)).toEqual(dump(upstream!));
  });

  it('поля тайла не перепутаны местами', () => {
    const tiles = readTiles(mapChunks(4, 4, TILES, 'wmap'), SIZE)!;
    expect(FIELDS.map((field) => tiles[field](0))).toEqual([
      0x91, 0x05, 0x1234, 0x47, 0x0b, 0xc3, 0x39, 0x11, 0x0a41,
    ]);
  });

  it('высота — это самый низкий угол тайла, а не его северный', () => {
    // ровное плато на четырёх, в котором продавлена одна клетка — (1,1)
    const flat: Record<number, { height: number }> = {};
    for (let tile = 0; tile < 9; tile++) flat[tile] = { height: 4 };
    flat[4] = { height: 1 };
    const tiles = readTiles(mapChunks(3, 3, flat), { width: 3, height: 3 })!;
    // (0,0) граничит с продавленной клеткой своим южным углом, (2,0) — нет
    expect(tiles.z(0)).toBe(1);
    expect(tiles.z(2)).toBe(4);
  });
});

describe('карта, которую не разобрать', () => {
  it('без размера карты читать нечего', () => {
    expect(readTiles(mapChunks(4, 4, TILES), undefined)).toBeUndefined();
  });

  it('без чанков карты — отказ, а не пустая карта', () => {
    expect(readTiles(new Map(), SIZE)).toBeUndefined();
  });

  it('WMAP первой версии — по два байта на расширение и без m8 — не читается', () => {
    // 16 тайлов по 8 байт плюс по 2 байта расширения: типа путей в такой карте нет вовсе
    const chunks = new Map([['WMAP', riff('WMAP', 16 * 10)]]);
    expect(readTiles(chunks, SIZE)).toBeUndefined();
  });

  it('длина чанка, не сходящаяся с размером из MAPS, — отказ', () => {
    const chunks = mapChunks(4, 4, TILES);
    expect(readTiles(chunks, { width: 8, height: 8 })).toBeUndefined();
  });

  it('нехватка одного ванильного чанка роняет всю ветку, а не отдаёт нули', () => {
    const chunks = mapChunks(4, 4, TILES, 'fields');
    chunks.delete('MAP8');
    expect(readTiles(chunks, SIZE)).toBeUndefined();
  });
});
