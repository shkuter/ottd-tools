import { describe, expect, it } from 'vitest';
import {
  RATING_PERIOD_DAYS,
  estimateStationRating,
  speedRating,
  vehicleAgeRating,
  waitTimeRating,
  waitingCargoRating,
} from '../rating';

describe('station rating parts', () => {
  it('период счётчика — 185 тиков = 2.5 дня', () => {
    expect(RATING_PERIOD_DAYS).toBe(2.5);
  });

  it('скорость: (last_speed - 85) >> 2, ниже 85 — ноль', () => {
    expect(speedRating(85)).toBe(0);
    expect(speedRating(60)).toBe(0);
    expect(speedRating(96)).toBe(2); // 60 mph
    expect(speedRating(255)).toBe(42);
    expect(speedRating(400)).toBe(42); // last_speed хранится в байте
  });

  it('время с последней погрузки: ступени 3 / 6 / 12 / 21 периодов', () => {
    expect(waitTimeRating(3)).toBe(130);
    expect(waitTimeRating(6)).toBe(95);
    expect(waitTimeRating(12)).toBe(50);
    expect(waitTimeRating(21)).toBe(25);
    expect(waitTimeRating(22)).toBe(0);
    expect(waitTimeRating(83)).toBe(0); // круг 208 дней при одном поезде
  });

  it('ждущий груз: от +40 при пустой станции до -90 при завале', () => {
    expect(waitingCargoRating(0)).toBe(40);
    expect(waitingCargoRating(100)).toBe(40);
    expect(waitingCargoRating(300)).toBe(30);
    expect(waitingCargoRating(1000)).toBe(0);
    expect(waitingCargoRating(1501)).toBe(-90);
  });

  it('возраст: JGRPP прощает старую технику, ваниль — нет', () => {
    expect(vehicleAgeRating(0, false)).toBe(33);
    expect(vehicleAgeRating(5, false)).toBe(0);
    expect(vehicleAgeRating(5, true)).toBe(33);
    expect(vehicleAgeRating(25, true)).toBe(10);
    expect(vehicleAgeRating(30, true)).toBe(0);
  });
});

describe('оценка рейтинга станции', () => {
  const base = {
    maxSpeedInternal: 96, // 60 mph
    cargoPerDay: 2304 / (365 * 5), // 192 ящика в экономический месяц, day length 5
    jgrpp: true,
  };

  it('редкие заходы дают низкий вывоз, частые — высокий', () => {
    const rare = estimateStationRating({ ...base, pickupIntervalDays: 208 });
    const often = estimateStationRating({ ...base, pickupIntervalDays: 208 / 8 });
    expect(rare.deliveredShare).toBeLessThan(0.6);
    expect(often.deliveredShare).toBeGreaterThan(rare.deliveredShare + 0.2);
  });

  it('на длинном интервале бонус за ожидание почти теряется', () => {
    const r = estimateStationRating({ ...base, pickupIntervalDays: 208 });
    // ступени действуют только первые 21 период после захода — в среднем по кругу
    // остаются крохи от максимальных 130
    expect(r.parts.waitTime).toBeLessThan(20);
    expect(estimateStationRating({ ...base, pickupIntervalDays: 7 }).parts.waitTime)
      .toBeGreaterThan(100);
    expect(r.parts.age).toBe(33);
    expect(r.parts.speed).toBe(2);
  });

  it('доля отдачи — (рейтинг + 1) / 256', () => {
    const r = estimateStationRating({ ...base, pickupIntervalDays: 40 });
    expect(r.deliveredShare).toBeCloseTo((r.rating + 1) / 256, 10);
    expect(r.rating).toBeGreaterThanOrEqual(0);
    expect(r.rating).toBeLessThanOrEqual(255);
  });

  it('статуя и свежий поезд поднимают рейтинг', () => {
    const plain = estimateStationRating({ ...base, pickupIntervalDays: 30 });
    const withStatue = estimateStationRating({ ...base, pickupIntervalDays: 30, statue: true });
    expect(withStatue.rating).toBe(plain.rating + 26);
  });
});
