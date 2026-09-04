/**
 * Ranking what to trim. The summary adds no arithmetic of its own — it takes what the panels
 * answered, drops the answers that are not savings, and orders the rest.
 */
import { describe, expect, it } from 'vitest';
import { costliestLine, networkActions } from '../actions';
import type { CorridorUpgradeResult } from '../../../engine/corridorUpgrade';
import type { NetworkMaintenance } from '../../../engine/infrastructure';
import type { SignalDensityResult } from '../../../engine/signals';

const UPKEEP: NetworkMaintenance = {
  lines: [
    { category: 'rail', label: 'RAIL', count: 10_372, monthly: 1_604_400, yearly: 19_252_800 },
    { category: 'signal', count: 1_612, monthly: 1_714_300, yearly: 20_571_600 },
    { category: 'station', count: 514, monthly: 517_200, yearly: 6_206_400 },
  ],
  monthly: 3_835_900,
  yearly: 46_030_800,
};

function signals(over: Partial<SignalDensityResult> = {}): SignalDensityResult {
  return {
    speedInternal: 100,
    brakingTiles: 10,
    usefulSpacing: 14,
    currentSpacing: 6,
    recommendedSignals: 723,
    yearlyNow: 20_571_600,
    yearlyRecommended: 9_226_200,
    yearlySaving: 11_345_400,
    tooSparse: false,
    realisticBraking: true,
    ...over,
  };
}

function corridor(yearlyDelta: number): CorridorUpgradeResult {
  return { yearlyDelta } as CorridorUpgradeResult;
}

describe('what to trim', () => {
  it('puts the bigger yearly saving first', () => {
    const actions = networkActions(UPKEEP, corridor(2_000_000), signals(), 'Electrified railway');

    expect(actions.map((action) => action.panel)).toEqual(['signals', 'corridor']);
    expect(actions[0].yearly).toBe(11_345_400);
    // a quarter of the year's upkeep, stated as a share of the same total the panel shows
    expect(actions[0].share).toBeCloseTo(11_345_400 / 46_030_800, 10);
  });

  it('leaves out a conversion that loses money', () => {
    const actions = networkActions(UPKEEP, corridor(-4_000_000), signals(), 'Electrified railway');

    expect(actions.map((action) => action.panel)).toEqual(['signals']);
  });

  it('leaves out thinning a line that is signalled too sparsely', () => {
    const actions = networkActions(UPKEEP, corridor(2_000_000), signals({ tooSparse: true }), 'Electrified railway');

    expect(actions.map((action) => action.panel)).toEqual(['corridor']);
  });

  it('has nothing to say before the panels do', () => {
    expect(networkActions(UPKEEP, null, null, '')).toEqual([]);
  });

  it('states no share when nothing is owned yet', () => {
    const empty: NetworkMaintenance = { lines: [], monthly: 0, yearly: 0 };

    expect(networkActions(empty, null, signals(), '')[0].share).toBe(0);
    expect(costliestLine(empty)).toBeNull();
  });

  it('names the line the year is mostly spent on', () => {
    const costliest = costliestLine(UPKEEP)!;

    expect(costliest.line.category).toBe('signal');
    expect(costliest.share).toBeCloseTo(20_571_600 / 46_030_800, 10);
  });
});
