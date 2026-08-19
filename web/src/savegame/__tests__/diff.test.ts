import { describe, expect, it } from 'vitest';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../engine/settings';
import { diffImport } from '../diff';
import type { SavegameImport } from '../import';

const EMPTY: SavegameImport = {
  jgrpp: false,
  game: {},
  calc: {},
  info: [],
  unreadBaseCostSets: [],
};

const name = (id: string) => id;

describe('различия между сейвом и настройками', () => {
  it('показывает только то, что расходится', () => {
    const diff = diffImport(
      { ...EMPTY, game: { vehicleCosts: 2, freightTrains: DEFAULT_GAME_SETTINGS.freightTrains } },
      DEFAULT_GAME_SETTINGS,
      DEFAULT_CALC_SETTINGS,
      'STEELTOWN',
      name,
    );
    expect(diff.game).toHaveLength(1);
    expect(diff.game[0]).toMatchObject({ current: 'Low', incoming: 'High' });
    expect(diff.identical).toBe(false);
  });

  it('совпадающие настройки дают пустой список', () => {
    const diff = diffImport(
      { ...EMPTY, game: { vehicleCosts: DEFAULT_GAME_SETTINGS.vehicleCosts }, calc: {} },
      DEFAULT_GAME_SETTINGS,
      DEFAULT_CALC_SETTINGS,
      'STEELTOWN',
      name,
    );
    expect(diff.identical).toBe(true);
    expect(diff.game).toEqual([]);
  });

  it('экономика FIRS сравнивается отдельно от игровых настроек', () => {
    const diff = diffImport(
      { ...EMPTY, economyId: 'BASIC_ARCTIC' },
      DEFAULT_GAME_SETTINGS,
      DEFAULT_CALC_SETTINGS,
      'STEELTOWN',
      name,
    );
    expect(diff.economy).toMatchObject({ current: 'STEELTOWN', incoming: 'BASIC_ARCTIC' });
    expect(diff.identical).toBe(false);
  });

  it('множители Base Costs показываются как в настройках', () => {
    const diff = diffImport(
      { ...EMPTY, game: { basecostLocomotive: 2 } },
      DEFAULT_GAME_SETTINGS,
      DEFAULT_CALC_SETTINGS,
      'STEELTOWN',
      name,
    );
    expect(diff.game[0]).toMatchObject({ current: '×1', incoming: '×2' });
  });
});
