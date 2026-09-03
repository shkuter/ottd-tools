/**
 * How many signals a line is worth, and what the extra ones cost.
 *
 * Not "are there enough signals" but "is there any point in the ones that stand": under
 * realistic braking a train's reservation has to cover its whole braking distance
 * (train_cmd.cpp IsReservationLookAheadLongEnough), so the stretch ahead of it is never
 * shorter than that distance however many signals sit on it. Signals closer together than
 * that add almost no capacity, and upkeep is billed for every head.
 */

import type { Railtype } from '../types';
import { activeRailtype, activeRailtypes } from '../dataset';
import { HEIGHT_LEVEL_UNITS, brakingDistanceTiles, type ConsistPhysics } from './physics';
import { tripSetup, type RouteWithFlowParams } from './trip';
import {
  SIGNAL_MULTIPLIER,
  categoryMonthlyCost,
  type NetworkCounts,
} from './infrastructure';
import {
  DEFAULT_CALC_SETTINGS,
  DEFAULT_GAME_SETTINGS,
  realisticBrakingApplies,
  type GameSettings,
} from './settings';

/**
 * Sighting distance the game plans against: a signal closer than 24 position units — a tile
 * and a half — is already too close to be braked for (train_cmd.cpp:4356).
 */
const SIGHTING_TILES = 1.5;

export interface SignalDensityInputs {
  /** The consist that runs this line, as the tab has it built. */
  physics: ConsistPhysics;
  /** Its length in tiles — a block shorter than the train never clears in time. */
  lengthTiles: number;
  /** Speed the line is driven at, internal units. */
  speedInternal: number;
  /** Worst descent along the line, in height levels. */
  descentLevels: number;
  /** Track the line is laid with; maglev brakes by its own rules. */
  track: Railtype;
  /** The network this line is part of, as the upkeep panel holds it. */
  network: NetworkCounts;
}

export interface SignalDensityResult {
  /** Speed the braking was computed from — the one the route panel settles at. */
  speedInternal: number;
  /** Braking distance in tiles; zero under the original braking model, which has none. */
  brakingTiles: number;
  /**
   * Spacing below which packing signals tighter stops paying. In tiles along one track, which
   * is the same figure as track pieces — each track carries its own heads.
   */
  usefulSpacing: number;
  /** Track pieces per signal head as the network stands; null when there are no signals. */
  currentSpacing: number | null;
  /** Signal heads the useful spacing asks for. */
  recommendedSignals: number;
  yearlyNow: number;
  yearlyRecommended: number;
  /** Positive when thinning out saves money; zero when there is nothing to save. */
  yearlySaving: number;
  /** Signals stand further apart than the useful spacing — capacity suffers. */
  tooSparse: boolean;
  /** Realistic braking is what makes a braking distance the measure of spacing. */
  realisticBraking: boolean;
}

/**
 * The inputs of this block, read off the same route model the panel above is drawn from.
 *
 * Physics, length and speed all come from `tripSetup`, not from a second call of their own:
 * the spec asks that the block never disagree with the panel, and two copies of the same
 * three lines would drift the first time the loaded leg is settled differently.
 */
export function signalInputs(
  route: RouteWithFlowParams,
  network: NetworkCounts,
  descentLevels: number,
): SignalDensityInputs {
  const game = route.game ?? DEFAULT_GAME_SETTINGS;
  const calc = route.calc ?? DEFAULT_CALC_SETTINGS;
  const setup = tripSetup(route);
  return {
    physics: setup.loadedPhysics,
    lengthTiles: setup.loadedLengthTiles,
    // the speed the loaded leg is driven at, not the consist's limit: a heavy train never
    // reaches its limit, and braking from a speed it does not travel at overstates the
    // distance quadratically
    speedInternal: setup.loadedSpeedInternal,
    descentLevels,
    track: activeRailtype(game, calc.trackType),
    network,
  };
}

/**
 * Spacing beyond which more signals stop earning their upkeep, in tiles along one track.
 *
 * Under realistic braking it is the braking distance plus the train's own length plus the
 * sighting distance: the reservation covers the braking distance whatever the spacing, and a
 * block that cannot hold the train does not clear in time either. Under the original model
 * there is no braking distance at all — the train stops dead at the signal — so the spacing
 * falls back to the train's length, and thinning out is paid for by traffic rather than by
 * braking.
 */
function spacingFor(
  inputs: SignalDensityInputs,
  game: GameSettings,
): { spacing: number; brakingTiles: number } {
  const realistic = realisticBrakingApplies(game);
  // the drop as the reservation check states it: world units, then overestimated by a
  // quarter the way the game does it to allow for a descent that is not uniform
  // (train_cmd.cpp:4381) — this figure is that check's, not the speed limiter's
  const drop = inputs.descentLevels * HEIGHT_LEVEL_UNITS;
  const brakingTiles = realistic
    ? brakingDistanceTiles(
        inputs.physics,
        game,
        inputs.speedInternal,
        drop + (drop >> 2),
        // the track states its own model; reading it off the label would break on a set that
        // names its maglev something else (rail.h acceleration_type)
        inputs.track.acceleration_type,
      )
    : 0;
  const spacing = realistic
    ? brakingTiles + inputs.lengthTiles + SIGHTING_TILES
    // a block shorter than one piece is not a block anyone can build, so that is the floor
    : Math.max(inputs.lengthTiles, 1);
  return { spacing, brakingTiles };
}

/** Yearly upkeep of a number of signal heads, as the game's infrastructure window bills it. */
function signalsYearly(count: number, game: GameSettings, year: number): number {
  return categoryMonthlyCost('signal', SIGNAL_MULTIPLIER, count, count, game, year) * 12;
}

/**
 * What the line's signals cost now, what the useful spacing would cost, and the difference.
 *
 * Track pieces are the unit throughout: a tile carries one piece per track on it and each
 * track carries its own signal heads, so a spacing of N tiles along a track is N pieces
 * between neighbouring heads, and the recommendation is the network's pieces over it. The
 * saving is the difference of two computed sums rather than a price per signal — under the
 * vanilla growth model thinning out makes every remaining signal cheaper too.
 *
 * Returns `null` when the network has no length: a line nobody counted is not a line of zero
 * (ADR-0004).
 */
export function signalPlan(
  inputs: SignalDensityInputs,
  /** The route the inputs were built from: it carries the game and the assumptions. */
  route: Pick<RouteWithFlowParams, 'game' | 'calc'>,
): SignalDensityResult | null {
  const game = route.game ?? DEFAULT_GAME_SETTINGS;
  const calc = route.calc ?? DEFAULT_CALC_SETTINGS;
  // only the types this set defines, exactly as the upkeep model counts them: a count left
  // in the inputs under a label of an earlier set is not track this company owns
  const pieces = activeRailtypes(game).reduce(
    (total, rt) => total + Math.max(0, inputs.network.rail[rt.label] ?? 0),
    0,
  );
  if (pieces <= 0) return null;

  const { spacing, brakingTiles } = spacingFor(inputs, game);

  const signals = Math.max(0, inputs.network.signals);
  // at least one: a line shorter than the useful spacing still needs the head that ends it,
  // and a recommendation of none would offer to save the whole bill for signalling nothing
  const recommendedSignals = Math.max(1, Math.round(pieces / spacing));
  const yearlyNow = signalsYearly(signals, game, calc.priceYear);
  const yearlyRecommended = signalsYearly(recommendedSignals, game, calc.priceYear);
  const currentSpacing = signals > 0 ? pieces / signals : null;
  // sparser than useful: the saving offered would be for signals that are already missing
  const tooSparse = currentSpacing != null && currentSpacing > spacing;
  const realisticBraking = realisticBrakingApplies(game);

  return {
    speedInternal: inputs.speedInternal,
    brakingTiles,
    usefulSpacing: spacing,
    currentSpacing,
    recommendedSignals,
    yearlyNow,
    yearlyRecommended,
    yearlySaving: tooSparse ? 0 : Math.max(0, yearlyNow - yearlyRecommended),
    tooSparse,
    realisticBraking,
  };
}
