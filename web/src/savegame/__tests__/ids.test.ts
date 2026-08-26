import { describe, expect, it } from 'vitest';
import { readChunks, readTableHeader } from '../chunks';
import { chunk, savegame, Writer, CH_TABLE, U8, U16, U32, STRUCT } from './chunk-builder';
import { ByteReader } from '../reader';
import { readRecord, type RecordValues } from '../values';
import { readEngineIds, readIndustryTypeIds } from '../extract/ids';
import { parseSavegame } from '../parse';
import { fixture } from './fixture';

const IRON_HORSE = 0x23124143;
const FIRS = 0x100025f1;

describe('маппинги id из сейва', () => {
  it('синтетический EIDS разбирается в пары GRF + внутренний id', () => {
    // 30080 — base_numeric_id первой машины Iron Horse
    const bytes = savegame(300, chunk('EIDS', CH_TABLE, [
      [U32, 'grfid'],
      [U16, 'internal_id'],
      [U8, 'type'],
      [U8, 'substitute_id'],
    ], [(w) => { w.u32(0x23124143); w.u16(30080); w.u8(0); w.u8(0); }]));
    const chunks = readChunks(bytes.subarray(8), ['EIDS']);
    const ids = readEngineIds(chunks.get('EIDS'));
    expect(ids.get(0)).toEqual({ grfid: IRON_HORSE, localId: 30080 });
  });

  it('вложенная структура читается по заголовку с детьми', () => {
    // один u8-поле и список структур с полем u16 внутри
    const header = new Writer();
    header.u8(U8).str('n').u8(STRUCT).str('goods').u8(0);
    // заголовок детей идёт следом за родительским списком
    header.u8(U16).str('rating').u8(0);
    const fields = readTableHeader(new ByteReader(new Uint8Array(header.bytes)));
    expect(fields[1].children?.[0].name).toBe('rating');
    // record: n=7, goods=[{rating=513}, {rating=2}]
    const record = new Uint8Array([7, 2, 2, 1, 0, 2]);
    const values = readRecord(record, fields);
    expect(values.get('n')).toBe(7);
    const goods = values.get('goods') as RecordValues[];
    expect(goods).toHaveLength(2);
    expect(goods[0].get('rating')).toBe(513);
    expect(goods[1].get('rating')).toBe(2);
  });

  it('реальный сейв: пул движков указывает на Iron Horse, типы индустрий — на FIRS', async () => {
    const { chunks } = await parseSavegame(fixture('londworth-1975'));
    const engines = readEngineIds(chunks.get('EIDS'));
    expect(engines.size).toBeGreaterThan(0);
    const ironHorse = [...engines.values()].filter((e) => e.grfid === IRON_HORSE);
    expect(ironHorse.length).toBeGreaterThan(0);

    const industries = readIndustryTypeIds(chunks.get('IIDS'));
    const firs = [...industries.values()].filter((e) => e.grfid === FIRS);
    expect(firs.length).toBeGreaterThan(0);
  });
});
