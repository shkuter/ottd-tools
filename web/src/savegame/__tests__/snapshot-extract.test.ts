import { describe, expect, it } from 'vitest';
import { readChunks } from '../chunks';
import { chunk, savegame, CH_TABLE, U8, U16 } from './chunk-builder';
import { parseSavegame } from '../parse';
import { isRearDualheaded, readTrains, TS_FRONT } from '../extract/vehs';
import { readOrderLists, isFullLoad, isStationOrder } from '../extract/ordl';
import { readStations, type SavedStation } from '../extract/stnn';
import { readPacketCounts, sumPackets } from '../extract/capa';
import { readIndustries } from '../extract/indy';
import { readTowns, TOWNNAME_ENGLISH_ORIGINAL } from '../extract/city';
import { readGroups } from '../extract/grps';
import { readCompanies } from '../extract/plyr';
import { fixture } from './fixture';

async function chunksOf1975() {
  const { chunks } = await parseSavegame(fixture('londworth-1975'));
  return chunks;
}

describe('сеть партии Londworth 1975', () => {
  it('поезда собираются в 92 состава без разрывов цепей', async () => {
    const chunks = await chunksOf1975();
    const units = readTrains(chunks.get('VEHS'));
    expect(units.size).toBe(1041);
    const fronts = [...units.values()].filter((u) => u.subtype & TS_FRONT);
    expect(fronts).toHaveLength(92);
    for (const front of fronts) {
      let at = front.next;
      let length = 1;
      while (at !== null) {
        const unit = units.get(at);
        expect(unit, `звено ${at} поезда ${front.index}`).toBeDefined();
        at = unit!.next;
        length++;
        expect(length).toBeLessThan(300);
      }
    }
  });

  it('прибыль поезда читается в деньгах игры, без дробных бит', async () => {
    const chunks = await chunksOf1975();
    const units = readTrains(chunks.get('VEHS'));
    const withProfit = [...units.values()].filter(
      (u) => u.subtype & TS_FRONT && u.profitLastYear > 0,
    );
    expect(withProfit.length).toBeGreaterThan(0);
    // сырое значение 24169127 из пула — это 94410 фунтов после сдвига
    expect(withProfit.map((u) => u.profitLastYear)).toContain(94410);
  });

  it('приказы лежат внутри ORDL и знают full load и станции', async () => {
    const chunks = await chunksOf1975();
    const lists = readOrderLists(chunks.get('ORDL'), chunks.get('ORDR'));
    expect(lists.size).toBe(144);
    const orders = [...lists.values()].flat();
    expect(orders.some(isStationOrder)).toBe(true);
    expect(orders.some(isFullLoad)).toBe(true);
    // каждый поезд со списком приказов ссылается на существующий список
    const units = readTrains(chunks.get('VEHS'));
    for (const unit of units.values()) {
      if (unit.subtype & TS_FRONT && unit.ordersRef !== null) {
        expect(lists.has(unit.ordersRef), `список ${unit.ordersRef}`).toBe(true);
      }
    }
  });

  it('станции читают город, имя-строку и ожидающий груз через CAPA', async () => {
    const chunks = await chunksOf1975();
    const stations = readStations(chunks.get('STNN'));
    expect(stations.size).toBe(100);
    const counts = readPacketCounts(chunks.get('CAPA'));
    expect(counts.size).toBeGreaterThan(1000);
    const proper = [...stations.values()].filter(
      (s): s is SavedStation => s.kind === 'station',
    );
    expect(proper.length).toBeGreaterThan(0);
    const waiting = proper
      .flatMap((s) => s.goods)
      .reduce((sum, g) => sum + sumPackets(counts, g.packetRefs), 0);
    expect(waiting).toBeGreaterThan(0);
    for (const s of proper) expect(s.town).toBeLessThan(18);
  });

  it('индустрии знают тип, город и производство', async () => {
    const chunks = await chunksOf1975();
    const industries = readIndustries(chunks.get('INDY'));
    expect(industries.size).toBe(204);
    const producing = [...industries.values()].filter((i) => i.produced.length > 0);
    expect(producing.length).toBeGreaterThan(0);
    const withHistory = producing.flatMap((i) => i.produced).filter(
      (p) => p.lastMonthProduction !== undefined && p.lastMonthProduction > 0,
    );
    expect(withHistory.length).toBeGreaterThan(0);
  });

  it('города — сиды English Original, группы и компания на месте', async () => {
    const chunks = await chunksOf1975();
    const towns = readTowns(chunks.get('CITY'));
    expect(towns.size).toBe(18);
    for (const town of towns.values()) {
      expect(town.nameType).toBe(TOWNNAME_ENGLISH_ORIGINAL);
      expect(town.grfid).toBe(0);
    }
    const groups = readGroups(chunks.get('GRPS'));
    expect([...groups.values()].map((g) => g.name)).toContain('Port Plennpool');
    const companies = readCompanies(chunks.get('PLYR'));
    expect(companies.size).toBe(1);
    expect(companies.get(0)?.isAi).toBe(false);
  });
});

describe('приказы старого формата (пул ORDR)', () => {
  it('список собирается по ссылке first через next', () => {
    const bytes = savegame(300, [
      // один список, first = 0+1
      ...chunk('ORDL', CH_TABLE, [[U16, 'first']], [(w) => w.u16(1)]),
      // пул: приказ 0 → станция 5 (full load), next → приказ 1 → станция 9
      ...chunk(
        'ORDR',
        CH_TABLE,
        [[U8, 'type'], [U16, 'flags'], [U16, 'dest'], [U16, 'next']],
        [
          (w) => { w.u8(1); w.u16(0x20); w.u16(5); w.u16(2); },
          (w) => { w.u8(1); w.u16(0); w.u16(9); w.u16(0); },
        ],
      ),
    ]);
    const chunks = readChunks(bytes.subarray(8), ['ORDL', 'ORDR']);
    const lists = readOrderLists(chunks.get('ORDL'), chunks.get('ORDR'));
    expect(lists.size).toBe(1);
    const orders = lists.get(0)!;
    expect(orders.map((o) => o.dest)).toEqual([5, 9]);
    expect(isFullLoad(orders[0])).toBe(true);
    expect(isFullLoad(orders[1])).toBe(false);
    expect(orders.every(isStationOrder)).toBe(true);
  });
});

describe('флаги приказа', () => {
  const order = (load: number) => ({ type: 1, flags: load << 4, dest: 0 });

  it('ждать полной загрузки — только типы FullLoad и FullLoadAny', () => {
    // OrderLoadType — значение, а не битовая маска (order_type.h:77):
    // 0 LoadIfPossible, 2 FullLoad, 3 FullLoadAny, 4 NoLoad, 6 CargoTypeLoad (JGRPP)
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((load) => isFullLoad(order(load)))).toEqual([
      false, false, true, true, false, false, false, false,
    ]);
  });

  it('прочие биты флагов на загрузку не влияют', () => {
    // non-stop и unload живут в других битах того же байта
    expect(isFullLoad({ type: 1, flags: (2 << 4) | 0x0f, dest: 0 })).toBe(true);
    expect(isFullLoad({ type: 1, flags: (4 << 4) | 0x0f, dest: 0 })).toBe(false);
  });
});

describe('половины сдвоенного локомотива', () => {
  it('задняя половина — multiheaded без бита engine', () => {
    const FRONT = 1, ENGINE = 1 << 3, MULTI = 1 << 5;
    expect(isRearDualheaded(MULTI)).toBe(true);
    expect(isRearDualheaded(MULTI | ENGINE)).toBe(false);
    expect(isRearDualheaded(FRONT | ENGINE | MULTI)).toBe(false);
    expect(isRearDualheaded(1 << 2)).toBe(false); // обычный вагон
  });
});
