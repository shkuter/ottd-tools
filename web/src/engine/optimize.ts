/**
 * Перебор связок «локомотив(ы) + вагоны» под задачу:
 * год, дистанция, груз, длина станции -> рейтинг по прибыли в год.
 * Гружёное плечо и порожний обратный ход считаются с разной скоростью.
 */
import type { Cargo, Train, TrainsMeta } from '../types';
import { canCarry } from '../dataset';
import { consistPhysics, type ConsistEntry } from './consist';
import { balancingSpeed } from './physics';
import { buyCost, runningBaseKey, runningCostPerYear } from './costs';
import { transportedGoodsIncome } from './income';
import { daysForDistance, transitPeriodsFromDays } from './units';

export interface OptimizeParams {
  year: number;
  distanceTiles: number;
  cargo: Cargo;
  economyId: string;
  /** Длина станции в тайлах — лимит длины состава. */
  maxLengthTiles: number;
  capacityIndex: number;
  trackType: 'RAIL' | 'NG' | 'METRO';
  /** Линия электрифицирована: включать чисто электрические (OHLE) локомотивы. */
  allowElectric: boolean;
}

/** Локомотив требует контактную сеть (единственный источник тяги — OHLE). */
export function isPureElectric(train: Train): boolean {
  const sources = Object.keys(train.power_by_source ?? {});
  return sources.length > 0 && sources.every((s) => s === 'OHLE');
}

export interface OptimizeResult {
  engine: Train;
  engineCount: number;
  wagon: Train;
  wagonCount: number;
  capacity: number;
  lengthTiles: number;
  loadedSpeedMph: number;
  emptySpeedMph: number;
  /** Гружёным на подъёме (типовой холм в 2 тайла: на уклоне часть состава). */
  gradeSpeedMph: number;
  roundTripDays: number;
  tripsPerYear: number;
  incomePerTrip: number;
  runningCostPerYear: number;
  buyCostTotal: number;
  profitPerYear: number;
  paybackYears: number | null;
}

function isAvailable(train: Train, year: number): boolean {
  if (train.intro_year > year) return false;
  if (train.model_life != null && year >= train.intro_year + train.model_life) return false;
  return true;
}

function moneyFor(entries: ConsistEntry[], meta: TrainsMeta) {
  let buy = 0;
  let running = 0;
  for (const { train, count } of entries) {
    const buyShift =
      train.kind === 'engine'
        ? meta.basecost_shifts.build_engine
        : meta.basecost_shifts.build_wagon;
    const runShift = train.running_cost_base.includes('STEAM')
      ? meta.basecost_shifts.running_steam
      : meta.basecost_shifts.running_diesel;
    buy += count * buyCost(train.kind, train.cost_factor, buyShift);
    running +=
      count *
      runningCostPerYear(
        runningBaseKey(train.running_cost_base),
        train.running_cost_factor,
        runShift,
      );
  }
  return { buy, running };
}

export function optimizeConsists(
  trains: Train[],
  params: OptimizeParams,
  meta: TrainsMeta,
  topN = 30,
): OptimizeResult[] {
  const { year, distanceTiles, cargo, maxLengthTiles, capacityIndex, trackType } = params;
  const payment = cargo.initial_payment_by_economy[params.economyId];
  if (!payment) return [];

  const engines = trains.filter(
    (t) =>
      t.kind === 'engine' &&
      t.base_track_type === trackType &&
      t.power_hp > 0 &&
      isAvailable(t, year) &&
      (params.allowElectric || !isPureElectric(t)),
  );
  const wagons = trains.filter(
    (t) =>
      t.kind === 'wagon' &&
      t.base_track_type === trackType &&
      isAvailable(t, year) &&
      canCarry(t, cargo) &&
      (t.capacities[capacityIndex] ?? 0) > 0,
  );

  const maxLengthUnits = maxLengthTiles * 16; // тайл = 16 единиц длины (стандартная машина 8 = полтайла)
  const results: OptimizeResult[] = [];

  for (const engine of engines) {
    for (const engineCount of [1, 2]) {
      const engineLength = engineCount * engine.length;
      if (engineLength >= maxLengthUnits) continue;
      for (const wagon of wagons) {
        const wagonCount = Math.floor((maxLengthUnits - engineLength) / wagon.length);
        if (wagonCount <= 0) continue;
        const entries: ConsistEntry[] = [
          { train: engine, count: engineCount },
          { train: wagon, count: wagonCount },
        ];

        const loaded = consistPhysics(entries, cargo, capacityIndex);
        if (loaded.stats.capacityForCargo <= 0) continue;
        const empty = consistPhysics(entries, null, capacityIndex);

        const loadedSpeed = balancingSpeed(loaded.physics);
        const emptySpeed = balancingSpeed(empty.physics);
        const lengthTiles = (engineLength + wagonCount * wagon.length) / 16;
        const massOnSlope = loaded.physics.massT * Math.min(2 / lengthTiles, 1);
        const gradeSpeed = balancingSpeed(loaded.physics, massOnSlope);
        if (loadedSpeed <= 2) continue;

        const daysLoaded = daysForDistance(distanceTiles, loadedSpeed);
        const daysEmpty = daysForDistance(distanceTiles, emptySpeed);
        const roundTripDays = daysLoaded + daysEmpty;
        const tripsPerYear = 365 / roundTripDays;

        const incomePerTrip = transportedGoodsIncome(
          loaded.stats.capacityForCargo,
          distanceTiles,
          transitPeriodsFromDays(daysLoaded),
          { currentPayment: payment, transitPeriods: cargo.transit_periods },
        );
        const { buy, running } = moneyFor(entries, meta);
        const profitPerYear = incomePerTrip * tripsPerYear - running;

        results.push({
          engine,
          engineCount,
          wagon,
          wagonCount,
          capacity: loaded.stats.capacityForCargo,
          lengthTiles,
          loadedSpeedMph: Math.floor((loadedSpeed * 10) / 16),
          emptySpeedMph: Math.floor((emptySpeed * 10) / 16),
          gradeSpeedMph: Math.floor((gradeSpeed * 10) / 16),
          roundTripDays,
          tripsPerYear,
          incomePerTrip,
          runningCostPerYear: running,
          buyCostTotal: buy,
          profitPerYear,
          paybackYears: profitPerYear > 0 ? buy / profitPerYear : null,
        });
      }
    }
  }

  // одна строка на «локомотив × число секций»: лучший вагон для него
  // (вагоны одной вместимости различаются только ценой — при равной прибыли берём дешевле)
  const better = (a: OptimizeResult, b: OptimizeResult) =>
    Math.abs(a.profitPerYear - b.profitPerYear) > 1
      ? a.profitPerYear > b.profitPerYear
      : a.buyCostTotal < b.buyCostTotal;
  const best = new Map<string, OptimizeResult>();
  for (const r of results) {
    const key = `${r.engine.id}|${r.engineCount}`;
    const prev = best.get(key);
    if (!prev || better(r, prev)) best.set(key, r);
  }
  return [...best.values()]
    .sort((a, b) => b.profitPerYear - a.profitPerYear || a.buyCostTotal - b.buyCostTotal)
    .slice(0, topN);
}
