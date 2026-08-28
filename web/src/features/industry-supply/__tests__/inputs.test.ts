import { describe, expect, it } from 'vitest';
import { runSupplyInputs } from '../inputs';
import { createOptimizerCache, type OptimizerCache } from '../../../engine/optimizeCache';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../../engine/settings';
import { EMPTY_INPUT } from '../../../state/industrySupplyStore';

const game = {
  ...DEFAULT_GAME_SETTINGS,
  ironHorse: true,
  firs: true,
  firsEconomy: 'STEELTOWN',
};
const calc = DEFAULT_CALC_SETTINGS;

/** One run of the tyre plant's inputs, with whatever routes the case gives them. */
function run(
  inputs: { cargoLabel: string; ratio: number; params: typeof EMPTY_INPUT }[],
  overrides: Partial<{ year: number; stationTiles: number; maxTrains: number; trackType: string }> = {},
) {
  const caches = new Map<string, OptimizerCache>();
  return runSupplyInputs({
    game,
    calc: overrides.trackType ? { ...calc, trackType: overrides.trackType } : calc,
    industryId: 'tyre_plant',
    inputs,
    year: overrides.year ?? 1950,
    stationTiles: overrides.stationTiles ?? 5,
    maxTrains: overrides.maxTrains ?? 4,
    caches,
  });
}

const routed = (cargoLabel: string, distanceTiles: number, productionPerMonth = 120) => ({
  cargoLabel,
  ratio: 2,
  params: { distanceTiles, productionPerMonth },
});

describe('supply tab input runs', () => {
  it('leaves an input without a distance unset', () => {
    const [result] = run([routed('RUBR', 0)]);
    expect(result.outcome).toBeNull();
    expect(result.best).toBeNull();
  });

  it('leaves an input without a source output unset: no output, no interval', () => {
    const [result] = run([routed('RUBR', 100, 0)]);
    expect(result.outcome).toBeNull();
  });

  it('answers a routed input with a consist and a verdict', () => {
    const [result] = run([routed('RUBR', 100)]);
    expect(result.best).not.toBeNull();
    expect(result.outcome?.unserved).toBe(false);
    expect(result.outcome?.verdict).toBe('holds');
    expect(result.outcome?.trainsForWindow).toBeGreaterThan(0);
  });

  it('names a fleet no larger than the one the shown consist needs', () => {
    const [result] = run([routed('TYCO', 600)], { maxTrains: 2, stationTiles: 3, year: 1970 });
    const shown = result.best?.supply?.trainsForWindow;
    expect(result.outcome?.trainsForWindow).toBeLessThanOrEqual(shown!);
    // и это парк того состава, который назван в совете
    expect(result.outcome?.trainsForWindow).toBe(result.leanest?.supply?.trainsForWindow);
  });

  it('marks an input nothing can haul as unserved rather than unset', () => {
    // ванильные вагоны не берут грузы FIRS, поэтому под этот груз состава нет вовсе
    const caches = new Map<string, OptimizerCache>();
    const [result] = runSupplyInputs({
      game: { ...game, ironHorse: false },
      calc,
      industryId: 'tyre_plant',
      inputs: [routed('CBLK', 100)],
      year: 1950,
      stationTiles: 5,
      maxTrains: 4,
      caches,
    });
    expect(result.outcome?.unserved).toBe(true);
    expect(result.outcome?.verdict).toBe('misses');
    expect(result.outcome?.trainsForWindow).toBeNull();
    expect(result.best).toBeNull();
  });

  it('keeps one cache per cargo: the caches key on the route length', () => {
    const caches = new Map<string, OptimizerCache>();
    caches.set('RUBR', createOptimizerCache());
    runSupplyInputs({
      game, calc, industryId: 'tyre_plant',
      inputs: [routed('RUBR', 100), routed('SULP', 300)],
      year: 1950, stationTiles: 5, maxTrains: 4, caches,
    });
    expect([...caches.keys()].sort()).toEqual(['RUBR', 'SULP']);
  });
});

describe('the supply tab follows the shared track type', () => {
  // it used to carry an electrification switch of its own; the line is now the shared choice
  it('picks a different consist on electrified track', () => {
    const [onPlainRail] = run([routed('RUBR', 100)]);
    const [onElectrified] = run([routed('RUBR', 100)], { trackType: 'ELRL' });
    expect(onPlainRail.best).not.toBeNull();
    expect(onElectrified.best).not.toBeNull();
    // electrics are only available under the wires, so the best consist parts ways here
    expect(onElectrified.best!.engine.id).not.toBe(onPlainRail.best!.engine.id);
  });

  it('offers narrow gauge vehicles only on narrow gauge', () => {
    const [result] = run([routed('RUBR', 100)], { trackType: 'NAAN' });
    if (result.best) {
      expect(result.best.engine.base_track_type).toBe('NG');
      expect(result.best.wagon.base_track_type).toBe('NG');
    }
  });
});
