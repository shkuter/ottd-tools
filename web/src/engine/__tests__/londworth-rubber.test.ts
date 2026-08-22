/**
 * Reference scenario measured against a real game: rubber from Nentbourne Wharf to the
 * Sardham Tyre Plant, June 1989, in the save `Londworth Transport, 1989-06-23`.
 *
 * What the game says (station window, train details, timetable and the savegame chunks):
 *
 * - consist: 1 × Rat + 14 × Volatiles Tanker, 24 000 l each -> 336 units, 240 t empty,
 *   576 t loaded, 5.7 tiles, 72 km/h, running cost 559 900 ₽/year (10 ₽ to the internal unit,
 *   so 55 990 internal);
 * - route: station (390,477) to station (471,307) = 251 tiles apart, two trains, neither
 *   under a full-load order;
 * - source: Nentbourne Wharf, 272 000 l of rubber a month, "normal" production level;
 * - station: rubber rating 147/255 = 57 %, 171 units received a month, trains aged 10 years.
 *
 * The scenario is here to keep the model honest about a route the player actually ran, not to
 * pin exact figures: the tolerances are the recorded distance between model and game.
 */
import { describe, expect, it } from 'vitest';
import { cargoByLabel, trains, trainsMeta } from '../../dataset';
import { tripBranches, tripSetup } from '../trip';
import { consistStats } from '../consist';
import { flowPerYearFromMonthly, routeStationRating, settleBranchFlows } from '../waiting';
import { cargoPaymentRate } from '../income';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../settings';

/** The player's Advanced Settings for this game. */
const game = {
  ...DEFAULT_GAME_SETTINGS,
  jgrpp: true,
  dayLengthFactor: 5,
  vehicleCosts: 2 as const,
  constructionCost: 2 as const,
  subsidyMultiplier: 2 as const,
  basecostGrf: true,
  basecostLocomotive: 2,
  basecostWagon: 2,
  startingYear: 1860,
};
const calc = DEFAULT_CALC_SETTINGS;

const rubber = cargoByLabel.get('RUBR')!;
const engine = trains.find((t) => t.id === 'rat')!;
const wagon = trains.find((t) => t.id === 'volatiles_tank_car_type_1_pony_gen_2B')!;
const entries = [
  { train: engine, count: 1 },
  { train: wagon, count: 14 },
];
const DISTANCE_TILES = 251;
const FLEET = 2;
const PRODUCTION_PER_MONTH = 272;
/** Age of both locomotives, which the station rating pays a bonus for. */
const TRAIN_AGE_YEARS = 10;

/** The whole route in both loading branches, the way the optimizer assembles it. */
function scenario() {
  const payment = cargoPaymentRate(rubber, 'STEELTOWN', game, calc);
  const setup = tripSetup({
    entries, cargo: rubber, payment, distanceTiles: DISTANCE_TILES, meta: trainsMeta, game, calc,
  });
  const flowPerYear = flowPerYearFromMonthly(PRODUCTION_PER_MONTH);
  // The rating reads the consist's speed limit, as the game does: `last_speed` is set from
  // `vcache.cached_max_speed` when a train loads (`economy.cpp`), not from how fast it ran.
  const ratingOf = routeStationRating(flowPerYear, game, TRAIN_AGE_YEARS);
  const ratingAt = (pickupIntervalDays: number) =>
    ratingOf(pickupIntervalDays, setup.loadedPhysics.maxSpeedInternal);
  // Both branches settled the way both tabs settle them.
  const flows = settleBranchFlows({
    physicalRoundTripDays: setup.roundTripDays,
    tripsPerYear: setup.tripsPerYear,
    capacity: setup.capacity,
    fleetSize: FLEET,
    flowPerYear,
    game,
    ratingAt,
  });
  const physicalRating = flows.runsWithWhatAccumulated.rating!;
  const settled = flows.waitsForFullLoad;
  const branches = tripBranches(setup, {
    cargo: rubber, payment, distanceTiles: DISTANCE_TILES, game, fleetSize: FLEET,
    cargoPerTrip: flows.cargoPerTrip,
    offeredPerYear: settled.offeredPerYear,
  });
  const hauled = (t: { cargoPerTrip: number; tripsPerYear: number }) =>
    t.cargoPerTrip * t.tripsPerYear * FLEET;
  return { setup, physicalRating, settled, branches, hauled };
}

describe('эталон: каучук с причала Nentbourne на завод покрышек Sardham', () => {
  it('состав считается тем же, что в игре', () => {
    const stats = consistStats(entries, rubber, calc.capacityIndex, trainsMeta, game, calc);
    expect(stats.capacityForCargo).toBe(336);
    expect(stats.emptyWeightT).toBe(240);
    expect(stats.loadedWeightT).toBe(576);
    // The game rounds the length to one decimal: 5.625 shows as 5.7 tiles.
    expect(stats.lengthTiles).toBeCloseTo(5.625, 3);
  });

  it('расходы состава сходятся с окном поезда', () => {
    const { setup } = scenario();
    // 559 900 ₽ at 10 ₽ to the internal unit.
    expect(setup.running).toBeGreaterThan(55_990 * 0.99);
    expect(setup.running).toBeLessThan(55_990 * 1.01);
  });

  it('круг рейса — в пределах таймтейбла партии', () => {
    const { setup } = scenario();
    // Timetable: 7520 + 7332 ticks of travel plus 2 × 188 standing = 15 228 ticks / 74 = 205.8
    // engine days. The model comes out ~4 % short because the track is not a straight line and
    // the trains accelerate and brake, neither of which it accounts for.
    const timetableDays = (7520 + 7332 + 2 * 188) / 74;
    expect(setup.roundTripDays).toBeGreaterThan(timetableDays * 0.9);
    expect(setup.roundTripDays).toBeLessThan(timetableDays * 1.05);
  });

  it('доля вывоза близка к рейтингу станции в партии', () => {
    const { physicalRating } = scenario();
    // The game settled at 147/255 = 57.4 %; the model reads ~10 rating points higher,
    // which is ~4 percentage points of the delivered share (`design.md`).
    expect(physicalRating.rating).toBeGreaterThan(147 * 0.95);
    expect(physicalRating.rating).toBeLessThan(147 * 1.10);
    expect(physicalRating.parts.speed).toBe(0); // 72 internal is below the 85 bonus floor
  });

  it('вывоз ветки без ожидания сходится с приходом на станцию', () => {
    const { branches, hauled } = scenario();
    // The station window reports 171 units of rubber received a month = 2052 a year.
    const observedPerYear = 171 * 12;
    const modelled = hauled(branches.runsWithWhatAccumulated);
    expect(Math.abs(modelled - observedPerYear) / observedPerYear).toBeLessThan(0.05);
    // Neither train fills up: the source is slower than the fleet, which is exactly the
    // situation a full-load order would punish.
    expect(branches.runsWithWhatAccumulated.cargoPerTrip).toBeLessThan(branches.waitsForFullLoad.capacity / 2);
  });

  it('полная загрузка на этом маршруте отняла бы вывоз', () => {
    const { branches, settled, physicalRating, hauled } = scenario();
    expect(branches.differ).toBe(true);
    expect(branches.waitsForFullLoad.waitDays).toBeGreaterThan(0);
    // Standing for a full load stretches the interval, which drops the rating, which shrinks
    // the flow: the branch the player removed in game.
    expect(settled.rating!.rating).toBeLessThan(physicalRating.rating);
    const withoutOrder = hauled(branches.runsWithWhatAccumulated);
    const withOrder = hauled(branches.waitsForFullLoad);
    expect(withOrder).toBeLessThan(withoutOrder);
    // Removing the order lifts throughput by ~90 % here. The player's own "about 60 %" was
    // measured earlier in the game, at a different production level, so it is not a check on
    // this figure — these bounds are a regression fence around the computed one (design.md).
    const lift = withoutOrder / withOrder - 1;
    expect(lift).toBeGreaterThan(0.5);
    expect(lift).toBeLessThan(1.3);
  });
});
