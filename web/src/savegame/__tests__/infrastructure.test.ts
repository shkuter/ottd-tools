/**
 * Счётчики инфраструктуры: каждое правило игры своим сценарием, а сверх них — обе фикстуры
 * против окна инфраструктуры их партий (эталон — `openspec/.../research-counts.md`).
 *
 * Сценарии строятся на синтетической карте: правило, которого на фикстуре нет (шлюз, чужой
 * владелец дороги, пересечение путей), иначе не проверить, а расхождение итога на настоящей
 * партии не скажет, какое именно правило соврало.
 */
import { describe, expect, it } from 'vitest';
import {
  countInfrastructure,
  hasSignalSimulation,
  tileType,
  TT_TUNNELBRIDGE,
  type InfrastructureCounts,
} from '../extract/infrastructure';
import { ROAD_TRAM_TYPE_ROAD, ROAD_TRAM_TYPE_TRAM } from '../extract/labelmaps';
import { readTiles } from '../extract/tiles';
import { readMapSize } from '../extract/maps';
import { parseSavegame } from '../parse';
import { readSavegame } from '../read';
import { buildSnapshot } from '../snapshot';
import { fixture } from './fixture';
import { mapChunks, type MapLayout, type TileFields } from './tileMap';

/* Типы тайлов и разряды полей — те же, что читает счётчик (см. vendor/openttd-patches). */
const TT = { RAILWAY: 1, ROAD: 2, STATION: 5, WATER: 6, TUNNELBRIDGE: 9, OBJECT: 10 };
const TRACK = { X: 0b000001, Y: 0b000010, UPPER: 0b000100, LOWER: 0b001000, LEFT: 0b010000, RIGHT: 0b100000 };
const CANAL = 1 << 5;

const RAIL_LABELS = new Map([
  [0, 'RAIL'],
  [1, 'ELRL'],
  [2, 'NAAN'],
]);
const ROAD_LABELS = new Map([
  [0, { label: 'ROAD', subtype: ROAD_TRAM_TYPE_ROAD }],
  [1, { label: 'ELRL', subtype: ROAD_TRAM_TYPE_TRAM }],
]);

const WIDTH = 8;
const HEIGHT = 8;
const OWNER = 0;
const OTHER_OWNER = 1;

/** Считает синтетическую карту 8×8 и отдаёт счётчики компании 0. */
function count(
  tiles: Record<number, TileFields>,
  options: { jgrpp?: boolean; layout?: MapLayout } = {},
): InfrastructureCounts {
  const map = readTiles(mapChunks(WIDTH, HEIGHT, tiles, options.layout ?? 'wmap'), {
    width: WIDTH,
    height: HEIGHT,
  })!;
  const counts = countInfrastructure(map, RAIL_LABELS, ROAD_LABELS, {
    companies: [OWNER, OTHER_OWNER],
    jgrpp: options.jgrpp ?? true,
  });
  return counts.get(OWNER)!;
}

/* Строители тайлов: имена полей — как у игры, чтобы сценарий читался правилом. */

const railTile = (o: {
  owner?: number;
  railType?: number;
  bits?: number;
  kind?: number;
  signals?: number;
  secondary?: number;
}): TileFields => ({
  type: TT.RAILWAY << 4,
  m1: o.owner ?? OWNER,
  m3: (o.signals ?? 0) << 4,
  m5: ((o.kind ?? 0) << 6) | (o.bits ?? 0),
  m8: (o.railType ?? 0) | ((o.secondary ?? o.railType ?? 0) << 6),
});

const roadTile = (o: {
  owner?: number;
  roadOwner?: number;
  tramOwner?: number;
  roadType?: number;
  tramType?: number;
  bits?: number;
  tramBits?: number;
  kind?: number;
  railType?: number;
}): TileFields => ({
  type: TT.ROAD << 4,
  m1: o.owner ?? OWNER,
  m3: (o.tramBits ?? 0) | ((o.tramOwner ?? 15) << 4),
  m4: o.roadType ?? 63,
  m5: ((o.kind ?? 0) << 6) | (o.bits ?? 0),
  m7: o.roadOwner ?? OWNER,
  m8: (o.railType ?? 0) | ((o.tramType ?? 63) << 6),
});

const stationTile = (o: {
  owner?: number;
  station: number;
  railType?: number;
  roadType?: number;
  tramType?: number;
  roadOwner?: number;
  tramOwner?: number;
  blocked?: boolean;
  canal?: boolean;
}): TileFields => ({
  type: TT.STATION << 4,
  m1: (o.owner ?? OWNER) | (o.canal ? CANAL : 0),
  m3: (o.tramOwner ?? 15) << 4,
  m4: o.roadType ?? 63,
  m6: (o.station << 3) | (o.blocked ? 1 : 0),
  m7: o.roadOwner ?? OWNER,
  m8: (o.railType ?? 0) | ((o.tramType ?? 63) << 6),
});

const waterTile = (o: {
  owner?: number;
  water: number;
  lockPart?: number;
  canal?: boolean;
}): TileFields => ({
  type: TT.WATER << 4,
  m1: (o.owner ?? OWNER) | (o.canal ? CANAL : 0),
  m5: (o.water << 4) | ((o.lockPart ?? 0) << 2),
});

/**
 * Торец моста или тоннеля. `dir` — куда он смотрит: NE 0, SE 1, SW 2, NW 3; считается тот
 * торец, чей `dir` меньше SW.
 */
const endTile = (o: {
  bridge: boolean;
  dir: number;
  transport: number;
  owner?: number;
  railType?: number;
  secondary?: number;
  headBits?: number;
  roadType?: number;
  tramType?: number;
  roadOwner?: number;
  tramOwner?: number;
  headRoadBits?: number;
  signalSim?: number;
  spacing?: number;
}): TileFields => ({
  type: TT.TUNNELBRIDGE << 4,
  m1: o.owner ?? OWNER,
  m2: o.headRoadBits ?? 0,
  m3: (o.tramOwner ?? 15) << 4,
  m4: o.headBits ?? 0,
  m5: (o.bridge ? 0x80 : 0) | ((o.signalSim ?? 0) << 5) | (o.transport << 2) | o.dir,
  m7: o.roadOwner ?? OWNER,
  // разряды 6–11 у m8 — это второй тип путей на ж/д торце и тип трамвайных путей на
  // дорожном: одно поле, читаемое по роду того, что через мост идёт
  m8:
    (o.railType ?? 0) |
    ((o.tramType ?? o.secondary ?? o.railType ?? 0) << 6) |
    (((o.spacing ?? 1) - 1) << 12),
});

describe('обычный путь', () => {
  it('одиночный путь — один кусок своему типу', () => {
    expect(count({ 9: railTile({ bits: TRACK.X }) }).rail).toEqual({ RAIL: 1 });
  });

  it('две параллели считаются каждая своему типу', () => {
    // HORZ — верхний и нижний пути, которые не пересекаются: у каждого может быть свой тип
    const bits = TRACK.UPPER | TRACK.LOWER;
    expect(count({ 9: railTile({ bits, railType: 1, secondary: 2 }) }).rail).toEqual({
      ELRL: 1,
      NAAN: 1,
    });
  });

  it('у ванильной партии второго типа нет — оба куска идут своему', () => {
    const bits = TRACK.UPPER | TRACK.LOWER;
    const tile = railTile({ bits, railType: 1, secondary: 2 });
    expect(count({ 9: tile }, { jgrpp: false }).rail).toEqual({ ELRL: 2 });
  });

  it('пересечение считается квадратом', () => {
    expect(count({ 9: railTile({ bits: TRACK.X | TRACK.Y }) }).rail).toEqual({ RAIL: 4 });
    const three = TRACK.X | TRACK.UPPER | TRACK.RIGHT;
    expect(count({ 9: railTile({ bits: three }) }).rail).toEqual({ RAIL: 9 });
  });

  it('ж/д депо — один кусок пути своему типу', () => {
    expect(count({ 9: railTile({ kind: 3, railType: 1 }) }).rail).toEqual({ ELRL: 1 });
  });

  it('чужие пути этой компании не приписаны', () => {
    const tiles = {
      9: railTile({ bits: TRACK.X }),
      10: railTile({ bits: TRACK.X, owner: OTHER_OWNER }),
      11: railTile({ bits: TRACK.X, owner: 15 }),
    };
    expect(count(tiles).rail).toEqual({ RAIL: 1 });
  });
});

describe('сигналы', () => {
  it('считаются головами', () => {
    const two = railTile({ bits: TRACK.X, kind: 1, signals: 0b0011 });
    const four = railTile({ bits: TRACK.X | TRACK.Y, kind: 1, signals: 0b1111 });
    expect(count({ 9: two }).signals).toBe(2);
    expect(count({ 9: four }).signals).toBe(4);
  });

  it('на клетке без сигналов голов нет, что бы ни лежало в m3', () => {
    expect(count({ 9: railTile({ bits: TRACK.X, signals: 0b1111 }) }).signals).toBe(0);
  });
});

describe('станции', () => {
  it('клетка ж/д станции — станция и ещё кусок пути', () => {
    const counts = count({ 9: stationTile({ station: 0, railType: 1 }) });
    expect(counts.stations).toBe(1);
    expect(counts.rail).toEqual({ ELRL: 1 });
  });

  it('заблокированная клетка станции пути не даёт, а станцией остаётся', () => {
    const counts = count({ 9: stationTile({ station: 0, blocked: true }) });
    expect(counts.stations).toBe(1);
    expect(counts.rail).toEqual({});
  });

  it('вейпоинт считается как ж/д станция', () => {
    const counts = count({ 9: stationTile({ station: 7 }) });
    expect(counts.stations).toBe(1);
    expect(counts.rail).toEqual({ RAIL: 1 });
  });

  it('аэропорт и буй станционной клеткой не считаются', () => {
    expect(count({ 9: stationTile({ station: 1 }) }).stations).toBe(0);
    expect(count({ 9: stationTile({ station: 6 }) }).stations).toBe(0);
  });

  it('остановка даёт по два дорожных куска каждому роду дорог', () => {
    const counts = count({ 9: stationTile({ station: 3, roadType: 0, tramType: 1, tramOwner: OWNER }) });
    expect(counts.stations).toBe(1);
    expect(counts.road).toEqual({ ROAD: 2 });
    expect(counts.tram).toEqual({ ELRL: 2 });
  });

  it('док и буй на канале дают клетку воды', () => {
    expect(count({ 9: stationTile({ station: 5, canal: true }) }).canals).toBe(1);
    expect(count({ 9: stationTile({ station: 6, canal: true }) }).canals).toBe(1);
    // док на море каналом не считается
    expect(count({ 9: stationTile({ station: 5 }) }).canals).toBe(0);
  });
});

describe('дороги', () => {
  it('полотно считается битами дороги, депо и переезд — двумя кусками', () => {
    expect(count({ 9: roadTile({ roadType: 0, bits: 0b0011 }) }).road).toEqual({ ROAD: 2 });
    expect(count({ 9: roadTile({ roadType: 0, bits: 0b1111 }) }).road).toEqual({ ROAD: 4 });
    expect(count({ 9: roadTile({ roadType: 0, kind: 2 }) }).road).toEqual({ ROAD: 2 });
  });

  it('у полотна владелец дороги свой, а у депо — владелец тайла', () => {
    // полотно города рядом с депо компании: компании засчитано депо, полотно — нет
    const tiles = {
      9: roadTile({ roadType: 0, bits: 0b1111, owner: 16, roadOwner: 16 }),
      10: roadTile({ roadType: 0, kind: 2, owner: OWNER, roadOwner: 16 }),
    };
    expect(count(tiles).road).toEqual({ ROAD: 2 });
  });

  it('переезд — два куска пути своему типу плюс дороги', () => {
    const counts = count({
      9: roadTile({ roadType: 0, kind: 1, railType: 1, bits: 0b1010 }),
    });
    expect(counts.rail).toEqual({ ELRL: 2 });
    expect(counts.road).toEqual({ ROAD: 2 });
  });

  it('трамвайные пути идут своим счётом и своим владельцем', () => {
    const mine = roadTile({ tramType: 1, tramBits: 0b0011, tramOwner: OWNER });
    const theirs = roadTile({ tramType: 1, tramBits: 0b0011, tramOwner: OTHER_OWNER });
    expect(count({ 9: mine }).tram).toEqual({ ELRL: 2 });
    expect(count({ 9: theirs }).tram).toEqual({});
  });
});

describe('вода', () => {
  it('клетка канала — один кусок', () => {
    expect(count({ 9: waterTile({ water: 0, canal: true }) }).canals).toBe(1);
    expect(count({ 9: waterTile({ water: 0 }) }).canals).toBe(0);
  });

  it('судовое депо считается по своему множителю, и канал под ним — тоже', () => {
    expect(count({ 9: waterTile({ water: 3 }) }).canals).toBe(2);
    expect(count({ 9: waterTile({ water: 3, canal: true }) }).canals).toBe(3);
  });

  it('средняя клетка шлюза — трижды по множителю и не канал', () => {
    expect(count({ 9: waterTile({ water: 2, lockPart: 0, canal: true }) }).canals).toBe(6);
    // верхняя и нижняя клетки шлюза сами по себе только канал
    expect(count({ 9: waterTile({ water: 2, lockPart: 1, canal: true }) }).canals).toBe(1);
  });

  it('клетка объекта с водным классом канала — канал', () => {
    const object: TileFields = { type: TT.OBJECT << 4, m1: OWNER | CANAL };
    expect(count({ 9: object }).canals).toBe(1);
  });
});

/**
 * Мост длиной 2: западный торец на (5,2), восточный на (2,2). Считается только западный —
 * его `dir` равен NE.
 */
const bridge = (west: TileFields, east: TileFields): Record<number, TileFields> => ({
  [2 * WIDTH + 5]: west,
  [2 * WIDTH + 2]: east,
});

describe('мосты и тоннели', () => {
  it('мост считается один раз и вместе с обоими торцами', () => {
    const head = { bridge: true, transport: 0, headBits: TRACK.X };
    const counts = count(bridge(endTile({ ...head, dir: 0 }), endTile({ ...head, dir: 2 })));
    // середина 2 × 4, торцы по 4
    expect(counts.rail).toEqual({ RAIL: 16 });
  });

  it('со второго торца тот же мост не считается снова', () => {
    const head = { bridge: true, transport: 0, headBits: TRACK.X };
    // тот же мост, но оба торца смотрят «на запад» — считать было бы нечего
    const counts = count(bridge(endTile({ ...head, dir: 2 }), endTile({ ...head, dir: 0 })));
    expect(counts.rail).toEqual({});
  });

  it('тоннель считается по четыре за клетку, торцы включены', () => {
    const head = { bridge: false, transport: 0 };
    const counts = count(bridge(endTile({ ...head, dir: 0 }), endTile({ ...head, dir: 2 })));
    expect(counts.rail).toEqual({ RAIL: 16 });
  });

  it('второй тип путей на торце считается отдельно', () => {
    const bits = TRACK.UPPER | TRACK.LOWER;
    const head = { bridge: true, transport: 0, headBits: bits, railType: 0, secondary: 1 };
    const counts = count(bridge(endTile({ ...head, dir: 0 }), endTile({ ...head, dir: 2 })));
    // на каждом торце по одному пути через мост и по одному вдоль него
    expect(counts.rail).toEqual({ RAIL: 16, ELRL: 4 });
  });

  it('водный мост — середина и оба торца', () => {
    const head = { bridge: true, transport: 2 };
    const counts = count(bridge(endTile({ ...head, dir: 0 }), endTile({ ...head, dir: 2 })));
    expect(counts.canals).toBe(16);
  });

  it('дорожный мост считается каждым торцом по своему владельцу', () => {
    const head = { bridge: true, transport: 1, roadType: 0 };
    const counts = count(
      bridge(
        endTile({ ...head, dir: 0 }),
        endTile({ ...head, dir: 2, roadOwner: OTHER_OWNER }),
      ),
    );
    // свой торец: два бита × 4 плюс середина 8; чужой торец компании не приписан
    expect(counts.road).toEqual({ ROAD: 16 });
  });

  it('сигналы моста с симуляцией добавляются к счётчику сигналов', () => {
    const head = { bridge: true, transport: 0, headBits: TRACK.X, signalSim: 0b01, spacing: 2 };
    const counts = count(bridge(endTile({ ...head, dir: 0 }), endTile({ ...head, dir: 2 })));
    // два сигнала на торцах плюс один на каждые spacing клеток середины
    expect(counts.signals).toBe(3);
    const both = { ...head, signalSim: 0b11 };
    expect(count(bridge(endTile({ ...both, dir: 0 }), endTile({ ...both, dir: 2 }))).signals).toBe(6);
  });

  it('у ванильной партии симуляции сигналов нет вовсе', () => {
    const head = { bridge: true, transport: 0, headBits: TRACK.X, signalSim: 0b11, spacing: 2 };
    const tiles = bridge(endTile({ ...head, dir: 0 }), endTile({ ...head, dir: 2 }));
    expect(count(tiles, { jgrpp: false }).signals).toBe(0);
  });

  it('мост, второго торца которого нет, счётчиков не портит', () => {
    const head = endTile({ bridge: true, dir: 0, transport: 0, headBits: TRACK.X });
    expect(count({ [2 * WIDTH + 5]: head }).rail).toEqual({});
  });
});

describe('компании не смешиваются', () => {
  it('каждой засчитано только её собственное', () => {
    const map = readTiles(
      mapChunks(WIDTH, HEIGHT, {
        9: railTile({ bits: TRACK.X, owner: OWNER }),
        10: railTile({ bits: TRACK.X | TRACK.Y, owner: OTHER_OWNER }),
        11: stationTile({ station: 0, owner: OTHER_OWNER }),
      }),
      { width: WIDTH, height: HEIGHT },
    )!;
    const counts = countInfrastructure(map, RAIL_LABELS, ROAD_LABELS, {
      companies: [OWNER, OTHER_OWNER],
      jgrpp: true,
    });
    expect(counts.get(OWNER)).toMatchObject({ rail: { RAIL: 1 }, stations: 0 });
    expect(counts.get(OTHER_OWNER)).toMatchObject({ rail: { RAIL: 5 }, stations: 1 });
  });

  it('компания без единой клетки получает нули, а не отсутствие', () => {
    const map = readTiles(mapChunks(WIDTH, HEIGHT, {}), { width: WIDTH, height: HEIGHT })!;
    const counts = countInfrastructure(map, RAIL_LABELS, ROAD_LABELS, {
      companies: [OWNER],
      jgrpp: true,
    });
    expect(counts.get(OWNER)).toEqual({
      rail: {},
      signals: 0,
      stations: 0,
      road: {},
      tram: {},
      canals: 0,
    });
  });
});

describe('обе раскладки карты дают одни и те же счётчики', () => {
  it('чанк патчпака и чанки ванили считаются одинаково', () => {
    const tiles = {
      9: railTile({ bits: TRACK.X | TRACK.Y, kind: 1, signals: 0b0011 }),
      10: stationTile({ station: 0, railType: 1 }),
      11: roadTile({ roadType: 0, bits: 0b1111 }),
      12: waterTile({ water: 3, canal: true }),
    };
    expect(count(tiles, { layout: 'fields' })).toEqual(count(tiles, { layout: 'wmap' }));
  });
});

describe('сверка с окном инфраструктуры настоящих партий', () => {
  // research-counts.md: снято в самой игре 02.09.2026
  it('londworth-1975 совпадает до единицы', async () => {
    const raw = await readSavegame(fixture('londworth-1975'));
    expect(raw.network.infrastructure?.get(0)).toEqual({
      rail: { RAIL: 14564, ELRL: 853 },
      signals: 986,
      stations: 777,
      road: { ROAD: 159 },
      tram: { ELRL: 104 },
      canals: 0,
    });
  });

  it('vanilla-1951 совпадает до единицы', async () => {
    const raw = await readSavegame(fixture('vanilla-1951'));
    expect(raw.network.infrastructure?.get(0)).toEqual({
      rail: { RAIL: 528 },
      signals: 39,
      stations: 24,
      road: {},
      tram: {},
      canals: 0,
    });
  });

  it('londworth-1975 и правда содержит мосты с симуляцией сигналов', async () => {
    // без этого сверка сигналов выше проходила бы и с выключенным правилом, а расхождение
    // на другой партии списали бы не на то
    const parsed = await parseSavegame(fixture('londworth-1975'));
    const tiles = readTiles(parsed.chunks, readMapSize(parsed.chunks.get('MAPS')))!;
    let simulated = 0;
    for (let tile = 0; tile < tiles.size; tile++) {
      if (tileType(tiles, tile) !== TT_TUNNELBRIDGE) continue;
      if (hasSignalSimulation(tiles, tile)) simulated++;
    }
    expect(simulated).toBeGreaterThan(0);
  });
});

describe('снапшот несёт счётчики, а не карту', () => {
  it('у каждой компании известна её сеть', async () => {
    const snapshot = buildSnapshot(await readSavegame(fixture('londworth-1975')));
    expect(snapshot.companies[0].network).toMatchObject({ signals: 986, stations: 777 });
  });

  it('тайлы в снапшот не попадают', async () => {
    const raw = await readSavegame(fixture('londworth-1975'));
    const snapshot = buildSnapshot(raw);
    const bytes = JSON.stringify(snapshot).length;
    // карта этой партии — 512×512 тайлов по 12 байт, то есть три мегабайта
    expect(bytes).toBeLessThan(raw.network.mapSize!.width * raw.network.mapSize!.height);
  });
});
