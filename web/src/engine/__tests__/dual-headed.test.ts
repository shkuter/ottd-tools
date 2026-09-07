/**
 * A dual-headed vehicle is two vehicles in the game, and the calculator has to know which of
 * its figures that doubles and which it does not.
 *
 * The rule is not ours: `engine_type.h` states, field by field, what a multiheaded engine's
 * properties mean — power, purchase cost and running cost are the sum of both halves, while
 * weight and capacity are what one half has. The game then builds the rear half as a second
 * vehicle of the same type (`train_cmd.cpp: AddRearEngineToMultiheadedTrain`), halving power
 * and running cost per half (`train.h: Train::GetPower`, `train_cmd.cpp:
 * Train::GetRunningCost`) and adding the full weight for each of them (`train.h:
 * Train::GetWeight`, which is why `engine.cpp: Engine::GetDisplayWeight` doubles the figure in
 * the purchase window).
 */
import { describe, expect, it } from 'vitest';
import { consistStats } from '../consist';
import { vehicleLengthUnits, vehicleWeightT } from '../vehicle';
import {
  activeCargos,
  activeRailtype,
  activeTrains,
  activeTrainsMeta,
  cargoByLabel,
  trainCapacity,
} from '../../dataset';
import { consistPhysics } from '../consist';
import { optimizeConsists } from '../optimize';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../settings';
import { trainRunningCostPerYear } from '../costs';

const calc = DEFAULT_CALC_SETTINGS;
const SETS = ['vanilla', 'iron_horse'] as const;
const gameOf = (trainSet: (typeof SETS)[number]) => ({ ...DEFAULT_GAME_SETTINGS, trainSet });

describe('what a dual-headed vehicle doubles', () => {
  for (const trainSet of SETS) {
    it(`follows the same rule in ${trainSet}`, () => {
      const roster = activeTrains(gameOf(trainSet));
      const pairs = roster.filter((t) => t.dual_headed);
      expect(pairs.length).toBeGreaterThan(0);
      for (const train of pairs) {
        expect(vehicleLengthUnits(train)).toBe(train.length * 2);
        expect(vehicleWeightT(train)).toBe(train.weight_t * 2);
        expect(trainCapacity(train, calc.capacityIndex)).toBe(
          train.capacities[calc.capacityIndex] * 2,
        );
      }
      // and a single-headed vehicle keeps every figure as the data state it
      const single = roster.find((t) => !t.dual_headed)!;
      expect(vehicleLengthUnits(single)).toBe(single.length);
      expect(vehicleWeightT(single)).toBe(single.weight_t);
    });
  }
});

describe('a consist of one dual-headed vehicle', () => {
  const statsOf = (trainSet: (typeof SETS)[number], id: string) => {
    const game = gameOf(trainSet);
    const train = activeTrains(game).find((t) => t.id === id)!;
    expect(train, `no ${id} in the ${trainSet} roster`).toBeDefined();
    return {
      train,
      stats: consistStats([{ train, count: 1 }], null, calc.capacityIndex, activeTrainsMeta(game), game, calc),
      game,
    };
  };

  it("reads SH '125' as the game's own table does", () => {
    // engines.h: RVI( 6, M,  20, 200,    4500,  70,   190, RC_D,  4, R, D)
    const { train, stats } = statsOf('vanilla', 'vanilla_22');
    expect(stats.powerHp).toBe(4500);
    expect(stats.emptyWeightT).toBe(140);
    expect(stats.lengthTiles).toBe(1);
    expect(stats.numUnits).toBe(2);
    // tractive effort follows the weight of both halves, as PowerChanged sums it per vehicle
    expect(stats.maxTeN).toBe(Math.floor(140 * train.te_coefficient * 9800));
  });

  it('reads Firebird of Iron Horse 4.29.0 with its numbers written out', () => {
    // 3300 hp and 68 t per half in the set, 8 length units per half: the pair is 136 t and a
    // tile long, and the power stays as stated. Written out rather than derived from the data,
    // so that a change on either side of the extractor has to be noticed on purpose.
    const { stats } = statsOf('iron_horse', 'firebird_cab');
    expect(stats.powerHp).toBe(3300);
    expect(stats.emptyWeightT).toBe(136);
    expect(stats.lengthTiles).toBe(1);
    expect(stats.numUnits).toBe(2);
  });

  it('leaves running cost alone: the game halves it per half', () => {
    const { train, stats, game } = statsOf('vanilla', 'vanilla_22');
    expect(stats.runningCostTotal).toBe(
      trainRunningCostPerYear(train, activeTrainsMeta(game), game, calc),
    );
  });
});

/**
 * The sweep is bounded by the length of the station, so a vehicle that occupies two halves has
 * to be measured as the pair it is — otherwise the optimizer offers a consist the game would
 * refuse to let out of the depot.
 */
describe('the sweep measures a dual-headed engine as a pair', () => {
  it('fits fewer wagons behind it than behind the same engine with one head', () => {
    const game = { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' as const, firs: true };
    const roster = activeTrains(game);
    const pair = roster.find((t) => t.id === 'firebird_cab')!;
    expect(pair.dual_headed).toBe(true);
    // the same engine with one head: half the length, everything else identical
    const single = { ...pair, id: `${pair.id}_single`, name: `${pair.name} single`, dual_headed: false };
    const params = {
      // 1970 is inside Firebird's twenty years on sale, and five tiles leave a remainder where
      // the second half costs a whole wagon rather than rounding away
      year: 1970,
      cargo: cargoByLabel.get('COAL')!,
      economyId: 'STEELTOWN',
      maxLengthTiles: 5,
      distanceTiles: 60,
      // unlimited output and the profit goal: the sweep then takes the longest consist the
      // station holds, which is exactly what the length rule decides
      productionPerMonth: 0,
      goal: 'profit' as const,
      maxTrains: 1,
      game,
      calc,
    };
    // one sweep over the roster and the clone, so both engines meet the same wagons
    const rows = optimizeConsists([...roster, single], params, activeTrainsMeta(game), 400);
    const wagonsBehind = (engineId: string) => {
      const row = rows.find((r) => r.engine.id === engineId);
      expect(row, `no row for ${engineId} in the sweep`).toBeTruthy();
      return { count: row!.wagonCount, wagon: row!.wagon.id };
    };
    const asPair = wagonsBehind(pair.id);
    const asSingle = wagonsBehind(single.id);
    expect(asPair.wagon).toBe(asSingle.wagon);
    expect(asPair.count).toBeLessThan(asSingle.count);
  });
});

/**
 * Wagons that agree on every figure the sweep reads are collapsed into one, so the profile has
 * to be told in whole-vehicle terms too: a dual-headed wagon gives the consist twice the length,
 * weight and capacity of one with a single head, and the two must not share a row. No set ships
 * a dual-headed wagon today, which is why the case builds one.
 */
describe('the wagon profile of the sweep', () => {
  it('keeps a dual-headed wagon apart from a single-headed one', () => {
    const game = { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' as const, firs: true };
    const roster = activeTrains(game);
    const params = {
      year: 1970,
      cargo: cargoByLabel.get('COAL')!,
      economyId: 'STEELTOWN',
      maxLengthTiles: 5,
      distanceTiles: 60,
      productionPerMonth: 0,
      goal: 'profit' as const,
      maxTrains: 1,
      game,
      calc,
    };
    // the engine and wagon the sweep itself picks, so both are on sale in this year and gauge
    const meta = activeTrainsMeta(game);
    const best = optimizeConsists(roster, params, meta, 1)[0];
    expect(best).toBeTruthy();
    const { engine, wagon } = best;
    const pairWagon = { ...wagon, id: `${wagon.id}_pair`, name: `${wagon.name} pair`, dual_headed: true };
    const rowFor = (w: typeof wagon) => optimizeConsists([engine, w], params, meta, 1)[0];
    const single = rowFor(wagon);
    const paired = rowFor(pairWagon);
    expect(single).toBeTruthy();
    expect(paired).toBeTruthy();
    // twice as long, so fewer of them fit; twice the hold each, so the train carries the same
    // — which is the point: the sweep reads both figures per vehicle, not one of them
    expect(paired.wagonCount).toBeLessThan(single.wagonCount);
    expect(trainCapacity(pairWagon, calc.capacityIndex)).toBe(
      trainCapacity(wagon, calc.capacityIndex) * 2,
    );
  });
});

/**
 * With realistic braking and a freight multiplier, the game stretches the braking length behind
 * every vehicle that carries (`train_cmd.cpp: UpdateAcceleration`). Both halves of a dual-headed
 * vehicle carry, so both stretch — and no vehicle of either set is both dual-headed and able to
 * take a freight cargo today, which is why the case builds one.
 */
describe('braking stretch of a dual-headed vehicle', () => {
  // Iron Horse, whose data state a capacity per GRF parameter slot for every unit: the vanilla
  // adapter states one slot, so the game's per-unit walk finds nothing there to stretch
  const game = {
    ...DEFAULT_GAME_SETTINGS,
    trainSet: 'iron_horse' as const,
    freightTrains: 2,
    accelerationModel: 'realistic' as const,
  };

  it('is added once per half', () => {
    const roster = activeTrains(game);
    const dual = roster.find((t) => t.dual_headed && trainCapacity(t, calc.capacityIndex) > 0)!;
    expect(dual).toBeDefined();
    const coal = activeCargos(game).find((c) => c.label === 'COAL')!;
    expect(coal.is_freight).toBe(true);
    // the same vehicle taught to carry coal, and the same one with a single head
    const pair = { ...dual, refit: { ...dual.refit, labels_allowed: ['COAL'] } };
    const single = { ...pair, id: `${pair.id}_single`, dual_headed: false };
    const track = activeRailtype(game, calc.trackType);
    const stretchOf = (train: typeof pair) => {
      const { physics } = consistPhysics(
        [{ train, count: 1 }], coal, calc.capacityIndex, game, track,
      );
      return physics.brakingLengthUnits - vehicleLengthUnits(train);
    };
    expect(stretchOf(pair)).toBe(2 * stretchOf(single));
    expect(stretchOf(single)).toBeGreaterThan(0);
  });
});
