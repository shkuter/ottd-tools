/**
 * Сборка статистики состава из выбранных машин Iron Horse.
 * Все игровые формулы — в physics.ts/costs.ts, здесь только агрегация.
 */
import type { Cargo, ConsistEntry, Railtype, TrainsMeta } from '../types';
import { consistMoney } from './costs';
import type { ConsistPhysics } from './physics';
import { balancingSpeed } from './physics';
import { poweredOutputOn, trackSpeedLimit, vehicleSpeedOn } from './tracktypes';
import { internalToMphExact, mphToInternal } from './units';
import { activeRailtype, activeRailtypes, canCarryIn, trainCapacity } from '../dataset';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  type CalcSettings,
  type GameSettings,
} from './settings';

/** What handed the consist its speed limit: an engine, a wagon, or the track itself. */
export type SpeedLimitSource = 'engine' | 'wagon' | 'track';

export interface ConsistStats {
  powerHp: number;
  maxTeN: number;
  emptyWeightT: number;
  loadedWeightT: number;
  lengthTiles: number;
  /** Лимит скорости состава, внутренние единицы (null = не ограничен машинами). */
  speedLimitInternal: number | null;
  /**
   * Which of the three candidates the limit came from, or `null` when more than one sits at
   * it — with the engines as slow as their wagons there is nothing to explain, and naming
   * either would be a coin toss.
   */
  speedLimitSource: SpeedLimitSource | null;
  buyCostTotal: number;
  runningCostTotal: number;
  capacityForCargo: number;
  balancingSpeedInternal: number;
  balancingSpeedOnGradeInternal: number;
  numUnits: number;
}

/** The lower of two limits, either of which may be absent — absent means "no limit". */
function minOf(current: number | null, value: number | null): number | null {
  if (current == null) return value;
  if (value == null) return current;
  return Math.min(current, value);
}

/**
 * The candidate that alone sits at the consist's limit. Anything else — a tie between two
 * of them, or no limit at all — answers `null`: the figure is then not one candidate's
 * doing, and pointing at either would be arbitrary.
 */
function speedLimitSourceOf(
  limit: number | null,
  candidates: readonly { source: SpeedLimitSource; value: number | null }[],
): SpeedLimitSource | null {
  if (limit == null) return null;
  const atLimit = candidates.filter((c) => c.value === limit);
  return atLimit.length === 1 ? atLimit[0]!.source : null;
}

export function consistPhysics(
  entries: readonly ConsistEntry[],
  cargo: Cargo | null,
  capacityIndex: number,
  game: GameSettings,
  // no default, here or on `game`: a consist computed without a track would silently read
  // every electric vehicle as making no power at all. `activeRailtype` always answers with
  // one, so there is no null case to carry either.
  track: Railtype,
): {
  physics: ConsistPhysics;
  stats: Omit<ConsistStats, 'balancingSpeedInternal' | 'balancingSpeedOnGradeInternal'>;
} {
  let powerHp = 0;
  let teWeightProduct = 0;
  let emptyWeightT = 0;
  let cargoWeightT = 0;
  let lengthUnits = 0;
  // what the freight multiplier adds to the braked length on top of the consist's own
  // (train_cmd.cpp UpdateAcceleration); the length itself is `lengthUnits`
  let brakingStretchUnits = 0;
  let speedLimitMph: number | null = null;
  // kept split by candidate rather than as one running minimum: the consist's own limit is
  // the lower of the two, and the split is what lets the figure say which one produced it
  let engineLimitInternal: number | null = null;
  let wagonLimitInternal: number | null = null;
  let capacityForCargo = 0;
  let numUnits = 0;

  // the set's own table, needed to tell whether a vehicle draws power on this track at all
  const railtypes = activeRailtypes(game);

  for (const { train, count } of entries) {
    numUnits += count * Math.max(1, train.units.length);
    // what the vehicle actually contributes here: nothing unless the track powers it, and a
    // dual-power engine's electric figure only where the wires are
    const power = poweredOutputOn(train, track, railtypes);
    powerHp += count * power;
    emptyWeightT += count * train.weight_t;
    lengthUnits += count * train.length;
    // tractive effort comes with power, so it follows the track as well: a vehicle that
    // makes no power here pulls nothing (ground_vehicle.cpp: `if (current_power > 0)`)
    if (power > 0) {
      teWeightProduct += count * train.weight_t * train.te_coefficient;
    }
    // both units are tracked: physics keeps using mph (see the note below), the display
    // takes the internal speed straight from the data so it matches the game
    const speed = vehicleSpeedOn(train, track);
    // train_cmd.cpp:185 — a vehicle binds the consist when it is not a wagon or the setting
    // is on (the game also excludes a wagon under a wagon override, which no set the
    // calculator reads uses). It is the kind of vehicle that decides, not whether this track
    // powers it: an electric loco under no wires makes no power and still caps the speed.
    // The game derives that kind from declared power for a NewGRF vehicle
    // (newgrf_act0_trains.cpp: `power == 0` makes it a wagon), which is what `kind` holds;
    // `wagon-speed-limits.test.ts` ("the kind the gate reads") fails if a set ever disagrees.
    if (speed.mph != null && (train.kind !== 'wagon' || game.wagonSpeedLimits)) {
      speedLimitMph = minOf(speedLimitMph, speed.mph);
      const internal = speed.internal ?? mphToInternal(speed.mph);
      if (train.kind === 'wagon') {
        wagonLimitInternal = minOf(wagonLimitInternal, internal);
      } else {
        engineLimitInternal = minOf(engineLimitInternal, internal);
      }
    }
    if (cargo && canCarryIn(game, train, cargo)) {
      const capacity = count * trainCapacity(train, capacityIndex);
      capacityForCargo += capacity;
      // the game walks the units and stretches each loaded freight one by half the
      // multiplier's addition (train_cmd.cpp:1288-1298); a unit that carries nothing of this
      // cargo is left alone, which is why this sits inside the carrying branch. Only under
      // the realistic acceleration model: the original one brakes over the consist's own
      // length whatever the multiplier says (train_cmd.cpp:1281)
      if (
        cargo.is_freight &&
        game.freightTrains > 1 &&
        game.accelerationModel === 'realistic'
      ) {
        const adjust = game.freightTrains - 1;
        for (const unit of train.units) {
          if ((unit.capacities[capacityIndex] ?? 0) > 0) {
            brakingStretchUnits += count * Math.floor((unit.length * adjust + 1) / 2);
          }
        }
      }
      // вес груза: units × weight/16 т; множитель freight_trains — только для
      // грузовых (cargotype.cpp:254 WeightOfNUnitsInTrain)
      const freightMultiplier = cargo.is_freight ? game.freightTrains : 1;
      cargoWeightT += (capacity * freightMultiplier * cargo.weight_16ths) / 16;
    }
  }

  // the track's own limit binds the whole consist, so it is taken once over the finished
  // train rather than per vehicle. Neither vanilla nor Iron Horse states one; a set that
  // grades its track by speed caps the train here, exactly as the game does.
  let speedLimitInternal = minOf(engineLimitInternal, wagonLimitInternal);
  const trackLimit = trackSpeedLimit(track);
  if (trackLimit != null) {
    speedLimitInternal = minOf(speedLimitInternal, trackLimit);
    // the exact conversion, not internalToMph(): this figure feeds the physics, where the
    // truncation the game's display does would lose a unit for good
    speedLimitMph = minOf(speedLimitMph, internalToMphExact(trackLimit));
  }

  return {
    physics: {
      massT: Math.round(emptyWeightT + cargoWeightT),
      powerHp,
      teWeightProduct,
      // deliberately not speed_internal: mphToInternal rounds mph * 1.6 and lands one unit
      // below the real internal speed on fast trains. Swapping it would move the calculated
      // numbers, and this change only touches display (see design.md, Risks)
      maxSpeedInternal: mphToInternal(speedLimitMph ?? 200),
      numParts: numUnits,
      slopeSteepness: game.slopeSteepness,
      brakingLengthUnits: lengthUnits + brakingStretchUnits,
    },
    stats: {
      powerHp,
      maxTeN: Math.floor(teWeightProduct * 9800),
      emptyWeightT,
      loadedWeightT: emptyWeightT + cargoWeightT,
      lengthTiles: lengthUnits / 16, // тайл = 16 единиц длины
      speedLimitInternal,
      // read from the same internal figures the limit itself is built from, so the label
      // can never name a candidate the number did not come from
      speedLimitSource: speedLimitSourceOf(speedLimitInternal, [
        { source: 'engine', value: engineLimitInternal },
        { source: 'wagon', value: wagonLimitInternal },
        { source: 'track', value: trackLimit },
      ]),
      buyCostTotal: 0,
      runningCostTotal: 0,
      capacityForCargo,
      numUnits,
    },
  };
}

export function consistStats(
  entries: readonly ConsistEntry[],
  cargo: Cargo | null,
  capacityIndex: number,
  meta: TrainsMeta,
  game: GameSettings = DEFAULT_GAME_SETTINGS,
  calc: CalcSettings = DEFAULT_CALC_SETTINGS,
): ConsistStats {
  const track = activeRailtype(game, calc.trackType);
  const { physics, stats } = consistPhysics(entries, cargo, capacityIndex, game, track);
  const { buy, running } = consistMoney(entries, meta, game, calc);
  const flat = entries.length ? balancingSpeed(physics, 0, game.accelerationModel) : 0;
  // на уклоне не больше hillTiles тайлов состава
  const massOnSlope =
    physics.massT * Math.min(calc.hillTiles / Math.max(stats.lengthTiles, 0.1), 1);
  const grade = entries.length
    ? balancingSpeed(physics, massOnSlope, game.accelerationModel)
    : 0;
  return {
    ...stats,
    buyCostTotal: buy,
    runningCostTotal: running,
    balancingSpeedInternal: flat,
    balancingSpeedOnGradeInternal: grade,
  };
}
