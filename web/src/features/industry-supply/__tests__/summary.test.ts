import { describe, expect, it } from 'vitest';
import { summaryLines } from '../summary';
import { assessIndustrySupply, type InputOutcome } from '../../../engine/supply';
import { industriesMeta, industryById } from '../../../dataset';
import { supplyWindowDays } from '../../../engine/supply';
import type { InputRun } from '../inputs';

const windowDays = supplyWindowDays(industriesMeta.supply_window_ticks);
const industry = (id: string) => industryById.get(id)!;

const outcome = (over: Partial<InputOutcome> = {}): InputOutcome => ({
  verdict: 'holds',
  ratio: 0.5,
  trainsForWindow: 2,
  unserved: false,
  deliveredPerWindow: null,
  ...over,
});

/** Inputs of an industry in one economy, with the outcome each case gives them. */
function runsOf(id: string, economy: string, outcomes: (InputOutcome | null)[]): InputRun[] {
  return (industry(id).economies[economy]?.accepts ?? []).map((entry, i) => ({
    cargoLabel: entry.label,
    cargo: null,
    ratio: entry.ratio ?? 0,
    params: { distanceTiles: 100, productionPerMonth: 120 },
    best: null,
    leanest: null,
    outcome: outcomes[i] ?? null,
  }));
}

const linesFor = (id: string, economy: string, outcomes: (InputOutcome | null)[]) => {
  const runs = runsOf(id, economy, outcomes);
  return summaryLines({
    summary: assessIndustrySupply(industry(id), runs),
    maxTrains: 4,
    windowDays,
  }).map((line) => `${line.tone}: ${line.text}`);
};

describe('supply summary lines', () => {
  it('says nothing was computed while no input has a route', () => {
    const lines = linesFor('tyre_plant', 'STEELTOWN', [null, null, null, null]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('No input has a route yet');
  });

  it('never quotes a conversion of 0 % on an empty form', () => {
    expect(linesFor('tyre_plant', 'STEELTOWN', [null, null, null, null]).join()).not.toContain('0%');
  });

  it('warns the total is partial while some inputs are unset', () => {
    const lines = linesFor('tyre_plant', 'STEELTOWN', [outcome(), null, null, null]);
    expect(lines.some((l) => l.startsWith('warning:'))).toBe(true);
  });

  it('claims every input is supplied only when none misses the window', () => {
    const lines = linesFor('tyre_plant', 'STEELTOWN', Array(4).fill(outcome()));
    expect(lines.join()).toContain('Every input is supplied');
  });

  it('says the ceiling was reached when a missing input cannot change the conversion', () => {
    // "any three of five": three supplied inputs of ratio 3 already reach the ceiling
    const lines = linesFor('appliance_factory', 'STEELTOWN', [
      outcome(), outcome(), outcome(), outcome({ verdict: 'misses' }), outcome({ verdict: 'misses' }),
    ]);
    expect(lines.join()).not.toContain('Every input is supplied');
    expect(lines.join()).toContain('conversion ceiling');
  });

  it('does not present a pool with no volume as base output', () => {
    const lines = linesFor('port', 'BASIC_TEMPERATE', [
      outcome({ verdict: 'misses', unserved: true, trainsForWindow: null }), null, null,
    ]);
    expect(lines.join()).toContain('None of the routes given can be run');
    expect(lines.join()).not.toContain('100%');
  });

  it('reports the pool level once a route delivers something', () => {
    const lines = linesFor('port', 'BASIC_TEMPERATE', [
      outcome({ deliveredPerWindow: 700 }), null, null,
    ]);
    expect(lines.join()).toContain('250%');
  });
});
