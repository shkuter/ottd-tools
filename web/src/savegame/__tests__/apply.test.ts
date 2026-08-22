import { describe, expect, it, beforeEach } from 'vitest';
import { applyImport } from '../apply';
import type { SavegameImport } from '../import';
import { useSettingsStore } from '../../state/settingsStore';

const PROPOSAL: SavegameImport = {
  jgrpp: true,
  game: {
    jgrpp: true,
    dayLengthFactor: 5,
    vehicleCosts: 2,
    basecostGrf: true,
    firsEconomy: 'BASIC_ARCTIC',
  },
  calc: { priceYear: 1860, capacityIndex: 2 },
  info: [],
  unreadBaseCostSets: [],
};

describe('применение импорта', () => {
  beforeEach(() => {
    useSettingsStore.getState().reset();
  });

  it('пока подтверждения нет, настройки не меняются', () => {
    const { game } = useSettingsStore.getState();
    expect(game.dayLengthFactor).toBe(1);
    expect(game.firsEconomy).toBe('STEELTOWN');
  });

  it('подтверждение применяет значения из сейва', () => {
    applyImport(PROPOSAL);
    const { game, calc } = useSettingsStore.getState();
    expect(game).toMatchObject({ jgrpp: true, dayLengthFactor: 5, vehicleCosts: 2 });
    expect(calc).toMatchObject({ priceYear: 1860, capacityIndex: 2 });
    // настройки, которых в сейве нет, остаются прежними
    expect(game.freightTrains).toBe(1);
  });

  it('экономика FIRS приезжает обычной настройкой партии', () => {
    applyImport(PROPOSAL);
    expect(useSettingsStore.getState().game.firsEconomy).toBe('BASIC_ARCTIC');
  });

  it('без экономики в сейве настройка не трогается', () => {
    const { firsEconomy: _dropped, ...game } = PROPOSAL.game;
    applyImport({ ...PROPOSAL, game });
    expect(useSettingsStore.getState().game.firsEconomy).toBe('STEELTOWN');
  });
});
