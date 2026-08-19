import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decompressSavegame } from '../decompress';
import { readChunks } from '../chunks';

/** Start of the Londworth game: real save, no vehicles yet. */
export function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(new URL(`./fixtures/${name}.sav`, import.meta.url)));
}

describe('обход чанков настоящего сейва', () => {
  it('сыгранная партия разбирается целиком, тяжёлые чанки пропускаются', async () => {
    const { header, data } = await decompressSavegame(fixture('londworth-1975'));
    expect(header).toMatchObject({ compression: 'xz', version: 292, jgrpp: true });

    const chunks = readChunks(data, ['PATS']);
    // счётчики записей — по этому же файлу, разобранному отдельным Python-парсером
    expect(chunks.get('VEHS')?.recordCount).toBe(1649);
    expect(chunks.get('ORDL')?.recordCount).toBe(144);
    expect(chunks.get('STNN')?.recordCount).toBe(100);
    expect(chunks.get('INDY')?.recordCount).toBe(204);
    expect(chunks.get('SUBS')?.recordCount).toBe(1);
    expect(chunks.get('CITY')?.recordCount).toBe(18);
    // записи собраны только у запрошенного чанка
    expect(chunks.get('PATS')?.records).toHaveLength(1);
    expect(chunks.get('VEHS')?.records).toHaveLength(0);
  });

  it('начало партии: те же чанки, но списки машин и приказов пустые', async () => {
    const { data } = await decompressSavegame(fixture('londworth-1860'));
    const chunks = readChunks(data, []);
    expect(chunks.get('VEHS')?.recordCount).toBe(0);
    expect(chunks.get('ORDL')?.recordCount).toBe(0);
    expect(chunks.get('SUBS')?.recordCount).toBe(0);
    expect(chunks.get('INDY')?.recordCount).toBe(43);
    expect(chunks.get('CITY')?.recordCount).toBe(18);
  });

  it('PATS описывает свои поля именами настроек игры', async () => {
    const { data } = await decompressSavegame(fixture('londworth-1860'));
    const pats = readChunks(data, ['PATS']).get('PATS')!;
    expect(pats.fields).toHaveLength(381);
    const names = pats.fields!.map((f) => f.name);
    expect(names).toContain('economy.day_length_factor');
    expect(names).toContain('difficulty.vehicle_costs');
    expect(names).toContain('vehicle.max_train_length');
  });
});
