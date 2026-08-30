import { describe, expect, it } from 'vitest';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../engine/settings';
import type { DisplaySettings } from '../../state/settingsStore';
import { diffImport } from '../diff';
import type { SavegameImport } from '../import';

const EMPTY: SavegameImport = {
  jgrpp: false,
  game: {},
  calc: {},
  info: [],
  unreadBaseCostSets: [],
  recognisedSets: [],
  display: {},
};

/** Настройки отображения по умолчанию — то, с чем калькулятор стоит до импорта. */
const DISPLAY: DisplaySettings = { currency: 'GBP', speedUnit: 'metric' };

describe('различия между сейвом и настройками', () => {
  it('показывает только то, что расходится', () => {
    const diff = diffImport(
      { ...EMPTY, game: { vehicleCosts: 2, freightTrains: DEFAULT_GAME_SETTINGS.freightTrains } },
      DEFAULT_GAME_SETTINGS,
      DEFAULT_CALC_SETTINGS,
      DISPLAY,
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
      DISPLAY,
    );
    expect(diff.identical).toBe(true);
    expect(diff.game).toEqual([]);
  });

  it('экономика FIRS идёт в общем списке настроек, под своим названием', () => {
    const diff = diffImport(
      { ...EMPTY, game: { firsEconomy: 'BASIC_ARCTIC' } },
      DEFAULT_GAME_SETTINGS,
      DEFAULT_CALC_SETTINGS,
      DISPLAY,
    );
    expect(diff.game).toHaveLength(1);
    expect(diff.game[0]).toMatchObject({ current: 'Steeltown', incoming: 'Arctic Basic' });
    expect(diff.identical).toBe(false);
  });

  it('множители Base Costs показываются как в настройках', () => {
    const diff = diffImport(
      { ...EMPTY, game: { basecostLocomotive: 2 } },
      DEFAULT_GAME_SETTINGS,
      DEFAULT_CALC_SETTINGS,
      DISPLAY,
    );
    expect(diff.game[0]).toMatchObject({ current: '×1', incoming: '×2' });
  });

  it('валюта партии идёт своей группой и вместе с курсом', () => {
    // курс — то, чем валюты различаются: без него запись «RUB → RUR» выглядит спором
    // о трёх буквах, а за ней множитель 1.6 на каждой сумме
    const diff = diffImport(
      { ...EMPTY, display: { currency: 'RUR' } },
      DEFAULT_GAME_SETTINGS,
      DEFAULT_CALC_SETTINGS,
      { currency: 'RUB', speedUnit: 'metric' },
    );
    expect(diff.game).toEqual([]);
    expect(diff.calc).toEqual([]);
    expect(diff.display).toHaveLength(1);
    expect(diff.display[0]).toMatchObject({ current: 'RUB (₽) ×80', incoming: 'RUR (p) ×50' });
    // расхождение показано — значит «настройки уже соответствуют партии» сказать нельзя
    expect(diff.identical).toBe(false);
  });

  it('совпадающие настройки отображения расхождением не считаются', () => {
    const diff = diffImport(
      { ...EMPTY, display: { currency: 'GBP', speedUnit: 'metric' } },
      DEFAULT_GAME_SETTINGS,
      DEFAULT_CALC_SETTINGS,
      DISPLAY,
    );
    expect(diff.display).toEqual([]);
    expect(diff.identical).toBe(true);
  });
});
