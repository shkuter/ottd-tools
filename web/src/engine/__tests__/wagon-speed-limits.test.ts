/**
 * The "wagon speed limits" setting: which vehicles hand the consist their own speed limit.
 *
 * The game gates this per vehicle in `train_cmd.cpp:185` — a vehicle binds the consist when
 * `railveh_type != RAILVEH_WAGON` **or** the setting is on, and only when its limit is not
 * zero. The gate reads the kind of vehicle, never whether this track powers it.
 */
import { describe, expect, it } from 'vitest';
import { activeRailtype, cargoByLabel, trains, trainsMeta } from '../../dataset';
import { consistPhysics } from '../consist';
import { tripEconomics } from '../trip';
import { optimizeConsists } from '../optimize';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../settings';
import { internalToMphExact } from '../units';
import type { Railtype } from '../../types';

const IRON_HORSE = { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' as const };
const WAGONS_FREE = { ...IRON_HORSE, wagonSpeedLimits: false };

const byId = new Map(trains.map((t) => [t.id, t]));
/** 120 mph, plain rail: the fast half of the pair from the reported game. */
const fastEngine = byId.get('zebedee')!;
/** 45 mph: the wagons that bind it. */
const slowWagon = byId.get('bolster_car_pony_gen_1A')!;
/**
 * A wagon the set gave no limit at all — "no limit" is not zero. Plain rail, like the rest
 * of the fixtures: a narrow-gauge wagon behind a mainline engine is a consist the game would
 * not let the player build.
 */
const unlimitedWagon = trains.find(
  (t) => t.kind === 'wagon' && t.speed_mph == null && t.base_track_type === 'RAIL',
)!;
/** Electric, 75 mph: makes no power on plain rail, yet still caps the consist. */
const electricEngine = byId.get('pinhorse')!;
/** 87 mph — faster than `electricEngine`, so the engine is the slow half of that pair. */
const midWagon = byId.get('acid_tank_car_randomised_pony_gen_5A')!;

const rail = activeRailtype(IRON_HORSE, 'RAIL');
const limit = (
  entries: readonly { train: (typeof trains)[number]; count: number }[],
  game = IRON_HORSE,
  track: Railtype = rail,
) => consistPhysics(entries, null, 2, game, track).stats.speedLimitInternal;

describe('what binds the consist', () => {
  it('wagons bind it while the setting is on', () => {
    const entries = [
      { train: fastEngine, count: 1 },
      { train: slowWagon, count: 10 },
    ];
    expect(limit(entries)).toBe(slowWagon.speed_internal);
  });

  it('with the setting off the engine alone decides', () => {
    const entries = [
      { train: fastEngine, count: 1 },
      { train: slowWagon, count: 10 },
    ];
    expect(limit(entries, WAGONS_FREE)).toBe(fastEngine.speed_internal);
  });

  it('an engine slower than its wagons binds them either way', () => {
    const entries = [
      { train: electricEngine, count: 1 },
      { train: midWagon, count: 5 },
    ];
    // the case says nothing unless the wagon really is the faster half
    expect(midWagon.speed_internal!).toBeGreaterThan(electricEngine.speed_internal!);
    expect(limit(entries)).toBe(electricEngine.speed_internal);
    expect(limit(entries, WAGONS_FREE)).toBe(electricEngine.speed_internal);
  });

  it('an engine with no power on this track still caps the speed', () => {
    // pinhorse is electric: on plain rail it contributes nothing but its speed limit
    const entries = [
      { train: electricEngine, count: 1 },
      { train: unlimitedWagon, count: 5 },
    ];
    expect(consistPhysics(entries, null, 2, WAGONS_FREE, rail).stats.powerHp).toBe(0);
    expect(limit(entries, WAGONS_FREE)).toBe(electricEngine.speed_internal);
  });

  it('a wagon without a limit never lowers it, under either setting', () => {
    const withUnlimited = [
      { train: fastEngine, count: 1 },
      { train: unlimitedWagon, count: 5 },
    ];
    expect(limit(withUnlimited)).toBe(fastEngine.speed_internal);
    expect(limit(withUnlimited, WAGONS_FREE)).toBe(fastEngine.speed_internal);
  });

  it("the track's own limit applies whatever the setting says", () => {
    // no set in the data states one, so the case is built from a track that does
    const capped: Railtype = { ...rail, speed_limit_internal: 60 };
    const entries = [
      { train: fastEngine, count: 1 },
      { train: slowWagon, count: 10 },
    ];
    expect(limit(entries, IRON_HORSE, capped)).toBe(60);
    expect(limit(entries, WAGONS_FREE, capped)).toBe(60);
  });
});

describe('the trip the setting changes', () => {
  // the pair from the reported game: a fast engine behind 45 mph wagons over a long haul.
  // A diesel, not `fastEngine`: that one runs off the wires, and plain rail leaves it
  // powerless, which would pin both legs to a crawl instead of to the speed limit.
  const coal = cargoByLabel.get('COAL')!;
  const dieselEngine = byId.get('wyvern')!;
  const hopper = trains.find(
    (t) => t.kind === 'wagon' && t.id.startsWith('coal_hopper_car_type_1_pony') && (t.capacities[2] ?? 0) > 0,
  )!;
  const entries = [
    { train: dieselEngine, count: 1 },
    { train: hopper, count: 8 },
  ];
  const base = {
    entries,
    cargo: coal,
    payment: coal.initial_payment_by_economy.STEELTOWN,
    distanceTiles: 150,
    meta: trainsMeta,
    calc: DEFAULT_CALC_SETTINGS,
  };

  it('a round trip is shorter and yields more trips once wagons stop binding', () => {
    // the case only says anything if the wagons really are the slower half
    expect(internalToMphExact(hopper.speed_internal!)).toBeLessThan(
      internalToMphExact(dieselEngine.speed_internal!),
    );
    const bound = tripEconomics({ ...base, game: IRON_HORSE });
    const free = tripEconomics({ ...base, game: WAGONS_FREE });
    expect(free.loadedSpeedInternal).toBeGreaterThan(bound.loadedSpeedInternal);
    expect(free.roundTripDays).toBeLessThan(bound.roundTripDays);
    expect(free.tripsPerYear).toBeGreaterThan(bound.tripsPerYear);
  });
});

describe('which candidate the limit came from', () => {
  const fastWagon = trains.find((t) => t.kind === 'wagon' && t.speed_mph === 120)!;
  const matchingWagon = trains.find(
    (t) => t.kind === 'wagon' && t.speed_internal === electricEngine.speed_internal,
  )!;
  const source = (
    entries: readonly { train: (typeof trains)[number]; count: number }[],
    game = IRON_HORSE,
    track: Railtype = rail,
  ) => consistPhysics(entries, null, 2, game, track).stats.speedLimitSource;

  it('names the wagons when they are the slow half', () => {
    expect(
      source([
        { train: fastEngine, count: 1 },
        { train: slowWagon, count: 10 },
      ]),
    ).toBe('wagon');
  });

  it('names the engine when it is', () => {
    expect(
      source([
        { train: electricEngine, count: 1 },
        { train: fastWagon, count: 10 },
      ]),
    ).toBe('engine');
  });

  it('names the track when it caps both', () => {
    const capped: Railtype = { ...rail, speed_limit_internal: 60 };
    expect(
      source(
        [
          { train: fastEngine, count: 1 },
          { train: slowWagon, count: 10 },
        ],
        IRON_HORSE,
        capped,
      ),
    ).toBe('track');
  });

  it('names nobody when two candidates tie at the limit', () => {
    // engine and wagons capped at the same figure: neither is the reason on its own
    expect(matchingWagon.speed_internal).toBe(electricEngine.speed_internal);
    expect(
      source([
        { train: electricEngine, count: 1 },
        { train: matchingWagon, count: 10 },
      ]),
    ).toBeNull();
  });

  it('names nobody when all three sit at the limit', () => {
    const capped: Railtype = { ...rail, speed_limit_internal: electricEngine.speed_internal! };
    const entries = [
      { train: electricEngine, count: 1 },
      { train: matchingWagon, count: 4 },
    ];
    expect(consistPhysics(entries, null, 2, IRON_HORSE, capped).stats.speedLimitInternal).toBe(
      electricEngine.speed_internal,
    );
    expect(source(entries, IRON_HORSE, capped)).toBeNull();
  });

  it('has no source to name when nothing limits the consist', () => {
    expect(source([{ train: unlimitedWagon, count: 3 }])).toBeNull();
  });

  it('follows the setting: freed wagons stop being the reason', () => {
    const entries = [
      { train: fastEngine, count: 1 },
      { train: slowWagon, count: 10 },
    ];
    expect(source(entries)).toBe('wagon');
    expect(source(entries, WAGONS_FREE)).toBe('engine');
  });
});

describe('the source travels to the picker', () => {
  const coal = cargoByLabel.get('COAL')!;
  const search = (game: typeof IRON_HORSE) => ({
    year: 1990,
    distanceTiles: 150,
    cargo: coal,
    economyId: 'STEELTOWN',
    maxLengthTiles: 6,
    game,
    calc: DEFAULT_CALC_SETTINGS,
  });

  it('rows can name the wagons, and never do once the setting is off', () => {
    const bound = optimizeConsists(trains, search(IRON_HORSE), trainsMeta, 25);
    const free = optimizeConsists(trains, search(WAGONS_FREE), trainsMeta, 25);
    // an empty search would make the second assertion true for the wrong reason
    expect(free.length).toBeGreaterThan(0);
    // the flag beside a wagon in the picker is exactly this value
    expect(bound.some((r) => r.speedLimitSource === 'wagon')).toBe(true);
    // with wagons freed no row can be bound by one: they hand over no limit at all
    expect(free.some((r) => r.speedLimitSource === 'wagon')).toBe(false);
  });
});

describe('the kind the gate reads', () => {
  it('agrees with the rule the game derives it from', () => {
    // newgrf_act0_trains.cpp: a NewGRF vehicle with no power is a wagon to the game. The gate
    // reads `kind` from the data instead, so a set where the two disagree would be computed
    // against a rule the game does not apply.
    const disagreeing = trains.filter((t) => (t.kind === 'engine') !== ((t.power_hp ?? 0) > 0));
    expect(disagreeing.map((t) => t.id)).toEqual([]);
  });
});
