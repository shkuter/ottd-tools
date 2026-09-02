/**
 * `vehicle.wagon_speed_limits` в импорте: настройка переносится в партию калькулятора,
 * а не показывается справочной строкой — модель для неё теперь есть.
 */
import { describe, expect, it } from 'vitest';
import { GAME_SETTING_SOURCES, INFO_SETTINGS, gameSettingsFrom } from '../mapping';
import { diffImport } from '../diff';
import type { SavegameImport } from '../import';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../engine/settings';
import type { DisplaySettings } from '../../state/settingsStore';
import type { FieldValue } from '../values';

const saved = (value: number): ReadonlyMap<string, FieldValue> =>
  new Map<string, FieldValue>([['vehicle.wagon_speed_limits', value]]);

describe('перенос ограничения скорости вагонов', () => {
  it('выключенная в партии настройка приходит выключенной', () => {
    expect(gameSettingsFrom(saved(0))).toEqual({ wagonSpeedLimits: false });
  });

  it('включённая — включённой', () => {
    expect(gameSettingsFrom(saved(1))).toEqual({ wagonSpeedLimits: true });
  });

  it('сохранение, которое о ней молчит, ничего не предлагает', () => {
    expect(gameSettingsFrom(new Map())).toEqual({});
  });

  it('настройка ушла из справочного списка в переносимые', () => {
    const name = 'vehicle.wagon_speed_limits';
    expect(INFO_SETTINGS.some((s) => s.name === name)).toBe(false);
    expect(GAME_SETTING_SOURCES.some((s) => s.name === name)).toBe(true);
  });
});

describe('настройка в списке различий', () => {
  const EMPTY: SavegameImport = {
    jgrpp: false, game: {}, calc: {}, info: [], unreadBaseCostSets: [],
    recognisedSets: [], display: {},
  };
  const DISPLAY: DisplaySettings = { currency: 'GBP', speedUnit: 'metric' };

  it('расхождение показано среди переносимых настроек, а не справочных', () => {
    const diff = diffImport(
      { ...EMPTY, game: gameSettingsFrom(saved(0)) },
      DEFAULT_GAME_SETTINGS,
      DEFAULT_CALC_SETTINGS,
      DISPLAY,
    );
    expect(diff.identical).toBe(false);
    expect(diff.game).toHaveLength(1);
    // как у соседей: сверяем значения, а не переведённую подпись — та живёт в словаре
    expect(diff.game[0]).toMatchObject({ current: 'on', incoming: 'off' });
    expect(diff.info).toHaveLength(0);
  });
});
