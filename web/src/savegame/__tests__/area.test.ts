import { describe, expect, it } from 'vitest';
import { parseSavegame } from '../parse';
import { readStations, type SavedStation } from '../extract/stnn';
import { readIndustries } from '../extract/indy';
import { areasTouch, type TileArea } from '../extract/area';
import { buildSnapshot } from '../snapshot';
import { readSavegame } from '../read';
import { fixture } from './chunks.test';

/** Площадки читаются из настоящих сейвов: имена полей приходят из заголовка таблицы. */
describe('площадки станций и индустрий', () => {
  it('у железнодорожной станции площадка непустая и содержит её опорный тайл', async () => {
    const { chunks } = await parseSavegame(fixture('vanilla-1951'));
    const stations = [...readStations(chunks.get('STNN')).values()].filter(
      (s): s is SavedStation => s.kind === 'station',
    );
    const rail = stations.filter((s) => s.trainStation !== null);
    expect(rail.length).toBeGreaterThan(0);
    for (const station of rail) {
      const area = station.trainStation!;
      expect(area.width).toBeGreaterThan(0);
      expect(area.height).toBeGreaterThan(0);
      // опорный тайл станции — угол её ж/д площадки, пока других частей у станции нет
      expect(station.xy).toBe(area.tile);
    }
  });

  it('станция без железнодорожной части площадки не имеет', async () => {
    // в партии Londworth первая станция — аэропорт с доком: train_station.tile = INVALID_TILE
    const { chunks } = await parseSavegame(fixture('londworth-1975'));
    const stations = [...readStations(chunks.get('STNN')).values()].filter(
      (s): s is SavedStation => s.kind === 'station',
    );
    const withoutRail = stations.filter((s) => s.trainStation === null);
    expect(withoutRail.length).toBeGreaterThan(0);
  });

  it('площадки индустрий лежат внутри карты и не наезжают друг на друга', async () => {
    const { chunks } = await parseSavegame(fixture('vanilla-1951'));
    const { network } = await readSavegame(fixture('vanilla-1951'));
    const width = network.mapSize!.width;
    const industries = [...readIndustries(chunks.get('INDY')).values()];
    expect(industries.length).toBeGreaterThan(0);

    const taken = new Map<number, number>();
    for (const industry of industries) {
      const area = industry.location;
      expect(area).not.toBeNull();
      expect(area!.width).toBeGreaterThan(0);
      expect(area!.height).toBeGreaterThan(0);
      const x = area!.tile % width;
      const y = Math.floor(area!.tile / width);
      // площадка целиком на карте: за краем читались бы соседние тайлы другой строки
      expect(x + area!.width).toBeLessThanOrEqual(width);
      expect(y + area!.height).toBeLessThanOrEqual(network.mapSize!.height);
      // и предприятия не стоят одно на другом — значит размеры не разъехались со смещением
      for (let dy = 0; dy < area!.height; dy++) {
        for (let dx = 0; dx < area!.width; dx++) {
          const tile = (y + dy) * width + x + dx;
          expect(taken.get(tile), `тайл ${tile} занят дважды`).toBeUndefined();
          taken.set(tile, industry.index);
        }
      }
    }
  });
});

describe('поставщики станции в снапшоте', () => {
  it('станция у шахты числит её поставщиком, далёкие индустрии — нет', async () => {
    const snapshot = buildSnapshot(await readSavegame(fixture('vanilla-1951')));
    const withSuppliers = snapshot.stations.filter((s) => s.supplierIds.length > 0);
    expect(withSuppliers.length).toBeGreaterThan(0);
    // охват — считаные тайлы, поэтому в него попадает горстка предприятий, а не вся карта
    const all = snapshot.industries.length;
    for (const station of withSuppliers) {
      expect(station.supplierIds.length).toBeLessThan(all);
      for (const id of station.supplierIds) {
        expect(snapshot.industries.some((i) => i.id === id)).toBe(true);
      }
    }
  });

  it('у станции без железнодорожной части поставщиков нет', async () => {
    const snapshot = buildSnapshot(await readSavegame(fixture('londworth-1975')));
    const rail = new Set(
      [...(await readSavegame(fixture('londworth-1975'))).network.stations.values()]
        .filter((s) => s.kind === 'station' && s.trainStation !== null)
        .map((s) => s.index),
    );
    for (const station of snapshot.stations) {
      if (!rail.has(station.id)) expect(station.supplierIds).toEqual([]);
    }
    // а у железнодорожных привязка не выродилась в пустоту: JGRPP-партия читается так же
    expect(snapshot.stations.filter((s) => s.supplierIds.length > 0).length).toBeGreaterThan(0);
  });

  it('охват равен четырём тайлам от края площадки, как в игре', async () => {
    const base = await readSavegame(fixture('vanilla-1951'));
    const station = [...base.network.stations.values()].find(
      (s): s is Extract<typeof s, { kind: 'station' }> =>
        s.kind === 'station' && s.trainStation !== null,
    )!;
    const area = station.trainStation!;
    const width = base.network.mapSize!.width;
    const east = (area.tile % width) + area.width - 1;
    const y = Math.floor(area.tile / width);
    const plot = (x: number) => ({ tile: y * width + x, width: 1, height: 1 });

    // индустрия ровно на границе охвата и на тайл дальше: пятый тайл уже вне
    const industries = new Map(base.network.industries);
    industries.set(9001, { index: 9001, typeId: 0, town: null, location: plot(east + 4), produced: [] });
    industries.set(9002, { index: 9002, typeId: 0, town: null, location: plot(east + 5), produced: [] });
    const snapshot = buildSnapshot({ ...base, network: { ...base.network, industries } });

    const suppliers = snapshot.stations.find((s) => s.id === station.index)!.supplierIds;
    expect(suppliers).toContain(9001);
    expect(suppliers).not.toContain(9002);
  });

  it('JGRPP-настройка расширяет охват на своё число тайлов', async () => {
    const base = await readSavegame(fixture('vanilla-1951'));
    const station = [...base.network.stations.values()].find(
      (s): s is Extract<typeof s, { kind: 'station' }> =>
        s.kind === 'station' && s.trainStation !== null,
    )!;
    const area = station.trainStation!;
    const width = base.network.mapSize!.width;
    const east = (area.tile % width) + area.width - 1;
    const y = Math.floor(area.tile / width);

    const industries = new Map(base.network.industries);
    industries.set(9003, {
      index: 9003,
      typeId: 0,
      town: null,
      location: { tile: y * width + east + 6, width: 1, height: 1 },
      produced: [],
    });
    const settings = new Map(base.settings);
    settings.set('station.catchment_increase', 2);
    const snapshot = buildSnapshot({
      ...base,
      settings,
      network: { ...base.network, industries },
    });

    expect(snapshot.stations.find((s) => s.id === station.index)!.supplierIds).toContain(9003);
  });

  it('сейв без размера карты оставляет привязку пустой, а не падает', async () => {
    const base = await readSavegame(fixture('vanilla-1951'));
    const snapshot = buildSnapshot({
      ...base,
      network: { ...base.network, mapSize: undefined },
    });
    expect(snapshot.stations.every((s) => s.supplierIds.length === 0)).toBe(true);
  });

  it('индустрия без площадки в поставщики не попадает', async () => {
    const base = await readSavegame(fixture('vanilla-1951'));
    const industries = new Map(
      [...base.network.industries].map(([id, industry]) => [id, { ...industry, location: null }]),
    );
    const snapshot = buildSnapshot({ ...base, network: { ...base.network, industries } });

    expect(snapshot.stations.every((s) => s.supplierIds.length === 0)).toBe(true);
  });

  it('вейпоинт поставщиков не получает', async () => {
    const snapshot = buildSnapshot(await readSavegame(fixture('londworth-1975')));
    for (const station of snapshot.stations.filter((s) => s.isWaypoint)) {
      expect(station.supplierIds).toEqual([]);
    }
  });
});

describe('пересечение площадок с охватом', () => {
  const width = 256;
  const at = (x: number, y: number, w = 1, h = 1): TileArea => ({
    tile: y * width + x,
    width: w,
    height: h,
  });

  it('соседняя площадка попадает в охват', () => {
    expect(areasTouch(at(10, 10), at(13, 10), width, 4)).toBe(true);
  });

  it('площадка за радиусом охвата не попадает', () => {
    // охват тайла 10 при радиусе 4 кончается на 14 — как Expand в игре (tilearea.cpp:123)
    expect(areasTouch(at(10, 10), at(14, 10), width, 4)).toBe(true);
    expect(areasTouch(at(10, 10), at(15, 10), width, 4)).toBe(false);
  });

  it('охват считается от края площадки, а не от опорного тайла', () => {
    // станция 1x6 тянется на юг, поэтому её южный край достаёт дальше
    expect(areasTouch(at(10, 10, 1, 6), at(10, 19), width, 4)).toBe(true);
    expect(areasTouch(at(10, 10, 1, 1), at(10, 19), width, 4)).toBe(false);
  });

  it('размер второй площадки тоже считается', () => {
    // индустрия 3x3 стоит углом на границе охвата — считается ближний край, а не тайл-угол
    expect(areasTouch(at(10, 10), at(15, 10, 3, 3), width, 4)).toBe(false);
    expect(areasTouch(at(10, 10), at(14, 10, 3, 3), width, 4)).toBe(true);
  });

  it('диагональ считается по обеим осям сразу', () => {
    expect(areasTouch(at(10, 10), at(14, 14), width, 4)).toBe(true);
    expect(areasTouch(at(10, 10), at(15, 15), width, 4)).toBe(false);
  });
});
