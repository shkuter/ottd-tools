import { describe, expect, it } from 'vitest';
import { cargoByLabel, trains, trainsMeta } from '../../dataset';
import { tripEconomics, tripLoadingDays } from '../trip';
import { loadingTicks, DEFAULT_GAME_SETTINGS } from '../settings';
import { DAY_TICKS } from '../units';

const coal = cargoByLabel.get('COAL')!;
const payment = coal.initial_payment_by_economy.STEELTOWN;
const engine = trains.find((t) => t.kind === 'engine' && t.power_hp > 0 && t.base_track_type === 'RAIL')!;
const hopper = trains.find(
  (t) => t.kind === 'wagon' && t.id.startsWith('coal_hopper_car_type_1_pony') && (t.capacities[2] ?? 0) > 0,
)!;

const base = { cargo: coal, payment, distanceTiles: 100, meta: trainsMeta };

describe('tripEconomics', () => {
  it('порожнее плечо не длиннее гружёного, круг короче удвоенного гружёного', () => {
    const t = tripEconomics({ ...base, entries: [{ train: engine, count: 1 }, { train: hopper, count: 20 }] });
    expect(t.emptySpeedInternal).toBeGreaterThanOrEqual(t.loadedSpeedInternal);
    expect(t.daysEmpty).toBeLessThanOrEqual(t.daysLoaded);
    expect(t.roundTripDays).toBeCloseTo(t.daysLoaded + t.daysEmpty + t.loadingDays, 9);
  });

  it('стоянка — по самому медленному вагону, число вагонов не влияет', () => {
    const one = tripLoadingDays([{ train: hopper, count: 1 }], coal, 2, DEFAULT_GAME_SETTINGS);
    const many = tripLoadingDays([{ train: hopper, count: 15 }], coal, 2, DEFAULT_GAME_SETTINGS);
    expect(one).toBe(many);
    expect(one).toBeCloseTo(
      (2 * loadingTicks(hopper.capacities[2], hopper.loading_speed ?? 0, DEFAULT_GAME_SETTINGS)) / DAY_TICKS,
      9,
    );
  });

  it('локомотив не участвует в стоянке, вагон под другой груз — тоже', () => {
    const only = tripLoadingDays([{ train: engine, count: 1 }, { train: hopper, count: 3 }], coal, 2, DEFAULT_GAME_SETTINGS);
    const wagonOnly = tripLoadingDays([{ train: hopper, count: 3 }], coal, 2, DEFAULT_GAME_SETTINGS);
    expect(only).toBe(wagonOnly);
    const pass = cargoByLabel.get('PASS')!;
    expect(tripLoadingDays([{ train: hopper, count: 3 }], pass, 2, DEFAULT_GAME_SETTINGS)).toBe(0);
  });

  it('gradual_loading выключена → стоянок нет', () => {
    const t = tripEconomics({
      ...base,
      entries: [{ train: engine, count: 1 }, { train: hopper, count: 5 }],
      game: { ...DEFAULT_GAME_SETTINGS, gradualLoading: false },
    });
    expect(t.loadingDays).toBe(0);
  });

  it('длина дня 2 → рейсов в год вдвое больше при том же круге', () => {
    const entries = [{ train: engine, count: 1 }, { train: hopper, count: 5 }];
    const a = tripEconomics({ ...base, entries });
    const b = tripEconomics({ ...base, entries, game: { ...DEFAULT_GAME_SETTINGS, jgrpp: true, dayLengthFactor: 2 } });
    expect(b.roundTripDays).toBeCloseTo(a.roundTripDays, 9);
    expect(b.tripsPerYear).toBeCloseTo(a.tripsPerYear * 2, 9);
  });

  it('ручное время: при равных скоростях порожнее плечо равно введённому', () => {
    // 1 hopper barely loads the engine: both legs sit on the speed limit
    const entries = [{ train: engine, count: 1 }, { train: hopper, count: 1 }];
    const t = tripEconomics({ ...base, entries, loadedDaysOverride: 50 });
    expect(t.daysLoaded).toBe(50);
    if (t.loadedSpeedInternal === t.emptySpeedInternal) expect(t.daysEmpty).toBe(50);
    else expect(t.daysEmpty).toBeCloseTo(50 * (t.loadedSpeedInternal / t.emptySpeedInternal), 9);
  });

  it('ограниченное производство: доход от перевезённого, а не от вместимости', () => {
    const entries = [{ train: engine, count: 1 }, { train: hopper, count: 10 }];
    const full = tripEconomics({ ...base, entries });
    const capped = tripEconomics({ ...base, entries, cargoPerTrip: full.capacity / 2 });
    expect(capped.incomePerTrip).toBeLessThan(full.incomePerTrip);
    expect(capped.roundTripDays).toBe(full.roundTripDays);
  });

  it('убыточный состав → окупаемости нет', () => {
    const t = tripEconomics({ ...base, entries: [{ train: engine, count: 2 }, { train: hopper, count: 1 }], distanceTiles: 1, cargoPerTrip: 0 });
    expect(t.profitPerYear).toBeLessThan(0);
    expect(t.paybackYears).toBeNull();
  });
});
