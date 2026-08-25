/**
 * Snapshot integration on a synthetic vanilla save: uncompressed container, upstream
 * chunk shapes — the old ORDR order pool, no EIDS (the engine pool is the base set in
 * table order), climate slot table for cargo labels. The JGRPP shape is covered by the
 * real Londworth fixtures next door.
 */
import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../snapshot';
import { readSavegame } from '../read';
import { stationDisplayName } from '../names';
import { townName } from '../display';
import { useLocaleStore } from '../../state/localeStore';
import { fixture } from './chunks.test';
import {
  chunk,
  savegame,
  CH_SPARSE_TABLE,
  CH_TABLE,
  I32,
  STR,
  STRUCT,
  U8,
  U16,
  U32,
  U32_LIST as U32L,
  I64,
  type Header,
  type Writer as Builder,
} from './chunk-builder';

const COMMON: Header = [
  [U8, 'subtype'], [U32, 'next'], [U16, 'engine_type'], [U8, 'owner'],
  [U16, 'unitnumber'], [U8, 'cargo_type'], [U16, 'cargo_cap'], [U32L, 'cargo.packets'],
  [I64, 'profit_this_year'], [I64, 'profit_last_year'], [I32, 'build_year'],
  [U32, 'orders'], [U16, 'group_id'], [U8, 'vehstatus'],
  [U8, 'current_order.type'], [U32, 'current_order.dest'], [STR, 'name'],
];

interface Unit {
  subtype: number;
  next: number;
  engine: number;
  cargoType: number;
  cap: number;
  orders: number;
  owner?: number;
  unit?: number;
  vehStatus?: number;
}

function trainUnit(b: Builder, index: number, u: Unit): void {
  b.gamma(index);
  b.u8(0); // vehicle type: train
  b.gamma(1); // train struct present
  b.gamma(1); // common struct present
  b.u8(u.subtype); b.u32(u.next); b.u16(u.engine); b.u8(u.owner ?? 0);
  b.u16(u.unit ?? 1); b.u8(u.cargoType); b.u16(u.cap); b.gamma(0);
  b.i64(256 * 100); b.i64(256 * 200); b.u32(1930);
  // по умолчанию Hidden|DefaultPalette — статус поезда в туннеле, но не остановленного
  b.u32(u.orders); b.u16(0xfffe); b.u8(u.vehStatus ?? 0b1001);
  b.u8(0); b.u32(0); b.str('');
}

/** Subtype bits (vehicle_base.h:83): front, articulated, wagon, engine, free wagon, multiheaded. */
const FRONT = 1, WAGON = 1 << 2, ENGINE = 1 << 3, MULTIHEADED = 1 << 5;

function vanillaSave(): Uint8Array {
  const stationBase: Header = [
    [U32, 'xy'], [U32, 'town'], [U16, 'string_id'], [STR, 'name'], [U8, 'facilities'],
  ];
  const body = [
    ...chunk('PATS', CH_TABLE, [[U8, 'game_creation.landscape']], [(b) => b.u8(0)]),
    // поезд 0 компании 0: голова (engine 0) + задняя половина сдвоенного + вагон;
    // поезд 3 компании 1 без приказов — проверяет владельца и «вне маршрутов»
    ...chunk('VEHS', CH_SPARSE_TABLE, [[U8, 'type'], [STRUCT, 'train', [[STRUCT, 'common', COMMON]] as Header]], [
      (b) => trainUnit(b, 0, { subtype: FRONT | ENGINE | MULTIHEADED, next: 2, engine: 0, cargoType: 0xff, cap: 0, orders: 1 }),
      // задняя половина сдвоенного: multiheaded без бита engine — не отдельная машина
      (b) => trainUnit(b, 1, { subtype: MULTIHEADED, next: 3, engine: 0, cargoType: 0xff, cap: 0, orders: 0 }),
      (b) => trainUnit(b, 2, { subtype: WAGON, next: 0, engine: 27, cargoType: 1, cap: 30, orders: 0 }),
      (b) => trainUnit(b, 3, { subtype: FRONT | ENGINE, next: 0, engine: 0, cargoType: 0xff, cap: 0, orders: 0, owner: 1, unit: 7, vehStatus: 0b1010 }),
    ]),
    ...chunk('ORDL', CH_TABLE, [[U32, 'first']], [(b) => b.u32(1)]),
    // приказы: full load (тип загрузки 2 → flags 0x20) и «не загружать» (тип 4 → 0x40)
    ...chunk('ORDR', CH_TABLE, [[U8, 'type'], [U16, 'flags'], [U16, 'dest'], [U32, 'next']], [
      (b) => { b.u8(1); b.u16(0x20); b.u16(0); b.u32(2); },
      (b) => { b.u8(1); b.u16(0x40); b.u16(1); b.u32(0); },
    ]),
    // станция 0: груз слота 1 с рейтингом (бит Rating), груз слота 0 без него —
    // у второго игра рейтинга не показывает, хотя в файле лежит 175
    ...chunk('STNN', CH_SPARSE_TABLE, [[U8, 'facilities'], [STRUCT, 'normal', [[STRUCT, 'base', stationBase], [U8, 'indtype'], [STRUCT, 'goods', [[U8, 'status'], [U8, 'rating']]]]], [STRUCT, 'waypoint', [[STRUCT, 'base', stationBase], [U32, 'town_cn']]]], [
      (b) => { b.gamma(0); b.u8(8); b.gamma(1); b.gamma(1); b.u32(100); b.u32(1); b.u16(0x6010); b.str('Plenpool Порт'); b.u8(8); b.u8(0xff); b.gamma(2); b.u8(0); b.u8(175); b.u8(2); b.u8(200); b.gamma(0); },
      (b) => { b.gamma(1); b.u8(8); b.gamma(1); b.gamma(1); b.u32(200); b.u32(1); b.u16(0x6027); b.str(''); b.u8(8); b.u8(0xff); b.gamma(0); b.gamma(0); },
      // вейпоинт, второй в своём городе: у игры для него свой формат имени, с номером
      (b) => { b.gamma(2); b.u8(8); b.gamma(0); b.gamma(1); b.gamma(1); b.u32(300); b.u32(1); b.u16(0x6018); b.str(''); b.u8(8); b.u32(1); },
    ]),
    // EIDS чистой ванили: базовый набор помечен INVALID_GRFID, а не нулём; индекс записи —
    // это EngineID, на который ссылается машина, а internal_id — номер в таблице игры
    ...chunk('EIDS', CH_SPARSE_TABLE, [[U32, 'grfid'], [U16, 'internal_id'], [U8, 'type'], [U8, 'substitute_id']], [
      (b) => { b.gamma(0); b.u32(0xffffffff); b.u16(0); b.u8(0); b.u8(0); },
      (b) => { b.gamma(27); b.u32(0xffffffff); b.u16(27); b.u8(0); b.u8(0); },
    ]),
    // INDY до версии 315: плоские массивы вместо структуры produced
    ...chunk('INDY', CH_SPARSE_TABLE, [
      [U32, 'location.tile'], [U32, 'town'], [U8, 'type'],
      [U8 | 0x10, 'produced_cargo'], [U16 | 0x10, 'last_month_production'],
      [U16 | 0x10, 'last_month_transported'],
    ], [
      (b) => {
        b.gamma(0); b.u32(500); b.u32(1); b.u8(0);
        b.gamma(2); b.u8(1); b.u8(0xff);
        b.gamma(2); b.u16(140); b.u16(0);
        b.gamma(2); b.u16(70); b.u16(0);
      },
    ]),
    ...chunk('CITY', CH_SPARSE_TABLE, [[U32, 'xy'], [U32, 'townnamegrfid'], [U16, 'townnametype'], [U32, 'townnameparts'], [STR, 'name']], [
      (b) => { b.gamma(0); b.u32(50); b.u32(0); b.u16(0x20c0); b.u32(0xffffffff); b.str('Плённпуль'); },
      // французский генератор — калькулятор его не портировал
      (b) => { b.gamma(1); b.u32(60); b.u32(0); b.u16(0x20c3); b.u32(12345); b.str(''); },
    ]),
    ...chunk('PLYR', CH_SPARSE_TABLE, [[STR, 'name'], [U8, 'is_ai'], [I32, 'inaugurated_year']], [
      (b) => { b.gamma(0); b.str(''); b.u8(0); b.u32(1930); },
      (b) => { b.gamma(1); b.str('Rival Ltd'); b.u8(1); b.u32(1935); },
    ]),
  ];
  return savegame(300, body);
}

describe('синтетический ванильный сейв', () => {
  it('снапшот: поезд из каталога ванили, маршрут из пула ORDR, имена станций', async () => {
    const raw = await readSavegame(vanillaSave());
    expect(raw.jgrpp).toBe(false);
    const snapshot = buildSnapshot(raw);

    const train = snapshot.trains.find((t) => t.id === 0)!;
    // задняя половина сдвоенного локомотива — часть той же машины, а не второй вагон
    expect(train.consist.map((e) => [e.catalogueId, e.count])).toEqual([
      ['vanilla_0', 1],
      ['vanilla_27', 1],
    ]);
    // слот 1 умеренного климата — уголь
    expect(train.cargo).toEqual([{ label: 'COAL', slot: 1, capacity: 30, loaded: 0 }]);
    expect(train.profitLastYear).toBe(200);

    expect(snapshot.routes).toHaveLength(1);
    const route = snapshot.routes[0];
    expect(route.trainIds).toEqual([0]);
    // приказ «не загружать» (тип загрузки 4) — это НЕ ожидание полной загрузки
    expect(route.stops.map((s) => [s.kind, s.stationId, s.fullLoad])).toEqual([
      ['station', 0, true],
      ['station', 1, false],
    ]);

    expect(snapshot.stations.map((s) => s.suffixKey)).toEqual([
      'STR_SV_STNAME_WOODS',
      'STR_SV_STNAME_FALLBACK',
      'STR_FORMAT_WAYPOINT_NAME_SERIAL',
    ]);
    // город переименован игроком — генератор к нему не применяется
    expect(snapshot.towns[0].name).toBe('Плённпуль');
  });

  it('поезд другой компании попадает в снапшот и остаётся вне маршрутов', async () => {
    const snapshot = buildSnapshot(await readSavegame(vanillaSave()));
    expect(snapshot.trains.map((t) => [t.id, t.companyId, t.routeId])).toEqual([
      [0, 0, 0],
      [3, 1, null],
    ]);
    // маршрут собран только у поезда с приказами
    expect(snapshot.routes.flatMap((r) => r.trainIds)).toEqual([0]);
  });

  it('снапшот держит все компании партии, включая ИИ', async () => {
    const snapshot = buildSnapshot(await readSavegame(vanillaSave()));
    expect(snapshot.companies).toEqual([
      { id: 0, name: '', isAi: false },
      { id: 1, name: 'Rival Ltd', isAi: true },
    ]);
  });

  it('рейтинг показывается только там, где он есть у самой игры', async () => {
    const snapshot = buildSnapshot(await readSavegame(vanillaSave()));
    // в файле у обоих грузов записан рейтинг, но бит Rating стоит только у второго
    expect(snapshot.stations[0].goods).toEqual([
      { label: 'COAL', slot: 1, rating: 200, waiting: 0 },
    ]);
  });

  it('переименованные вручную город и станция приходят строкой как есть', async () => {
    const snapshot = buildSnapshot(await readSavegame(vanillaSave()));
    expect(snapshot.towns[0].name).toBe('Плённпуль');
    const renamed = snapshot.stations[0];
    expect(renamed.customName).toBe('Plenpool Порт');
    // имя игрока не собирается из города и суффикса и не переводится
    expect(stationDisplayName(renamed, 'Londworth', 'en')).toBe('Plenpool Порт');
    expect(stationDisplayName(renamed, 'Londworth', 'ru')).toBe('Plenpool Порт');
  });

  it('машины базового набора опознаются, хотя EIDS помечает их INVALID_GRFID', async () => {
    const snapshot = buildSnapshot(await readSavegame(vanillaSave()));
    // в чистом ванильном сейве EIDS состоит из записей базового набора: если считать
    // «базовым» только grfid 0, каждая машина осталась бы неопознанной
    expect(snapshot.trains[0].consist.map((e) => e.catalogueId)).toEqual([
      'vanilla_0',
      'vanilla_27',
    ]);
  });

  it('машина, которой нет в EIDS, остаётся неопознанной, а не берётся по индексу пула', async () => {
    const raw = await readSavegame(vanillaSave());
    const network = { ...raw.network, engineIds: new Map(raw.network.engineIds) };
    network.engineIds.delete(27);
    const snapshot = buildSnapshot({ ...raw, network });
    const consist = snapshot.trains[0].consist;
    expect(consist.map((e) => e.catalogueId)).toEqual(['vanilla_0', null]);
    // машина не потеряна: число единиц в составе прежнее
    expect(consist.reduce((n, e) => n + e.count, 0)).toBe(2);
  });

  it('остановленным считается поезд с битом Stopped, а не Hidden', async () => {
    const snapshot = buildSnapshot(await readSavegame(vanillaSave()));
    // поезд 0 записан со статусом Hidden|DefaultPalette (в туннеле), поезд 3 — Stopped
    expect(snapshot.trains.map((t) => [t.id, t.stopped])).toEqual([
      [0, false],
      [3, true],
    ]);
  });

  it('производство читается и из плоских массивов старого формата', async () => {
    const snapshot = buildSnapshot(await readSavegame(vanillaSave()));
    // до версии 315 у INDY нет структуры produced: цифры лежат параллельными массивами
    expect(snapshot.industries).toHaveLength(1);
    expect(snapshot.industries[0].produced).toEqual([
      { label: 'COAL', slot: 1, lastMonthProduction: 140, lastMonthTransported: 70 },
    ]);
  });

  it('вейпоинт называется своим форматом, с номером внутри города', async () => {
    const snapshot = buildSnapshot(await readSavegame(vanillaSave()));
    const waypoint = snapshot.stations.find((s) => s.isWaypoint)!;
    expect(waypoint.suffixKey).toBe('STR_FORMAT_WAYPOINT_NAME_SERIAL');
    expect(stationDisplayName(waypoint, 'Londworth', 'en')).toBe('Londworth Waypoint #2');
    expect(stationDisplayName(waypoint, 'Londworth', 'ru')).toBe('Маршрутная точка Londworth №2');
  });

  it('город чужого стиля имён получает заглушку с номером', async () => {
    const snapshot = buildSnapshot(await readSavegame(vanillaSave()));
    expect(snapshot.towns[1].name).toBeNull();
    useLocaleStore.getState().setLocale('ru');
    expect(townName(snapshot.towns[1])).toBe('Город №1');
    useLocaleStore.getState().setLocale('en');
    expect(townName(snapshot.towns[1])).toBe('Town #1');
  });

  it('станция без суффикса-имени называется как в игре, с её номером', async () => {
    const snapshot = buildSnapshot(await readSavegame(vanillaSave()));
    const fallback = snapshot.stations.find((s) => s.suffixKey === 'STR_SV_STNAME_FALLBACK')!;
    useLocaleStore.getState().setLocale('en');
    expect(stationDisplayName(fallback, 'Londworth', 'en')).toBe('Londworth Station #1');
    expect(stationDisplayName(fallback, 'Londworth', 'ru')).toBe('Londworth, станция №1');
  });

  it('пустая партия Londworth 1860: индустрии и города есть, поездов нет', async () => {
    const snapshot = buildSnapshot(await readSavegame(fixture('londworth-1860')));
    expect(snapshot.trains).toHaveLength(0);
    expect(snapshot.routes).toHaveLength(0);
    expect(snapshot.industries.length).toBe(43);
    expect(snapshot.towns).toHaveLength(18);
    expect(snapshot.towns.map((t) => t.name)).toContain('Londworth');
  });
});

describe('настоящая ванильная партия (vanilla-1951)', () => {
  async function snapshot() {
    return buildSnapshot(await readSavegame(fixture('vanilla-1951')));
  }

  it('парк из четырёх одинаковых составов, как в окне поездов игры', async () => {
    const snap = await snapshot();
    expect(snap.trains).toHaveLength(4);
    for (const train of snap.trains) {
      // Ginzu 'A4' и три угольные платформы: id каталога ванильных машин
      expect(train.consist).toEqual([
        { catalogueId: 'vanilla_9', count: 1 },
        { catalogueId: 'vanilla_29', count: 3 },
      ]);
      expect(train.cargo).toEqual([
        expect.objectContaining({ label: 'COAL', capacity: 90 }),
      ]);
    }
  });

  it('четыре поезда ходят по одному списку приказов', async () => {
    const snap = await snapshot();
    expect(snap.routes).toHaveLength(1);
    expect(snap.routes[0].trainIds).toEqual(snap.trains.map((t) => t.id).sort((a, b) => a - b));
    expect(snap.routes[0].stops.map((s) => s.kind)).toEqual(['station', 'station']);
  });

  it('имена городов и станций собираются как в игре', async () => {
    const snap = await snapshot();
    const towns = new Map(snap.towns.map((t) => [t.id, t.name ?? '']));
    const names = snap.stations.map((s) => stationDisplayName(s, towns.get(s.townId!) ?? '', 'en'));
    expect(names).toContain('Kenningstone-on-sea Mines');
    // тот же суффикс по-русски приходит из локали игры
    const mines = snap.stations.find((s) => s.suffixKey === 'STR_SV_STNAME_MINES')!;
    expect(stationDisplayName(mines, towns.get(mines.townId!) ?? '', 'ru')).toMatch(/^Шахты /);
    expect(snap.towns.every((t) => t.name !== null)).toBe(true);
  });

  it('станция угольной шахты знает рейтинг и ожидающий груз', async () => {
    const snap = await snapshot();
    const mines = snap.stations.find((s) => s.suffixKey === 'STR_SV_STNAME_MINES')!;
    expect(mines.goods).toEqual([
      expect.objectContaining({ label: 'COAL', rating: expect.any(Number) }),
    ]);
    expect(mines.goods[0].rating).toBeGreaterThan(0);
  });

  it('прибыль поездов приходит в деньгах игры', async () => {
    const snap = await snapshot();
    // партия сыграна год: прошлогодняя прибыль у всех положительная
    for (const train of snap.trains) expect(train.profitLastYear).toBeGreaterThan(0);
    expect(snap.companies).toEqual([{ id: 0, name: '', isAi: false }]);
  });

  it('ванильные индустрии читаются, но каталога для них в калькуляторе нет', async () => {
    const snap = await snapshot();
    expect(snap.industries.length).toBeGreaterThan(0);
    // данные калькулятора описывают только предприятия FIRS, поэтому тип не опознаётся,
    // а производство и грузы читаются
    expect(snap.industries.every((i) => i.catalogueId === null)).toBe(true);
    const coal = snap.industries.filter((i) => i.produced.some((p) => p.label === 'COAL'));
    expect(coal.length).toBeGreaterThan(0);
  });
});
