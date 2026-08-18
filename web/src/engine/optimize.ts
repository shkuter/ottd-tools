/**
 * Перебор связок «локомотив(ы) + вагоны» под задачу:
 * год, дистанция, груз, длина станции -> рейтинг по прибыли в год.
 * Гружёное плечо и порожний обратный ход считаются с разной скоростью.
 */
import type { Cargo, ConsistEntry, Train, TrainsMeta } from '../types';
import { canCarryIn } from '../dataset';
import { consistPhysics } from './consist';
import { balancingSpeed } from './physics';
import { estimateStationRating, type StationRating } from './rating';
import { introAvailability, type IntroAvailability } from './availability';
import { tripEconomics } from './trip';
import { internalToMph } from './units';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type CalcSettings,
  type GameSettings,
  effectiveDayLength,
  daysPerEconomyYear,
} from './settings';

export interface OptimizeParams {
  year: number;
  distanceTiles: number;
  cargo: Cargo;
  economyId: string;
  /** Длина станции в тайлах — лимит длины состава. */
  maxLengthTiles: number;
  /** Линия электрифицирована: включать чисто электрические (OHLE) локомотивы. */
  allowElectric: boolean;
  /** Груз идёт под субсидией — доход умножается (difficulty.subsidy_multiplier). */
  subsidised?: boolean;
  /** Машины, выброшенные из перебора (например, которых в игре ещё может не быть). */
  excludedIds?: readonly string[];
  /**
   * Cargo produced per economy month at the source industry (0 = unlimited).
   * Caps what a train can actually haul, so extra capacity stops paying for itself
   * and the optimizer picks the wagon count that matches the flow.
   */
  productionPerMonth?: number;
  game?: GameSettings;
  calc?: CalcSettings;
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
  /** Когда локомотив появляется в игре: год выбран, а дата в игре точнее и плавает. */
  engineIntro: IntroAvailability;
  /** То же для вагона. */
  wagonIntro: IntroAvailability;
  capacity: number;
  /** Cargo actually hauled per trip: the capacity, or the production flow share when smaller. */
  cargoPerTrip: number;
  /** Trains of this consist needed to clear the production flow (1 when unconstrained). */
  trainsNeeded: number;
  /** Days between visits to the station: round trip shared by `trainsNeeded` trains. */
  pickupIntervalDays: number;
  /** Station rating this interval settles at; null when no production flow is given. */
  stationRating: StationRating | null;
  lengthTiles: number;
  loadedSpeedMph: number;
  emptySpeedMph: number;
  /** Гружёным на подъёме (холм заданной длины: на уклоне часть состава). */
  gradeSpeedMph: number;
  /** Дни стоянки под погрузку и разгрузку за рейс. */
  loadingDays: number;
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

export function optimizeConsists(
  trains: Train[],
  params: OptimizeParams,
  meta: TrainsMeta,
  topN = 30,
): OptimizeResult[] {
  const { year, distanceTiles, cargo, maxLengthTiles } = params;
  const game = params.game ?? DEFAULT_GAME_SETTINGS;
  const calc = params.calc ?? DEFAULT_CALC_SETTINGS;
  const { capacityIndex, trackType } = calc;
  const payment = cargo.initial_payment_by_economy[params.economyId];
  if (!payment) return [];

  const excluded = new Set(params.excludedIds ?? []);
  const engines = trains.filter(
    (t) =>
      t.kind === 'engine' &&
      t.base_track_type === trackType &&
      t.power_hp > 0 &&
      isAvailable(t, year) &&
      !excluded.has(t.id) &&
      (params.allowElectric || !isPureElectric(t)),
  );
  const wagons = trains.filter(
    (t) =>
      t.kind === 'wagon' &&
      t.base_track_type === trackType &&
      isAvailable(t, year) &&
      !excluded.has(t.id) &&
      canCarryIn(game, t, cargo) &&
      (t.capacities[capacityIndex] ?? 0) > 0,
  );

  const maxLengthUnits = maxLengthTiles * 16; // тайл = 16 единиц длины (стандартная машина 8 = полтайла)
  // Industry output is stated per economy month, trips are counted per economy year.
  const flowPerYear = Math.max(0, params.productionPerMonth ?? 0) * 12;
  const results: OptimizeResult[] = [];

  const evaluate = (
    engine: Train,
    engineCount: number,
    engineLength: number,
    wagon: Train,
    wagonCount: number,
  ): OptimizeResult | null => {
    const entries: ConsistEntry[] = [
      { train: engine, count: engineCount },
      { train: wagon, count: wagonCount },
    ];

    // Two passes: the first learns the capacity, so the production cap can be applied to
    // the cargo per trip on the second. Trains that outrun their industry keep full-load
    // physics: such a train waits for a full load rather than running light.
    const probe = tripEconomics({ entries, cargo, payment, distanceTiles, meta, game, calc });
    const capacity = probe.capacity;
    if (capacity <= 0) return null;
    if (probe.loadedSpeedInternal <= 2) return null;

    const hauledPerYear = capacity * probe.tripsPerYear;
    const cargoPerTrip =
      flowPerYear > 0 ? Math.min(capacity, flowPerYear / probe.tripsPerYear) : capacity;
    const trainsNeeded =
      flowPerYear > 0 && hauledPerYear > 0 ? Math.max(1, Math.ceil(flowPerYear / hauledPerYear)) : 1;
    const trip =
      cargoPerTrip === capacity && !params.subsidised
        ? probe
        : tripEconomics({
            entries, cargo, payment, distanceTiles, meta, game, calc,
            cargoPerTrip, subsidised: params.subsidised,
          });

    const lengthTiles = (engineLength + wagonCount * wagon.length) / 16;
    const loadedPhysics = consistPhysics(entries, cargo, capacityIndex, game).physics;
    const massOnSlope = loadedPhysics.massT * Math.min(calc.hillTiles / lengthTiles, 1);
    const gradeSpeed = balancingSpeed(loadedPhysics, massOnSlope, game.accelerationModel);

    // How often the station is served decides its rating, and the rating decides how much
    // the industry hands over at all — the money above still assumes the full flow.
    const pickupIntervalDays = trip.roundTripDays / trainsNeeded;
    const stationRating =
      flowPerYear > 0
        ? estimateStationRating({
            pickupIntervalDays,
            maxSpeedInternal: loadedPhysics.maxSpeedInternal,
            cargoPerDay: flowPerYear / (daysPerEconomyYear(game) * effectiveDayLength(game)),
            jgrpp: game.jgrpp,
          })
        : null;

    return {
      engine,
      engineCount,
      wagon,
      wagonCount,
      engineIntro: introAvailability(engine, year, game),
      wagonIntro: introAvailability(wagon, year, game),
      capacity,
      cargoPerTrip,
      trainsNeeded,
      pickupIntervalDays,
      stationRating,
      lengthTiles,
      loadedSpeedMph: internalToMph(trip.loadedSpeedInternal),
      emptySpeedMph: internalToMph(trip.emptySpeedInternal),
      gradeSpeedMph: internalToMph(gradeSpeed),
      loadingDays: trip.loadingDays,
      roundTripDays: trip.roundTripDays,
      tripsPerYear: trip.tripsPerYear,
      incomePerTrip: trip.incomePerTrip,
      runningCostPerYear: trip.runningCostPerYear,
      buyCostTotal: trip.buyCostTotal,
      profitPerYear: trip.profitPerYear,
      paybackYears: trip.paybackYears,
    };
  };

  for (const engine of engines) {
    for (const engineCount of [1, 2]) {
      const engineLength = engineCount * engine.length;
      if (engineLength >= maxLengthUnits) continue;
      for (const wagon of wagons) {
        const maxWagons = Math.floor((maxLengthUnits - engineLength) / wagon.length);
        if (maxWagons <= 0) continue;
        const full = evaluate(engine, engineCount, engineLength, wagon, maxWagons);
        if (!full) continue;
        results.push(full);
        // Filling the station is optimal unless the industry cannot keep up: extra wagons
        // then add cost and weight without adding cargo, so try shorter consists too.
        if (flowPerYear <= 0 || full.capacity * full.tripsPerYear < flowPerYear) continue;
        for (let wagonCount = 1; wagonCount < maxWagons; wagonCount++) {
          const r = evaluate(engine, engineCount, engineLength, wagon, wagonCount);
          if (!r) continue;
          results.push(r);
          if (r.capacity * r.tripsPerYear >= flowPerYear) break;
        }
      }
    }
  }

  // одна строка на «локомотив × число секций»: лучший вагон для него
  // (вагоны одной вместимости различаются только ценой — при равной прибыли берём дешевле)
  const better = (a: OptimizeResult, b: OptimizeResult) => {
    if (Math.abs(a.profitPerYear - b.profitPerYear) > 1) return a.profitPerYear > b.profitPerYear;
    if (Math.abs(a.buyCostTotal - b.buyCostTotal) > 1) return a.buyCostTotal < b.buyCostTotal;
    // близнецы с одинаковыми ТТХ: берём тот вариант, который в игре стоит
    // заголовком группы вариантов, — рандомизированный там спрятан внутри
    return !a.wagon.randomised && b.wagon.randomised;
  };
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
