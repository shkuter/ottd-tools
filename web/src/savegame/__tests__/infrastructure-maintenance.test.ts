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
  networkMaintenance,
  type NetworkCounts,
  type RailtypeMultipliers,
} from '../../engine/infrastructure';
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
