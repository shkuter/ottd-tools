import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../snapshot';
import { OWNER_NONE } from '../extract/stnn';
import { readSavegame, type RawSavegame } from '../read';
import { fixture } from './fixture';
import { activeTrains, availabilityContext } from '../../dataset';
import { vanillaTrains } from '../../vanilla';
import { standsInBuyMenu } from '../../engine/availability';
import { DEFAULT_GAME_SETTINGS } from '../../engine/settings';

let cached: RawSavegame | undefined;
async function raw(): Promise<RawSavegame> {
  cached ??= await readSavegame(fixture('londworth-1975'));
  return cached;
}

let cachedXussr: RawSavegame | undefined;
async function xussrRaw(): Promise<RawSavegame> {
  cachedXussr ??= await readSavegame(fixture('xussr-1872'));
  return cachedXussr;
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
      location: null,
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

  it('у станции известен владелец; вышки и вейпоинты компании не принадлежат', async () => {
    const snapshot = buildSnapshot(await raw());
    const owned = snapshot.stations.filter((s) => !s.isWaypoint && s.companyId === 0);
    expect(owned.length).toBeGreaterThan(0);

    // партия одной компании, поэтому владелец у станций либо она, либо никто
    expect(new Set(snapshot.stations.map((s) => s.companyId))).toEqual(new Set([0, OWNER_NONE]));

    // станции нефтяных вышек стоят на воде и в игре не принадлежат никому —
    // в список станций компании они не попадают, как и в игре
    const unowned = snapshot.stations.filter((s) => !s.isWaypoint && s.companyId === OWNER_NONE);
    expect(unowned.length).toBeGreaterThan(0);
    expect(new Set(unowned.map((s) => s.suffixKey))).toEqual(new Set(['STR_STATION_WATER']));

    // вейпоинт на рельсах строит компания, и он остаётся её —
    // ничьи только буи на воде (station_sl.cpp:88)
    const waypoints = snapshot.stations.filter((s) => s.isWaypoint);
    expect(waypoints.length).toBeGreaterThan(0);
    expect(waypoints.every((w) => w.companyId === 0)).toBe(true);
  });

  it('размер карты читается из MAPS', async () => {
    expect((await raw()).network.mapSize).toEqual({ width: 512, height: 512 });
  });

  it('у маршрута есть расстояния плеч, посчитанные манхэттеном', async () => {
    const base = await raw();
    const snapshot = buildSnapshot(base);
    const width = base.network.mapSize!.width;
    const withLegs = snapshot.routes.filter((r) => r.legTiles.length > 0);
    expect(withLegs.length).toBeGreaterThan(0);

    for (const route of withLegs) {
      const stops = route.stops.filter((s) => s.kind === 'station');
      // круг рейса замкнут: плеч столько же, сколько станционных остановок
      expect(route.legTiles).toHaveLength(stops.length);
      expect(route.legTiles.every((tiles) => tiles > 0)).toBe(true);
    }

    // расстояние считается именно между опорными тайлами станций маршрута
    const route = withLegs[0];
    const tiles = route.stops
      .filter((s) => s.kind === 'station')
      .map((s) => base.network.stations.get(s.stationId!)!.xy);
    const expected = tiles.map((tile, i) => {
      const next = tiles[(i + 1) % tiles.length];
      return (
        Math.abs((tile % width) - (next % width)) +
        Math.abs(Math.floor(tile / width) - Math.floor(next / width))
      );
    });
    expect(route.legTiles).toEqual(expected);
  });

  it('без размера карты расстояний нет, но снапшот собирается', async () => {
    const base = await raw();
    const network = { ...base.network, mapSize: undefined };
    const snapshot = buildSnapshot({ ...base, network });
    expect(snapshot.routes.length).toBeGreaterThan(0);
    expect(snapshot.routes.every((r) => r.legTiles.length === 0)).toBe(true);
    // остальное на месте: расстояние — не то, без чего снапшот бессмыслен
    expect(snapshot.trains).toHaveLength(92);
  });
});

describe('снапшот партии на xUSSR', () => {
  it('машины набора опознаются по GRF и его локальному id', async () => {
    // у набора девять GRF, и локальные id в каждом начинаются заново: пары
    // (grfid, localId) достаточно, одного localId — нет
    const snapshot = buildSnapshot(await xussrRaw());
    const entries = snapshot.trains.flatMap((t) => t.consist);
    const known = entries.filter((e) => e.catalogueId !== null);
    expect(known.length).toBeGreaterThan(0);
    expect(known.every((e) => e.catalogueId!.startsWith('xussr_'))).toBe(true);
    expect(known.map((e) => e.catalogueId)).toContain('xussr_steam_a');
  });

  it('машины монолитного xussr.grf 0.7.1 остаются неопознанными, а состав целым', async () => {
    // объединённый набор до разделения в данных не покрыт (см. README): его машины
    // сохраняются в составе как неопознанные, число машин при этом не теряется
    const snapshot = buildSnapshot(await xussrRaw());
    const entries = snapshot.trains.flatMap((t) => t.consist);
    expect(entries.some((e) => e.catalogueId === null)).toBe(true);
    const total = entries.reduce((sum, e) => sum + e.count, 0);
    expect(total).toBeGreaterThan(100);
  });
});

describe('что партия продаёт', () => {
  it('список берётся из ответа самой игры, а не из дат набора', async () => {
    const raw = await xussrRaw();
    const snapshot = buildSnapshot(raw);
    // 926 машин в каталоге, тринадцать в продаже: игра решает это сама
    expect(snapshot.soldIds).toHaveLength(13);
    expect(snapshot.soldIds).toContain('xussr_steam_a');

    // и решает иначе, чем расчёт по данным набора: Тᴷ 13-го типа введён в этом же году,
    // но продажу игра откроет только через год после своей даты появления
    const game = { ...DEFAULT_GAME_SETTINGS, trainSet: 'xussr' as const, startingYear: 1860 };
    const byModel = activeTrains(game)
      .filter((train) => standsInBuyMenu(train, raw.year!, availabilityContext(game)))
      .map((train) => train.id);
    expect(byModel).toContain('xussr_tk030_type1873');
    expect(snapshot.soldIds).not.toContain('xussr_tk030_type1873');
  });

  it('ответ партии главнее формулы, пока год тот же', async () => {
    const raw = await xussrRaw();
    const snapshot = buildSnapshot(raw);
    const game = { ...DEFAULT_GAME_SETTINGS, trainSet: 'xussr' as const, startingYear: 1860 };
    const sold = new Set(snapshot.soldIds);
    const tk = activeTrains(game).find((t) => t.id === 'xussr_tk030_type1873')!;
    // с ответом партии машины нет, без него — есть
    expect(standsInBuyMenu(tk, raw.year!, availabilityContext(game, sold))).toBe(false);
    expect(standsInBuyMenu(tk, raw.year!, availabilityContext(game))).toBe(true);
  });

  it('в списке только поезда: автобусы и корабли нумеруются заново', async () => {
    // игра ведёт свой отсчёт internal_id для каждого типа транспорта, поэтому пара
    // (GRF, id) называет машину только вместе с типом — иначе автобус прочитался бы
    // как поезд с тем же номером
    const vanilla = buildSnapshot(await readSavegame(fixture('vanilla-1951')));
    const byId = new Map(vanillaTrains.map((t) => [t.id, t]));
    // тридцать шесть поездов; читая пул целиком, сюда попадали бы и автобусы с кораблями —
    // их номера совпадают с номерами поездов, и список раздувался до сорока пяти
    expect(vanilla.soldIds).toHaveLength(36);
    for (const id of vanilla.soldIds!) expect(byId.has(id)).toBe(true);
  });

  it('машины неизвестных GRF в список не попадают', async () => {
    const snapshot = buildSnapshot(await xussrRaw());
    // монолитный xussr.grf каталогу неизвестен: назвать его машины нечем
    expect(snapshot.soldIds!.every((id) => id.startsWith('xussr_'))).toBe(true);
  });

  it('сейв без сведений о машинах разбирается по-прежнему', async () => {
    const source = await xussrRaw();
    const withoutEngines = { ...source, network: { ...source.network, engineStates: new Map() } };
    const snapshot = buildSnapshot(withoutEngines);
    // не пустой список, а «ответа нет»: пустой значил бы «партия не продаёт ничего»
    expect(snapshot.soldIds).toBeNull();
    // остальное на месте: список доступности — добавка, а не условие разбора
    expect(snapshot.trains.length).toBeGreaterThan(0);
  });
});
