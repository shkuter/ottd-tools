import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../snapshot';
import { readSavegame, type RawSavegame } from '../read';
import { fixture } from './chunks.test';

let cached: RawSavegame | undefined;
async function raw(): Promise<RawSavegame> {
  cached ??= await readSavegame(fixture('londworth-1975'));
  return cached;
}

describe('снапшот партии Londworth', () => {
  it('92 поезда, все составы опознаны как машины Iron Horse', async () => {
    const snapshot = buildSnapshot(await raw());
    expect(snapshot.trains).toHaveLength(92);
    const entries = snapshot.trains.flatMap((t) => t.consist);
    expect(entries.length).toBeGreaterThan(0);
    const unknown = entries.filter((e) => e.catalogueId === null);
    expect(unknown).toEqual([]);
    // паровоз или вагон — id из каталога trains.json
    expect(entries[0].catalogueId).toMatch(/^[a-z0-9_]+$/);
  });

  it('состав опознаётся поимённо, как в списке покупки игры', async () => {
    const snapshot = buildSnapshot(await raw());
    const first = snapshot.trains[0];
    // сверено с окном поезда игры: паровоз Haar и одиннадцать минеральных хопперов
    expect(first.consist).toEqual([
      { catalogueId: 'haar', count: 1 },
      { catalogueId: 'mineral_covered_hopper_combos_pony_gen_2A', count: 11 },
    ]);
    // сдвиг в numeric_ids или в чтении EIDS сломал бы именно это соответствие
    const byId = new Map(snapshot.trains.map((t) => [t.id, t]));
    expect(byId.size).toBe(snapshot.trains.length);
  });

  it('неизвестные поля и чанки не мешают собрать снапшот', async () => {
    const base = await raw();
    // JGRPP-сборки добавляют свои поля и чанки; снапшот обязан их пережить
    const settings = new Map(base.settings);
    settings.set('some.unknown.jgrpp.setting', 42);
    const snapshot = buildSnapshot({ ...base, settings });
    expect(snapshot.trains).toHaveLength(92);
    expect(snapshot.stations.length).toBeGreaterThan(0);
  });

  it('поезда с общим списком приказов собираются в один маршрут', async () => {
    const snapshot = buildSnapshot(await raw());
    expect(snapshot.routes.length).toBeGreaterThan(0);
    const shared = snapshot.routes.filter((r) => r.trainIds.length > 1);
    expect(shared.length).toBeGreaterThan(0);
    // каждый поезд маршрута ссылается на него обратно
    for (const route of snapshot.routes) {
      for (const id of route.trainIds) {
        expect(snapshot.trains.find((t) => t.id === id)?.routeId).toBe(route.id);
      }
    }
    // остановки указывают на существующие станции
    const stationIds = new Set(snapshot.stations.map((s) => s.id));
    for (const stop of snapshot.routes.flatMap((r) => r.stops)) {
      if (stop.kind === 'station') expect(stationIds.has(stop.stationId!)).toBe(true);
    }
  });

  it('грузы решаются в лейблы Steeltown, руда узнаваема', async () => {
    const snapshot = buildSnapshot(await raw());
    const labels = new Set(
      snapshot.trains.flatMap((t) => t.cargo).map((c) => c.label),
    );
    expect(labels.has('IORE')).toBe(true);
    expect(labels.has(null)).toBe(false);
  });

  it('станции: индустрийный суффикс через IIDS, обычные — по строке игры', async () => {
    const snapshot = buildSnapshot(await raw());
    // из 100 записей STNN одна — вейпоинт
    expect(snapshot.stations.filter((s) => !s.isWaypoint)).toHaveLength(99);
    expect(snapshot.stations.filter((s) => s.isWaypoint)).toHaveLength(1);
    const suffixes = new Set(snapshot.stations.map((s) => s.suffixKey));
    // партия строилась у индустрий — есть станции, названные по FIRS-строкам
    expect([...suffixes].some((s) => s?.startsWith('STR_STATION_'))).toBe(true);
    // в этом сейве станции ещё не переименовывались — у каждой есть ключ суффикса
    for (const s of snapshot.stations) {
      expect(s.customName !== '' || s.suffixKey !== null, `станция ${s.id}`).toBe(true);
    }
  });

  it('индустрии опознаны по каталогу и знают выпуск за месяц', async () => {
    const snapshot = buildSnapshot(await raw());
    expect(snapshot.industries).toHaveLength(204);
    const matched = snapshot.industries.filter((i) => i.catalogueId !== null);
    // включая семь заводов бытовой техники: их тип занял слот ванильной индустрии и в
    // маппинг сейва не попал, но по набору выпускаемых грузов он однозначен
    expect(matched.length).toBe(204);
    expect(
      snapshot.industries.filter((i) => i.catalogueId === 'appliance_factory'),
    ).toHaveLength(7);
    const producing = matched.flatMap((i) => i.produced);
    expect(producing.some((p) => (p.lastMonthProduction ?? 0) > 0)).toBe(true);
    expect(producing.filter((p) => p.label === null)).toEqual([]);
  });

  it('тип вне маппинга не угадывается, когда выпуск совпадает у двух индустрий', async () => {
    const base = await raw();
    const industries = new Map(base.network.industries);
    // в Steeltown такой набор выпускают и кислородный конвертер, и дуговая печь:
    // однозначного ответа нет, поэтому тип обязан остаться неопознанным
    industries.set(9000, {
      index: 9000,
      typeId: 250,
      town: 1,
      produced: [41, 43, 44, 49].map((cargoIndex) => ({ cargoIndex })),
    });
    const snapshot = buildSnapshot({ ...base, network: { ...base.network, industries } });
    expect(snapshot.industries.find((i) => i.id === 9000)?.catalogueId).toBeNull();
  });

  it('тип, названный чужим набором, не подменяется догадкой по грузам', async () => {
    const base = await raw();
    const industryTypeIds = new Map(base.network.industryTypeIds);
    // сейв называет тип 1, но набором, которого калькулятор не знает: угадывать нельзя
    industryTypeIds.set(1, { grfid: 0xdeadbeef, localId: 1 });
    const snapshot = buildSnapshot({ ...base, network: { ...base.network, industryTypeIds } });
    const ofType = [...base.network.industries.values()]
      .filter((i) => i.typeId === 1)
      .map((i) => i.index);
    expect(ofType.length).toBeGreaterThan(0);
    for (const id of ofType) {
      expect(snapshot.industries.find((i) => i.id === id)?.catalogueId).toBeNull();
    }
  });

  it('чужая машина не выбрасывается, а остаётся неопознанной', async () => {
    const base = await raw();
    // подменяем маппинг двигателя первого поезда на неизвестный GRF
    const network = { ...base.network, engineIds: new Map(base.network.engineIds) };
    const front = [...network.trains.values()].find((u) => u.subtype & 1)!;
    network.engineIds.set(front.engineType, { grfid: 0xdeadbeef, localId: 1 });
    const snapshot = buildSnapshot({ ...base, network });
    const train = snapshot.trains.find((t) => t.id === front.index)!;
    expect(train.consist[0].catalogueId).toBeNull();
    expect(train.consist.reduce((n, e) => n + e.count, 0)).toBeGreaterThan(0);
  });

  it('компания одна, человеческая; группы поездов с именами', async () => {
    const snapshot = buildSnapshot(await raw());
    expect(snapshot.companies).toHaveLength(1);
    expect(snapshot.companies[0].isAi).toBe(false);
    expect(snapshot.groups.map((g) => g.name)).toContain('Port Plennpool');
  });
});
