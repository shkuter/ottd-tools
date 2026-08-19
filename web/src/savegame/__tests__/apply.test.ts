import { describe, expect, it, beforeEach } from 'vitest';
import { applyImport } from '../apply';
import type { SavegameImport } from '../import';
import { useSettingsStore } from '../../state/settingsStore';
import { useFirsStore } from '../../state/firsStore';
import { useRouteStore } from '../../state/routeStore';

const PROPOSAL: SavegameImport = {
  jgrpp: true,
  game: { jgrpp: true, dayLengthFactor: 5, vehicleCosts: 2, basecostGrf: true },
  calc: { priceYear: 1860, capacityIndex: 2 },
  economyId: 'BASIC_ARCTIC',
  info: [],
  unreadBaseCostSets: [],
};

describe('применение импорта', () => {
  beforeEach(() => {
    useSettingsStore.getState().reset();
    useFirsStore.getState().setEconomyId('STEELTOWN');
    useRouteStore.getState().setEconomyId('STEELTOWN');
  });

  it('пока подтверждения нет, настройки не меняются', () => {
    const before = useSettingsStore.getState().game;
    expect(before.dayLengthFactor).toBe(1);
    expect(useFirsStore.getState().economyId).toBe('STEELTOWN');
  });

  it('подтверждение применяет значения из сейва', () => {
    applyImport(PROPOSAL);
    const { game, calc } = useSettingsStore.getState();
    expect(game).toMatchObject({ jgrpp: true, dayLengthFactor: 5, vehicleCosts: 2 });
    expect(calc).toMatchObject({ priceYear: 1860, capacityIndex: 2 });
    // настройки, которых в сейве нет, остаются прежними
    expect(game.freightTrains).toBe(1);
  });

  it('экономика FIRS выставляется в обеих вкладках сразу', () => {
    applyImport(PROPOSAL);
    expect(useFirsStore.getState().economyId).toBe('BASIC_ARCTIC');
    expect(useRouteStore.getState().economyId).toBe('BASIC_ARCTIC');
  });

  it('без экономики в сейве вкладки не трогаются', () => {
    applyImport({ ...PROPOSAL, economyId: undefined });
    expect(useFirsStore.getState().economyId).toBe('STEELTOWN');
  });
});
