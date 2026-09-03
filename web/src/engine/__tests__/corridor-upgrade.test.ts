/**
 * Converting a corridor to another track type: does the wire pay for itself?
 *
 * The three acceptance cases come from the game the backlog item was written from — a
 * network electrified wholesale in 1910 that lost money, the same corridor once traffic had
 * grown, and a feeder line that never pays. They are reproduced by shape, not by measurement:
 * what is asserted is the direction of the delta and where the threshold falls.
 */
import { describe, expect, it } from 'vitest';
import {
  activeRailtype,
  activeRailtypes,
  availabilityContext,
  cargoByLabel,
  trains,
  trainsMeta,
} from '../../dataset';
import { corridorUpgrade, loadThreshold, replacementCandidates } from '../corridorUpgrade';
import { railBuildCost, railClearCost, railConvertCost, trainBuyCost } from '../costs';
import { EMPTY_NETWORK, networkMaintenance } from '../infrastructure';
import { standsInBuyMenu } from '../availability';
import { poweredOutputOn } from '../tracktypes';
import { routeWithFlow, type RouteWithFlowParams } from '../trip';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type CalcSettings,
  type GameSettings,
} from '../settings';

const coal = cargoByLabel.get('COAL')!;
const payment = coal.initial_payment_by_economy.STEELTOWN;
const hopper = trains.find(
  (t) => t.kind === 'wagon' && t.id.startsWith('coal_hopper_car_type_1_pony') && (t.capacities[2] ?? 0) > 0,
)!;

/**
 * The sets are off by default (ADR-0004), so a test has to switch them on: the vehicles here
 * are Iron Horse's, and its railtype table is the one that has to price them — reading them
 * against the game's own table would mix two sets' money. Upkeep is off by default too, and
 * a corridor question without it prices only the trains.
 */
const GAME: GameSettings = {
  ...DEFAULT_GAME_SETTINGS,
  trainSet: 'iron_horse',
  firs: true,
  infrastructureMaintenance: true,
};
const CALC: CalcSettings = { ...DEFAULT_CALC_SETTINGS, trackType: 'RAIL', priceYear: 1950 };

// `activeRailtype` falls back to the set's first buildable track for a label it does not
// know, so a renamed label would quietly have this file compare a type with itself
const RAIL = activeRailtype(GAME, 'RAIL');
const ELRL = activeRailtype(GAME, 'ELRL');
const RAILTYPES = activeRailtypes(GAME);

/** Every candidate the block would offer for the wire — diesels included: a plain engine
 *  runs under wires too, and the player is free to electrify and keep it. */
const BUY_MENU = availabilityContext(GAME);
const candidates = replacementCandidates(trains, ELRL, GAME, CALC, BUY_MENU);
/** The ones that only run there: what "electrify" actually means. */
const electrics = candidates.filter((t) => poweredOutputOn(t, RAIL, RAILTYPES) === 0);
/** What hauls the corridor today. */
const current = replacementCandidates(trains, RAIL, GAME, CALC, BUY_MENU)[0]!;

function route(distanceTiles = 100): RouteWithFlowParams {
  return {
    entries: [
      { train: current, count: 1 },
      { train: hopper, count: 14 },
    ],
    cargo: coal,
    payment,
    distanceTiles,
    meta: trainsMeta,
    game: GAME,
    calc: CALC,
    productionPerMonth: 0,
    waitForFullLoad: false,
  };
}

function upgrade(over: Partial<Parameters<typeof corridorUpgrade>[1]> = {}, distance = 100) {
  return corridorUpgrade(route(distance), {
    target: ELRL,
    pieces: 10_000,
    trains: 4,
    replacement: electrics[0]!,
    network: EMPTY_NETWORK,
    ...over,
  });
}

describe('the price of converting a piece of track', () => {
  it('has two different types to convert between', () => {
    expect([RAIL.label, ELRL.label]).toEqual(['RAIL', 'ELRL']);
  });

  it('upgrades rather than rebuilds between related types', () => {
    // rail.h: an eighth of the new build cost plus the extra material, capped by rebuilding
    const build = railBuildCost(ELRL, GAME, CALC.priceYear);
    const upgradeCost = Math.floor(build / 8) + (build - railBuildCost(RAIL, GAME, CALC.priceYear));
    const rebuild = build + railClearCost(RAIL, GAME, CALC.priceYear);
    expect(railConvertCost(RAIL, ELRL, GAME, CALC.priceYear)).toBe(upgradeCost);
    expect(upgradeCost).toBeLessThan(rebuild);
  });

  it('never charges more than clearing and rebuilding', () => {
    for (const from of [RAIL, ELRL]) {
      for (const to of [RAIL, ELRL]) {
        const rebuild = railBuildCost(to, GAME, CALC.priceYear) + railClearCost(from, GAME, CALC.priceYear);
        expect(railConvertCost(from, to, GAME, CALC.priceYear)).toBeLessThanOrEqual(rebuild);
      }
    }
  });

  it('grows with the Base Costs multiplier', () => {
    const huge: GameSettings = { ...GAME, basecostGrf: true, basecostRailConstruction: 8192 };
    expect(railConvertCost(RAIL, ELRL, huge, CALC.priceYear)).toBeGreaterThan(
      railConvertCost(RAIL, ELRL, GAME, CALC.priceYear),
    );
  });

  it('does not wrap where the game would have shifted past 32 bits', () => {
    // the game writes `>> 3`; here it is a division, and this is why. Maglev at the largest
    // Base Costs multiplier, the steepest inflation and the last year the game inflates to
    // takes the product well past 2^31, where a bitwise shift in JS comes back negative.
    const extreme: GameSettings = {
      ...GAME,
      trainSet: 'vanilla',
      basecostGrf: true,
      basecostRailConstruction: 8192,
      constructionCost: 2,
      inflation: true,
      inflationInterest: 4,
      startingYear: 1920,
    };
    const maglev = activeRailtype(extreme, 'MGLV');
    const cost = railBuildCost(maglev, extreme, 2090);
    expect(cost).toBeGreaterThan(2 ** 31);
    expect(Number.isSafeInteger(cost)).toBe(true);
    // and the price built from it stays a positive figure rather than wrapping negative
    const rail = activeRailtype(extreme, 'RAIL');
    expect(railConvertCost(rail, maglev, extreme, 2090)).toBeGreaterThan(0);
  });

  it('rebuilds where the types are unrelated', () => {
    // vanilla monorail powers nothing of plain rail and vice versa, so there is no upgrade
    // to be had: the game charges for clearing one and laying the other
    const vanilla: GameSettings = { ...GAME, trainSet: 'vanilla' };
    const rail = activeRailtype(vanilla, 'RAIL');
    const mono = activeRailtype(vanilla, 'MONO');
    expect(rail.powered).not.toContain('MONO');
    expect(mono.powered).not.toContain('RAIL');
    expect(railConvertCost(rail, mono, vanilla, CALC.priceYear)).toBe(
      railBuildCost(mono, vanilla, CALC.priceYear) + railClearCost(rail, vanilla, CALC.priceYear),
    );
  });

  it('caps what clearing earns at three quarters of the build price', () => {
    // narrow gauge is cheap enough to lay that the cap bites: the base clear price would pay
    // more than the game allows for a piece that cost so little
    const narrow = activeRailtype(GAME, 'NAAN');
    const capped = Math.trunc((-railBuildCost(narrow, GAME, CALC.priceYear) * 3) / 4);
    expect(railClearCost(narrow, GAME, CALC.priceYear)).toBe(capped);
    expect(capped).toBeGreaterThan(railClearCost(RAIL, GAME, CALC.priceYear));
  });

  it('never lets the build price fall to zero', () => {
    // RecomputePrices refuses a zero base price; laying track stays an expense however small
    // the multiplier gets. Smaller than anything the settings tab offers (1/64 leaves the
    // base at 1 already) — the clamp belongs to the game, not to that list
    const tiny: GameSettings = { ...GAME, basecostGrf: true, basecostRailConstruction: 1 / 4096 };
    expect(railBuildCost(RAIL, tiny, CALC.priceYear)).toBeGreaterThan(0);
    expect(railClearCost(RAIL, tiny, CALC.priceYear)).toBeLessThanOrEqual(0);
  });

  it('carries the difficulty multipliers the game states', () => {
    // economy.cpp RecomputePrices: 6/8, 8/8, 9/8 of the base by difficulty
    const at = (constructionCost: 0 | 1 | 2) =>
      railBuildCost(RAIL, { ...GAME, constructionCost }, CALC.priceYear);
    expect(at(1)).toBe(Math.floor((at(0) * 8) / 6));
    expect(at(2)).toBe(Math.floor((at(1) * 9) / 8));
  });

  it('follows inflation like every other price', () => {
    const flat = railConvertCost(RAIL, ELRL, GAME, 2000);
    const inflated = railConvertCost(RAIL, ELRL, { ...GAME, inflation: true }, 2000);
    expect(inflated).toBeGreaterThan(flat);
  });

  it('reads the same inflation model vehicles do', () => {
    // the JGRPP dated model exists only on the patchpack; a flag saved from some other game
    // must not price track by one model and engines by another in the same game
    const off: GameSettings = {
      ...GAME,
      inflation: true,
      jgrpp: false,
      inflationFixedDates: false,
      startingYear: 1950,
    };
    const on: GameSettings = { ...off, inflationFixedDates: true };
    expect(railBuildCost(RAIL, off, 2000)).toBe(railBuildCost(RAIL, on, 2000));
    expect(trainBuyCost(current, trainsMeta, off, CALC)).toBe(
      trainBuyCost(current, trainsMeta, on, CALC),
    );
  });

  it('ignores its Base Costs multiplier while the set is switched off', () => {
    const off: GameSettings = { ...GAME, basecostGrf: false, basecostRailConstruction: 8 };
    expect(railConvertCost(RAIL, ELRL, off, CALC.priceYear)).toBe(
      railConvertCost(RAIL, ELRL, GAME, CALC.priceYear),
    );
  });

  it('is charged at construction difficulty, not at running difficulty', () => {
    // PCAT_CONSTRUCTION (pricebase.h): the knob over these is construction_cost, unlike the
    // upkeep prices for the same track, which sit in PCAT_RUNNING
    const dearer: GameSettings = { ...GAME, constructionCost: 2 };
    const running: GameSettings = { ...GAME, vehicleCosts: 2 };
    expect(railConvertCost(RAIL, ELRL, dearer, CALC.priceYear)).toBeGreaterThan(
      railConvertCost(RAIL, ELRL, GAME, CALC.priceYear),
    );
    expect(railConvertCost(RAIL, ELRL, running, CALC.priceYear)).toBe(
      railConvertCost(RAIL, ELRL, GAME, CALC.priceYear),
    );
  });

  it('has a Base Costs multiplier of its own, which upkeep does not follow', () => {
    const game: GameSettings = { ...GAME, basecostGrf: true, basecostRailConstruction: 8 };
    const network = { ...EMPTY_NETWORK, rail: { RAIL: 1000 } };
    expect(railConvertCost(RAIL, ELRL, game, CALC.priceYear)).toBeGreaterThan(
      railConvertCost(RAIL, ELRL, GAME, CALC.priceYear),
    );
    expect(networkMaintenance(network, RAILTYPES, game, CALC.priceYear).yearly).toBe(
      networkMaintenance(network, RAILTYPES, GAME, CALC.priceYear).yearly,
    );
  });
});

describe('the engines offered as a replacement', () => {
  it('holds only what draws power on the target track', () => {
    for (const train of candidates) {
      expect(train.kind, train.id).toBe('engine');
      expect(poweredOutputOn(train, ELRL, RAILTYPES), train.id).toBeGreaterThan(0);
    }
    // an electric-only engine is offered for the wire and not for plain rail
    expect(candidates).toContain(electrics[0]);
    expect(replacementCandidates(trains, RAIL, GAME, CALC, BUY_MENU)).not.toContain(electrics[0]);
  });

  it('holds only what the year sells', () => {
    const early = replacementCandidates(trains, ELRL, GAME, { ...CALC, priceYear: 1870 }, BUY_MENU);
    for (const train of early) expect(train.intro_year, train.id).toBeLessThanOrEqual(1870);
    expect(early.length).toBeLessThan(candidates.length);
  });

  it('offers what the optimizer would offer, narrowed to purchase entries', () => {
    // the same predicate the search uses (optimize.ts): powered here, and in the buy menu
    const raw = trains.filter(
      (train) =>
        train.kind === 'engine' &&
        poweredOutputOn(train, ELRL, RAILTYPES) > 0 &&
        standsInBuyMenu(train, CALC.priceYear, BUY_MENU),
    );
    expect(candidates.every((train) => raw.includes(train))).toBe(true);
    expect(candidates.length).toBeLessThanOrEqual(raw.length);
    // whatever the roster states in several liveries collapses to one entry; this one states
    // none, so the two lists agree — the narrowing is what keeps a set that does readable
    expect(new Set(raw.map((train) => train.name)).size).toBe(candidates.length);
  });

  it('takes an imported game at its word about what it sells', () => {
    // availability.ts: "the imported game answered this already, and its answer beats any
    // formula" — a list built without the sold ids offers machines that game does not have
    const one = candidates[3]!;
    const sold = availabilityContext(GAME, new Set([one.id]));
    const offered = replacementCandidates(trains, ELRL, GAME, CALC, sold);
    expect(offered.map((train) => train.id)).toEqual([one.id]);
  });

  it('offers one entry per purchase, not one per livery', () => {
    // the roster states the same machine in several liveries; a list of identical names is
    // no choice at all (CONTEXT.md, "Purchase entry")
    const names = candidates.map((train) => train.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('the comparison', () => {
  it('is quicker and richer per train where the new engine is quicker', () => {
    // the wagons cap the speed of a heavy consist, so the case is built to make the engine
    // the binding limit: one wagon, and a replacement with far more power
    const light: RouteWithFlowParams = {
      ...route(),
      entries: [
        { train: current, count: 1 },
        { train: hopper, count: 1 },
      ],
    };
    const strongest = candidates.reduce((a, b) => (b.power_hp > a.power_hp ? b : a));
    const result = corridorUpgrade(light, {
      target: ELRL,
      pieces: 100,
      trains: 1,
      replacement: strongest,
      network: EMPTY_NETWORK,
    })!;
    const yearly = (side: typeof result.before) =>
      side.economics.incomePerTrip * side.economics.tripsPerYear;
    expect(result.after.economics.loadedSpeedInternal).toBeGreaterThan(
      result.before.economics.loadedSpeedInternal,
    );
    expect(result.after.economics.roundTripDays).toBeLessThan(
      result.before.economics.roundTripDays,
    );
    expect(result.after.economics.tripsPerYear).toBeGreaterThan(
      result.before.economics.tripsPerYear,
    );
    expect(yearly(result.after)).toBeGreaterThan(yearly(result.before));
  });

  it('runs a hand-entered leg on both sides', () => {
    // the figure describes the corridor, not the machine: pinning it means the comparison
    // shows money and not time, and the block says so
    const pinned: RouteWithFlowParams = { ...route(), loadedDaysOverride: 40 };
    const strongest = candidates.reduce((a, b) => (b.power_hp > a.power_hp ? b : a));
    const result = corridorUpgrade(pinned, {
      target: ELRL,
      pieces: 100,
      trains: 1,
      replacement: strongest,
      network: EMPTY_NETWORK,
    })!;
    expect(result.before.economics.daysLoaded).toBe(40);
    expect(result.after.economics.daysLoaded).toBe(40);
  });

  it('states the speed on a grade for both sides', () => {
    const result = upgrade()!;
    for (const side of [result.before, result.after]) {
      expect(side.gradeSpeedInternal).toBeGreaterThan(0);
      // the grade is the slower figure; the round trip is not computed from it
      expect(side.gradeSpeedInternal).toBeLessThanOrEqual(side.economics.loadedSpeedInternal);
    }
    expect(result.after.gradeSpeedInternal).not.toBe(result.before.gradeSpeedInternal);
  });

  it('leaves the "as it is" side identical to the route model', () => {
    const result = upgrade()!;
    const plain = routeWithFlow(route());
    expect(result.before.economics).toEqual(plain.economics);
  });

  it('computes nothing without a target, an engine or a length', () => {
    expect(upgrade({ replacement: null })).toBeNull();
    expect(upgrade({ target: RAIL })).toBeNull();
    // a length not given is not a corridor of no length: priced as one, the wire is free
    expect(upgrade({ pieces: 0 })).toBeNull();
  });

  it('bills the corridor as part of the network it is in', () => {
    // the same corridor inside a bigger network costs more to convert: the vanilla growth
    // model prices every piece off the size of the whole
    const alone = upgrade({ network: EMPTY_NETWORK })!;
    const inNetwork = upgrade({
      network: { ...EMPTY_NETWORK, rail: { RAIL: 40_000 } },
    })!;
    expect(inNetwork.maintenanceDelta).toBeGreaterThan(alone.maintenanceDelta);
  });

  it('assumes a corridor the network does not account for, rather than adding it on', () => {
    // a network stating less of the current type than the corridor has is topped up to it —
    // not summed with it, which would price a network half again as large
    const short = upgrade({ pieces: 10_000, network: { ...EMPTY_NETWORK, rail: { RAIL: 300 } } })!;
    const none = upgrade({ pieces: 10_000, network: EMPTY_NETWORK })!;
    const summed = upgrade({
      pieces: 10_000,
      network: { ...EMPTY_NETWORK, rail: { RAIL: 10_300 } },
    })!;
    expect(short.maintenanceDelta).toBe(none.maintenanceDelta);
    expect(short.maintenanceDelta).not.toBe(summed.maintenanceDelta);
  });

  it('charges nothing for track when upkeep is off in the game', () => {
    const off = corridorUpgrade(
      { ...route(), game: { ...GAME, infrastructureMaintenance: false } },
      {
        target: ELRL,
        pieces: 10_000,
        trains: 4,
        replacement: electrics[0]!,
        network: EMPTY_NETWORK,
      },
    )!;
    expect(off.maintenanceDelta).toBe(0);
    expect(off.yearlyDelta).toBe(off.gainPerTrain * 4);
  });

  it('asks the full price of the engines, and none when the engine stays', () => {
    const swapped = upgrade()!;
    expect(swapped.engineCapital).toBeGreaterThan(0);
    const kept = upgrade({ replacement: current })!;
    expect(kept.engineCapital).toBe(0);
    expect(kept.capital).toBe(kept.trackCapital);
  });
});

describe('the corridor is measured in track pieces', () => {
  it('prices a double-track corridor above a single-track one of the same tiles', () => {
    // 100 tiles of double track is 200 pieces; entering the tiles would halve the answer
    const single = upgrade({ pieces: 100 })!;
    const double = upgrade({ pieces: 200 })!;
    expect(double.maintenanceDelta).toBeGreaterThan(single.maintenanceDelta);
    expect(double.trackCapital).toBe(single.trackCapital * 2);
  });
});

describe('the load threshold', () => {
  it('is the first whole train at which the year turns positive', () => {
    expect(loadThreshold(10, 100)).toBe(11);
    expect(loadThreshold(10, 0)).toBe(1);
    expect(loadThreshold(10, -50)).toBe(1);
  });

  it('does not exist when even one train cannot carry it', () => {
    expect(loadThreshold(0, 100)).toBeNull();
    expect(loadThreshold(-5, 0)).toBeNull();
  });

  it('is one train where the track alone pays, whatever the trains do', () => {
    // converting onto cheaper track: no gain per train, but the network costs less to own
    expect(loadThreshold(0, -100)).toBe(1);
    expect(loadThreshold(-5, -100)).toBe(1);
  });

  it('says one train, not "never", when a downgrade pays with the same engine', () => {
    const down = corridorUpgrade(
      { ...route(), calc: { ...CALC, trackType: 'ELRL' } },
      {
        target: RAIL,
        pieces: 10_000,
        trains: 1,
        replacement: current,
        network: EMPTY_NETWORK,
      },
    )!;
    expect(down.gainPerTrain).toBe(0);
    expect(down.maintenanceDelta).toBeLessThan(0);
    expect(down.yearlyDelta).toBeGreaterThan(0);
    expect(down.threshold).toBe(1);
    expect(down.breakEvenYear).not.toBeNull();
  });

  it('is where the delta actually changes sign', () => {
    const result = upgrade()!;
    if (result.threshold == null) {
      expect(result.gainPerTrain).toBeLessThanOrEqual(0);
      return;
    }
    const at = (n: number) => n * result.gainPerTrain - result.maintenanceDelta;
    expect(at(result.threshold)).toBeGreaterThan(0);
    expect(at(result.threshold - 1)).toBeLessThanOrEqual(0);
  });
});

describe('the cases that cost two rollbacks', () => {
  it('loses on a long corridor under thin traffic', () => {
    // 1910: ten thousand pieces of wire paid for by a handful of trains
    const result = upgrade({ pieces: 10_000, trains: 4 })!;
    expect(result.yearlyDelta).toBeLessThan(0);
    expect(result.threshold == null || result.threshold > 4).toBe(true);
    expect(result.breakEvenYear).toBeNull();
  });

  it('sits near zero at the threshold itself', () => {
    // 1986: "positive or thereabouts" — one train's worth of gain above nothing
    const probe = upgrade()!;
    if (probe.threshold == null) throw new Error('no threshold to stand on');
    const result = upgrade({ trains: probe.threshold })!;
    expect(result.yearlyDelta).toBeGreaterThan(0);
    expect(result.yearlyDelta).toBeLessThanOrEqual(result.gainPerTrain);
  });

  it('pays with the engine unchanged when the set gives it more under the wire', () => {
    // a dual-power machine is the answer the block exists to find: nothing is bought, the
    // corridor is the only capital, and the same train pulls harder because the wire feeds it
    const dual = trains.find((train) => train.id === 'shoebox')!;
    expect(dual.power_by_source).toMatchObject({ DIESEL: 950, OHLE: 2500 });
    // long and heavy, and in a year the machine is sold in: with a light train the wagons cap
    // the speed and the second power figure buys nothing
    const heavy: RouteWithFlowParams = {
      ...route(),
      entries: [
        { train: dual, count: 1 },
        { train: hopper, count: 60 },
      ],
      calc: { ...CALC, priceYear: 1963 },
    };
    const result = corridorUpgrade(heavy, {
      target: ELRL,
      pieces: 1_000,
      trains: 20,
      replacement: dual,
      network: EMPTY_NETWORK,
    })!;
    expect(result.gainPerTrain).toBeGreaterThan(0);
    expect(result.engineCapital).toBe(0);
    expect(result.capital).toBe(result.trackCapital);
    expect(result.threshold).not.toBeNull();
  });

  it('never pays with an engine the target track does nothing for', () => {
    // the 1910 trap: wire strung over the network, hauled by machines that gain nothing from
    // it. No gain per train, so no number of them and no length of corridor turns it round.
    expect(current.power_by_source?.OHLE ?? 0).toBeLessThanOrEqual(
      current.power_by_source?.DIESEL ?? current.power_hp,
    );
    for (const pieces of [12, 1_000, 10_000]) {
      for (const trains of [1, 50, 500]) {
        const result = upgrade({ pieces, trains, replacement: current })!;
        expect(result.gainPerTrain).toBe(0);
        expect(result.yearlyDelta, `${pieces}/${trains}`).toBeLessThanOrEqual(0);
        expect(result.threshold).toBeNull();
        expect(result.breakEvenYear).toBeNull();
      }
    }
  });

  it('adds no upkeep at all on twelve pieces outside a network', () => {
    // both sides truncate to the same whole pound a month, so the game charges the same:
    // what a short line gains or loses is then entirely the doing of its trains
    const result = upgrade({ pieces: 12, trains: 1 }, 12)!;
    expect(result.maintenanceDelta).toBe(0);
    expect(result.yearlyDelta).toBe(result.gainPerTrain);
  });
});
