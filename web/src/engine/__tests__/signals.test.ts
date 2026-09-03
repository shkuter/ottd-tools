/**
 * Signal density: how far apart signals are worth standing, and what the extra ones cost.
 *
 * The braking figures are checked against the game's own arithmetic rather than against
 * measurements: JGRPP plans braking from a cached deceleration (train_cmd.cpp:1266-1352) and
 * covers `v² / (2 × decel)` position units doing it (:901-918), sixteen of which make a tile.
 * The money side is the upkeep model already checked against the infrastructure window of a
 * real game, so the acceptance figure here is the difference of two of its references.
 */
import { describe, expect, it } from 'vitest';
import { brakingDeceleration, brakingDistanceTiles, type ConsistPhysics } from '../physics';
import { signalPlan, type SignalDensityInputs } from '../signals';
import { EMPTY_NETWORK, type NetworkCounts } from '../infrastructure';
import { activeRailtype, cargoByLabel, trains } from '../../dataset';
import { consistPhysics } from '../consist';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type CalcSettings,
  type GameSettings,
} from '../settings';

const coal = cargoByLabel.get('COAL')!;

/** The reference game of the upkeep tests: JGRPP, linear growth, its own price year. */
const GAME: GameSettings = {
  ...DEFAULT_GAME_SETTINGS,
  jgrpp: true,
  brakingModel: 'realistic',
  infrastructureMaintenance: true,
  linearMaintenance: true,
  vehicleCosts: 1,
  inflation: true,
};
const CALC: CalcSettings = { ...DEFAULT_CALC_SETTINGS, priceYear: 1926 };
/** currency.cpp:52 — the window showed roubles, fifty to the pound. */
const ROUBLE = 50;

/** A freight consist heavy enough to brake below the cap: 900 t, ten tiles of train. */
function consist(overrides: Partial<ConsistPhysics> = {}): ConsistPhysics {
  return {
    massT: 900,
    powerHp: 1500,
    teWeightProduct: 300,
    maxSpeedInternal: 100,
    numParts: 20,
    slopeSteepness: 3,
    brakingLengthUnits: 160,
    ...overrides,
  };
}

function inputs(overrides: Partial<SignalDensityInputs> = {}): SignalDensityInputs {
  return {
    physics: consist(),
    lengthTiles: 10,
    speedInternal: 100,
    descentLevels: 0,
    track: activeRailtype(GAME, 'RAIL'),
    network: net(1612),
    ...overrides,
  };
}

/** Short, powerful and light: it brakes harder than any cap allows, so the cap answers. */
const brisk = () => consist({ massT: 60, powerHp: 3000, brakingLengthUnits: 32 });

describe('braking distance', () => {
  it('matches the figure the game itself quotes: 160 km/h at 130 stops in ~6.2 tiles', () => {
    // a consist tuned so its own deceleration lands on the 130 the game's comment names
    // (ground_vehicle.cpp:278-280), then measured through the real function: what is checked
    // is the conversion from the game's position units to tiles
    const game = { ...GAME, trainAccBrakingPercent: 109 }; // floor(109 × 120 / 100) = 130
    expect(brakingDeceleration(brisk(), game, 0)).toBe(130);
    expect(brakingDistanceTiles(brisk(), game, 160, 0, 0)).toBeCloseTo(6.15, 1);
  });

  it('a heavier consist takes longer to stop', () => {
    const light = brakingDistanceTiles(consist({ massT: 450 }), GAME, 100, 0, 0);
    const heavy = brakingDistanceTiles(consist({ massT: 1800 }), GAME, 100, 0, 0);
    expect(heavy).toBeGreaterThan(light);
  });

  it('the deceleration cap is 120 on plain rail at 100%, and steps by track type', () => {
    // the cap is the track's, not the train's
    expect(brakingDeceleration(brisk(), GAME, 0)).toBe(120);
    expect(brakingDeceleration(brisk(), GAME, 1)).toBe(168); // monorail
    expect(brakingDeceleration(brisk(), GAME, 2)).toBe(216); // maglev
    expect(brakingDeceleration(brisk(), { ...GAME, trainAccBrakingPercent: 50 }, 0)).toBe(60);
  });

  it('the cap is computed in integers, as the game computes it', () => {
    // 115% of 120 is 138 exactly; a detour through a fraction lands on 137
    expect(brakingDeceleration(brisk(), { ...GAME, trainAccBrakingPercent: 115 }, 0)).toBe(138);
  });

  it('the original acceleration model divides before it multiplies, as the game does', () => {
    const game = { ...GAME, accelerationModel: 'original' as const };
    // train_cmd.cpp:1274 — `power / weight * 4` on integers: 1500/900 is 1, so 4, not 6
    const c = consist({ massT: 900, powerHp: 1500 });
    expect(brakingDeceleration(c, game, 0)).toBe(14); // floor(4 × 7 / 2)
  });

  it('a descent lengthens the distance, and only under realistic acceleration', () => {
    const level = brakingDistanceTiles(consist(), GAME, 100, 0, 0);
    const down = brakingDistanceTiles(consist(), GAME, 100, 32, 0);
    expect(down).toBeGreaterThan(level);
    // worked out by hand from the game's formula for this consist: air drag 80, uncapped
    // deceleration 132 (the descent branch uses it, not the 120 cap), so
    // (100² + 32 world units × 111 × steepness 3) / (2 × 132) = 78 position units, and
    // 78 / 16 = 4.875 tiles
    expect(down).toBeCloseTo(4.875, 3);

    const original = { ...GAME, accelerationModel: 'original' as const };
    expect(brakingDistanceTiles(consist(), original, 100, 32, 0)).toBe(
      brakingDistanceTiles(consist(), original, 100, 0, 0),
    );
  });

  it('a climb never shortens it', () => {
    // the game has no branch for it at all: a climb is the level figure
    expect(brakingDistanceTiles(consist(), GAME, 100, 0, 0)).toBe(
      brakingDistanceTiles(consist(), GAME, 100, -32, 0),
    );
  });

  it('maglev brakes by its own branch', () => {
    // uncapped, so the branch shows rather than the cap: a heavy consist stays below both
    const heavy = consist({ massT: 4000, powerHp: 800 });
    expect(brakingDeceleration(heavy, GAME, 2)).not.toBe(brakingDeceleration(heavy, GAME, 0));
  });

  it('the freight weight multiplier lengthens braking, and only under realistic acceleration', () => {
    // the game stretches the braked length of loaded freight units (train_cmd.cpp:1288-1298),
    // which `consistPhysics` folds into brakingLengthUnits; a longer braked length brakes
    // harder, so the distance falls
    // heavy enough that the cap is not what answers: a light train brakes at the cap either
    // way and the multiplier would be invisible
    const plain = consist({ massT: 4000, powerHp: 800, brakingLengthUnits: 160 });
    const stretched = consist({ massT: 4000, powerHp: 800, brakingLengthUnits: 240 });
    expect(brakingDistanceTiles(stretched, GAME, 100, 0, 0)).toBeLessThan(
      brakingDistanceTiles(plain, GAME, 100, 0, 0),
    );
  });
});

describe('the braked length of a real consist', () => {
  // the loop in consistPhysics is what feeds every figure above, so it is measured here on
  // vehicles of the set rather than on a hand-written physics object
  const track = activeRailtype(GAME, 'RAIL');
  const hopper = trains.find(
    (t) =>
      t.kind === 'wagon' &&
      t.id.startsWith('coal_hopper_car_type_1_pony') &&
      (t.capacities[2] ?? 0) > 0,
  )!;
  const engine = trains.filter((t) => t.kind === 'engine' && t.power_hp > 0)[0]!;
  const entries = [
    { train: engine, count: 1 },
    { train: hopper, count: 10 },
  ];

  it('is the consist length until the freight multiplier stretches it', () => {
    const plain = consistPhysics(entries, coal, 2, GAME, track).physics;
    const heavy = consistPhysics(entries, coal, 2, { ...GAME, freightTrains: 4 }, track).physics;
    expect(plain.brakingLengthUnits).toBe(
      entries.reduce((total, e) => total + e.count * e.train.length, 0),
    );
    expect(heavy.brakingLengthUnits).toBeGreaterThan(plain.brakingLengthUnits);
  });

  it('the multiplier does not stretch it under the original acceleration model', () => {
    // train_cmd.cpp:1281 — that branch brakes over the consist's own length
    const game = { ...GAME, freightTrains: 4, accelerationModel: 'original' as const };
    const original = consistPhysics(entries, coal, 2, game, track).physics;
    const plain = consistPhysics(entries, coal, 2, GAME, track).physics;
    expect(original.brakingLengthUnits).toBe(plain.brakingLengthUnits);
  });
});

describe('useful spacing', () => {
  it('is longer than the braking distance: the train has to fit in the block too', () => {
    const { usefulSpacing: spacing, brakingTiles } = signalPlan(inputs(), { game: GAME, calc: CALC })!;
    expect(brakingTiles).toBeGreaterThan(0);
    // the train and the sighting distance are in it besides the braking distance: a block
    // that cannot hold the train does not clear in time either
    expect(spacing).toBeGreaterThan(brakingTiles + 10);
  });

  it('falls back to the train length under the original braking model', () => {
    const game = { ...GAME, brakingModel: 'original' as const };
    const { usefulSpacing: spacing, brakingTiles } = signalPlan(inputs(), { game: game, calc: CALC })!;
    expect(brakingTiles).toBe(0);
    expect(spacing).toBe(10);
  });

  it('a lower scaling factor lengthens the distance and widens the spacing', () => {
    // the scenario the spec states: the cap falls, so the train plans a gentler stop
    const slow = { ...GAME, trainAccBrakingPercent: 50 };
    expect(brakingDistanceTiles(consist(), slow, 100, 0, 0)).toBeGreaterThan(
      brakingDistanceTiles(consist(), GAME, 100, 0, 0),
    );
    expect(signalPlan(inputs(), { game: slow, calc: CALC })!.usefulSpacing).toBeGreaterThan(
      signalPlan(inputs(), { game: GAME, calc: CALC })!.usefulSpacing,
    );
  });

  it('off the patchpack the saved realistic setting does not apply', () => {
    const vanilla = { ...GAME, jgrpp: false };
    expect(signalPlan(inputs(), { game: vanilla, calc: CALC })!.brakingTiles).toBe(0);
  });
});

describe('the descent as the reservation check states it', () => {
  it('the spacing overestimates the drop by a quarter, as the game does', () => {
    // train_cmd.cpp:4381 — the check the spacing follows widens delta_z before it measures,
    // to allow for a descent that is not uniform. Four levels are 32 world units, planned as
    // 40, giving (100² + 40 × 111 × 3) / (2 × 132) = 88 units = 5.5 tiles
    const plan = signalPlan(inputs({ descentLevels: 4 }), { game: GAME, calc: CALC })!;
    expect(plan.brakingTiles).toBeCloseTo(5.5, 3);
  });
});

describe('what the density costs', () => {
  it('prices the thinning the player did by hand: 1 612 to 723 is 11 345 400 a year', () => {
    // both figures come from the infrastructure window of the game the backlog item was
    // written from, and stand as references in infrastructure.test.ts
    const yearly = (signals: number) => {
      const plan = signalPlan(inputs({ network: net(signals) }), { game: GAME, calc: CALC })!;
      return plan.yearlyNow * ROUBLE;
    };
    expect(yearly(1612)).toBe(20_571_600);
    expect(yearly(723)).toBe(9_226_200);
    expect(yearly(1612) - yearly(723)).toBe(11_345_400);
  });

  it('offers its own thinning, and it lands near the one the player found', () => {
    // the model is not asked to reproduce 723 — that is what a player settled on by eye. It
    // asks for 738 off the same network and offers 11 154 000 a year, two per cent from the
    // figure the game actually saved
    const plan = signalPlan(inputs({ network: net(1612) }), { game: GAME, calc: CALC })!;
    expect(plan.recommendedSignals).toBe(738);
    expect(plan.yearlySaving * ROUBLE).toBe(11_154_000);
  });

  it('a line shorter than one useful block still keeps a signal', () => {
    // rounding to none would offer to save the whole bill for signalling nothing at all
    const tiny = signalPlan(
      inputs({ network: { ...EMPTY_NETWORK, rail: { RAIL: 4 }, signals: 6 } }),
      { game: GAME, calc: CALC },
    )!;
    expect(tiny.recommendedSignals).toBe(1);
  });

  it('the current spacing is pieces over signal heads', () => {
    const plan = signalPlan(inputs(), { game: GAME, calc: CALC })!;
    // 10 372 pieces and 1 612 heads is one per six, the density the game was played at
    expect(plan.currentSpacing).toBeCloseTo(6.43, 2);
  });

  it('counts only the pieces of types this set defines', () => {
    // a count left in the inputs under an earlier set's label is not track this company owns,
    // exactly as the upkeep model reads it
    const stale = signalPlan(
      inputs({ network: { ...net(1612), rail: { RAIL: 10372, XXXX: 50000 } } }),
      { game: GAME, calc: CALC },
    )!;
    expect(stale.recommendedSignals).toBe(signalPlan(inputs(), { game: GAME, calc: CALC })!.recommendedSignals);
  });

  it('sparser than useful warns instead of offering a saving', () => {
    const plan = signalPlan(inputs({ network: net(120) }), { game: GAME, calc: CALC })!;
    expect(plan.tooSparse).toBe(true);
    expect(plan.yearlySaving).toBe(0);
  });

  it('a network with no signals still gets a recommendation', () => {
    const plan = signalPlan(inputs({ network: net(0) }), { game: GAME, calc: CALC })!;
    expect(plan.currentSpacing).toBeNull();
    expect(plan.yearlyNow).toBe(0);
    expect(plan.recommendedSignals).toBeGreaterThan(0);
  });

  it('a network with no length is not a network of zero', () => {
    expect(signalPlan(inputs({ network: { ...EMPTY_NETWORK, signals: 500 } }), { game: GAME, calc: CALC })).toBeNull();
  });

  it('upkeep switched off in the game costs nothing and saves nothing', () => {
    const game = { ...GAME, infrastructureMaintenance: false };
    const plan = signalPlan(inputs(), { game: game, calc: CALC })!;
    expect(plan.yearlyNow).toBe(0);
    expect(plan.yearlySaving).toBe(0);
  });
});

describe('the game the backlog item was written from', () => {
  it('a long freight train asks for about the spacing that game settled on', () => {
    // the line carried long, heavy trains: two engines and forty hoppers, eleven tiles of
    // train. What the player found by hand was one signal per fourteen pieces — 723 of them
    // on 10 372 — and that is what the model asks for from the same train
    const long = consist({ massT: 1124, brakingLengthUnits: 176, maxSpeedInternal: 72 });
    const plan = signalPlan(
      inputs({ physics: long, lengthTiles: 11, speedInternal: 72 }),
      { game: GAME, calc: CALC },
    )!;
    expect(plan.usefulSpacing).toBeGreaterThan(12);
    expect(plan.usefulSpacing).toBeLessThan(16);
    expect(plan.recommendedSignals).toBeGreaterThan(700);
    expect(plan.recommendedSignals).toBeLessThan(800);
  });

  it('a short train asks for signals closer together, and that is not a contradiction', () => {
    // the useful spacing belongs to the train, not to the network: a four-tile consist stops
    // in a fraction of the distance, so blocks may be shorter before they stop paying
    const short = consist({ massT: 418, brakingLengthUnits: 64, maxSpeedInternal: 72 });
    const plan = signalPlan(
      inputs({ physics: short, lengthTiles: 4, speedInternal: 72 }),
      { game: GAME, calc: CALC },
    )!;
    expect(plan.usefulSpacing).toBeLessThan(8);
  });
});

function net(signals: number): NetworkCounts {
  return { ...EMPTY_NETWORK, rail: { RAIL: 10372 }, signals };
}
