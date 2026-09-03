/**
 * Настройки обслуживания инфраструктуры в импорте: обе переносятся в партию калькулятора,
 * а отсутствие настройки само по себе значение — партия без JGRPP растит стоимость
 * по-ванильному, а сохранение старше версии 166 не знает этой статьи вовсе.
 */
import { describe, expect, it } from 'vitest';
import { GAME_SETTING_SOURCES, INFO_SETTINGS, gameSettingsFrom } from '../mapping';
import { diffImport } from '../diff';
import type { SavegameImport } from '../import';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS, type GameSettings } from '../../engine/settings';
import {
  EMPTY_NETWORK,
  ROAD_MAINTENANCE_MULTIPLIERS,
  networkMaintenance,
  type NetworkCounts,
  type RailtypeMultipliers,
} from '../../engine/infrastructure';
import { activeRailtypes } from '../../dataset';
import {
  ST_AIRPORT,
  stationType,
  tileType,
  TT_STATION,
  type InfrastructureCounts,
} from '../extract/infrastructure';
import { readMapSize } from '../extract/maps';
import { readTiles } from '../extract/tiles';
import { buildImport } from '../import';
import { parseSavegame } from '../parse';
import { readSavegame } from '../read';
import { snapshotSettings } from '../snapshotStore';
import { fixture } from './fixture';
import type { DisplaySettings } from '../../state/settingsStore';
import type { FieldValue } from '../values';

const saved = (fields: Record<string, number>): ReadonlyMap<string, FieldValue> =>
  new Map<string, FieldValue>(Object.entries(fields));

/** table/railtypes.h — достаточно двух типов, чтобы сеть было чем наполнить. */
const RAILTYPES: RailtypeMultipliers = [
  { label: 'RAIL', maintenance_multiplier: 8 },
  { label: 'ELRL', maintenance_multiplier: 12 },
];

describe('перенос настроек обслуживания', () => {
  it('включённая в партии статья приходит включённой', () => {
    expect(gameSettingsFrom(saved({ 'economy.infrastructure_maintenance': 1 }))).toMatchObject({
      infrastructureMaintenance: true,
    });
  });

  it('линейный рост переносится как есть', () => {
    expect(gameSettingsFrom(saved({ 'economy.linear_maintenance': 1 }))).toMatchObject({
      linearMaintenance: true,
    });
  });

  it('партия не на JGRPP читается как ванильная модель роста', () => {
    // настройки в сохранении нет вовсе — это не «не знаем», а «растёт по корню»
    expect(gameSettingsFrom(new Map())).toMatchObject({ linearMaintenance: false });
  });

  it('сохранение без статьи расходов читается как выключенная', () => {
    expect(gameSettingsFrom(new Map())).toMatchObject({ infrastructureMaintenance: false });
  });

  it('выключенная в партии статья приходит выключенной и обнуляет стоимость сети', () => {
    const patch = gameSettingsFrom(saved({ 'economy.infrastructure_maintenance': 0 }));
    expect(patch).toMatchObject({ infrastructureMaintenance: false });
    // и это именно то значение, при котором сеть перестаёт стоить денег
    const game: GameSettings = { ...DEFAULT_GAME_SETTINGS, ...patch };
    const counts: NetworkCounts = {
      ...EMPTY_NETWORK,
      rail: { RAIL: 10372 },
      signals: 1612,
      stations: 514,
    };
    expect(networkMaintenance(counts, RAILTYPES, game, 1950).yearly).toBe(0);
  });

  it('статья ушла из справочного списка в переносимые', () => {
    const name = 'economy.infrastructure_maintenance';
    expect(INFO_SETTINGS.some((s) => s.name === name)).toBe(false);
    expect(GAME_SETTING_SOURCES.some((s) => s.name === name)).toBe(true);
  });
});

describe('различия при импорте', () => {
  const EMPTY: SavegameImport = {
    jgrpp: false, game: {}, calc: {}, info: [], unreadBaseCostSets: [],
    recognisedSets: [], display: {},
  };
  const DISPLAY: DisplaySettings = { currency: 'GBP', speedUnit: 'metric' };

  it('включённая в партии статья показана среди переносимых настроек', () => {
    const diff = diffImport(
      { ...EMPTY, game: { infrastructureMaintenance: true } },
      DEFAULT_GAME_SETTINGS,
      DEFAULT_CALC_SETTINGS,
      DISPLAY,
    );
    expect(diff.identical).toBe(false);
    expect(diff.game).toHaveLength(1);
    expect(diff.game[0]).toMatchObject({ current: 'off', incoming: 'on' });
    expect(diff.info).toHaveLength(0);
  });
});

/**
 * Приёмка всей модели: на количествах и настройках самой партии годовой итог обязан сойтись
 * с итогом её окна инфраструктуры. Эталон — `research-counts.md`, снят в игре 02.09.2026;
 * окно показывало рубли, поэтому итог модели переводится курсом 50 (currency.cpp:52).
 */
describe('итог сходится с окном инфраструктуры импортированной партии', () => {
  const ROUBLE = 50;

  /**
   * Всё, что калькулятор моделирует, — из счётчиков разбора карты, без подстановок.
   * Приведение дорог сужает «любой лейбл, который назвал файл» до двух, которые знает
   * модель; законно оно ровно потому, что тест ниже отдельно требует, чтобы никакого
   * третьего с ненулевым счётом в партии не было.
   */
  const countsOf = (network: InfrastructureCounts): NetworkCounts => ({
    ...network,
    road: network.road as NetworkCounts['road'],
    tram: network.tram as NetworkCounts['tram'],
  });

  /** Партия ровно так, как её ставит подтверждённый импорт: настройки файла плюс дефолты. */
  async function party(name: string) {
    const raw = await readSavegame(fixture(name));
    const network = raw.network.infrastructure!.get(0)!;
    const proposal = buildImport(raw);
    const { game, calc } = snapshotSettings(proposal.game, proposal.calc);
    const railtypes = activeRailtypes(game).map((rt) => ({
      label: rt.label,
      maintenance_multiplier: rt.maintenance_multiplier,
    }));
    return { raw, network, game, calc, railtypes };
  }

  /**
   * Аэропорты игра считает по станциям, а не по карте, и калькулятор их не моделирует:
   * сверять итог можно только там, где их нет, и убеждаться в этом надо явно — иначе на
   * партии с аэропортом сверка молча разойдётся. Спрашиваем карту: клетка аэропорта — это
   * `StationType::Airport`, ровно то, что счётчик пропускает.
   */
  async function stationTiles(name: string): Promise<{ all: number; airports: number }> {
    const parsed = await parseSavegame(fixture(name));
    const tiles = readTiles(parsed.chunks, readMapSize(parsed.chunks.get('MAPS')))!;
    let all = 0;
    let airports = 0;
    for (let tile = 0; tile < tiles.size; tile++) {
      if (tileType(tiles, tile) !== TT_STATION) continue;
      all++;
      if (stationType(tiles, tile) === ST_AIRPORT) airports++;
    }
    return { all, airports };
  }

  it.each([
    ['londworth-1975', 51_641_400],
    ['vanilla-1951', 1_767_000],
  ])('%s', async (name, expected) => {
    const { network, game, calc, railtypes } = await party(name);
    // `all` — чтобы «аэропортов нет» не оказалось «клетки станций не нашлись»
    const stations = await stationTiles(name);
    expect(stations.all).toBeGreaterThan(0);
    expect(stations.airports).toBe(0);
    // ни одного рода дорог, которого модель не знает: молча пропущенный занизил бы итог
    for (const [label, pieces] of [...Object.entries(network.road), ...Object.entries(network.tram)]) {
      if (pieces > 0) expect(Object.keys(ROAD_MAINTENANCE_MULTIPLIERS)).toContain(label);
    }
    const result = networkMaintenance(countsOf(network), railtypes, game, calc.priceYear);
    expect(result.yearly * ROUBLE).toBe(expected);
  });
});
