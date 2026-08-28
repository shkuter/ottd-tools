/**
 * Единица скорости — настройка отображения: она не входит ни в GameSettings, ни в
 * CalcSettings, поэтому кейса в settings-effect.test.ts у неё нет. Здесь проверяется
 * обратное требование — что переключение не задевает ни одного числа расчёта.
 */
import { describe, expect, it } from 'vitest';
import { speed } from '../components/format';
import { consistStats } from '../engine/consist';
import { optimizeConsists, type OptimizeParams } from '../engine/optimize';
import { tripEconomics } from '../engine/trip';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../engine/settings';
import { activeTrains, activeTrainsMeta, cargoByLabel } from '../dataset';
import { useSettingsStore } from '../state/settingsStore';

const cargo = cargoByLabel.get('COAL')!;
const game = DEFAULT_GAME_SETTINGS;
const calc = DEFAULT_CALC_SETTINGS;
const meta = activeTrainsMeta(game);

const params: OptimizeParams = {
  year: 1950,
  distanceTiles: 200,
  cargo,
  economyId: 'STEELTOWN',
  maxLengthTiles: 6,
  game,
  calc: { ...calc, trackType: 'ELRL' },
};

/** Всё, что видит пользователь на вкладках дохода и оптимизатора, кроме самой скорости. */
function calculation() {
  const results = optimizeConsists(activeTrains(game), params, meta, 5);
  const top = results[0];
  const entries = [
    { train: top.engine, count: top.engineCount },
    { train: top.wagon, count: top.wagonCount },
  ];
  const stats = consistStats(entries, cargo, calc.capacityIndex, meta, game, calc);
  const trip = tripEconomics({
    entries,
    cargo,
    payment: cargo.initial_payment_by_economy.STEELTOWN,
    distanceTiles: params.distanceTiles,
    meta,
    game,
    calc,
  });
  return JSON.stringify({
    order: results.map((r) => `${r.engine.id}+${r.wagon.id}`),
    profit: results.map((r) => r.profitPerYear),
    incomePerTrip: trip.incomePerTrip,
    roundTripDays: trip.roundTripDays,
    tripsPerYear: trip.tripsPerYear,
    payback: trip.paybackYears,
    running: trip.runningCostPerYear,
    buy: stats.buyCostTotal,
    weight: stats.loadedWeightT,
  });
}

describe('единица скорости не влияет на расчёт', () => {
  it('доход, время рейса и порядок выдачи оптимизатора одни и те же', () => {
    useSettingsStore.setState({ speedUnit: 'metric' });
    const metric = calculation();
    useSettingsStore.setState({ speedUnit: 'imperial' });
    const imperial = calculation();
    expect(imperial).toBe(metric);
  });

  it('меняется только показанная скорость', () => {
    useSettingsStore.setState({ speedUnit: 'metric' });
    const shown = speed(180);
    useSettingsStore.setState({ speedUnit: 'imperial' });
    expect(speed(180)).not.toBe(shown);
  });
});
