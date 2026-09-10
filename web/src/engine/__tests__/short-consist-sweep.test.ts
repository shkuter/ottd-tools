/**
 * A pair whose full-length consist does not move still has to reach the sweep of shorter
 * lengths: a shorter consist is lighter, so it moves where the long one stalls. The search
 * used to end the pair at the first empty answer, which dropped variants that were perfectly
 * fine — and did so under every goal, since the sweep never started to begin with.
 */
import { describe, expect, it } from 'vitest';
import {
  cargoByLabel,
  industriesMeta,
  industryById,
  trainById,
  trains,
  trainsMeta,
} from '../../dataset';
import { searchConsists, type OptimizeGoal, type OptimizeParams } from '../optimize';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../settings';
import type { SupplyTarget } from '../supply';
import { UNITS_PER_TILE } from '../units';
import { vehicleLengthUnits } from '../vehicle';

const game = { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' as const, firs: true };

/** Named as in optimize-cheapest.test.ts: the receiving industry the supply goal judges. */
const chlorAlkaliPlant: SupplyTarget = {
  industry: industryById.get('chlor_alkali_plant')!,
  windowTicks: industriesMeta.supply_window_ticks,
  cargoRatio: 8,
  otherRatios: [],
};

/**
 * The pair from the report: a light shunter and a heavy dump car. Filling the station the
 * consist does not move at all; shortened, the same pair hauls coal — at a loss on this
 * task, but the goals that turn nothing away still have to show it.
 */
const ENGINE = 'autocoach_pony_gen_2';
const WAGON = 'heavy_duty_dump_car_pony_gen_1A';

/** A station long enough that the pair filling it stalls, and one short enough that it moves. */
const STALLS_AT = 6;
const MOVES_AT = 3;

/** Wagons the long station fits — the count the sweep has to come in under. */
const maxWagons = Math.floor(
  (STALLS_AT * UNITS_PER_TILE - vehicleLengthUnits(trainById.get(ENGINE)!)) /
    vehicleLengthUnits(trainById.get(WAGON)!),
);

/** Everything but the pair is excluded, so the answer is about these two vehicles alone. */
const excludedIds = trains.filter((t) => t.id !== ENGINE && t.id !== WAGON).map((t) => t.id);

/** The goals that turn nothing away: whatever the sweep finds, they show. */
const GOALS: OptimizeGoal[] = ['profit', 'transported', 'supply'];

/** Coal over level ground in 1950, a flow one autocoach cannot clear on its own. */
const run = (maxLengthTiles: number, goal: OptimizeGoal) =>
  searchConsists(
    trains,
    {
      year: 1950,
      distanceTiles: 40,
      cargo: cargoByLabel.get('COAL')!,
      economyId: 'STEELTOWN',
      maxLengthTiles,
      productionPerMonth: 400,
      maxTrains: 4,
      goal,
      supplyTarget: chlorAlkaliPlant,
      excludedIds,
      game,
      calc: DEFAULT_CALC_SETTINGS,
    } satisfies OptimizeParams,
    trainsMeta,
    5,
  );

const search = (maxLengthTiles: number, goal: OptimizeGoal) => run(maxLengthTiles, goal).rows;

describe('sweep of shorter consists', () => {
  it('the pair does move once the consist is short enough', () => {
    // the premise of the other cases: the pair is not hopeless, it is only hopeless at length
    expect(search(MOVES_AT, 'profit')).not.toHaveLength(0);
  });

  it.each(GOALS)('keeps a pair whose full-length consist stalls (%s)', (goal) => {
    const rows = search(STALLS_AT, goal);
    expect(rows).not.toHaveLength(0);
    // fewer wagons than the station fits: the consist that fills it is the one that stalls,
    // and a length assertion would not say that — the full consist clears six tiles anyway
    expect(rows[0].wagonCount).toBeLessThan(maxWagons);
  });

  it('lets the sufficiency goal reach its own verdict on the pair', () => {
    // 'Min cost' turns this pair away — shortened or not, it crawls up the grade — but that
    // is its own refusal, named to the player, rather than a pair the sweep never evaluated.
    // Before the fix the sweep never ran, so there was nothing to refuse and nothing to say.
    const { rows, refused } = run(STALLS_AT, 'cheapest');
    expect(rows).toHaveLength(0);
    expect(refused).toContain('grade');
  });
});
