import { afterEach, describe, expect, it } from 'vitest';
import { loadingBranchHint, supplyCommonHints } from '../rowHints';
import { useLocaleStore } from '../../../state/localeStore';
import type { OptimizeResult } from '../../../engine/optimize';

/** Строка выдачи, в которой заданы только поля, читаемые подсказками. */
function rowOf(over: Partial<OptimizeResult>): OptimizeResult {
  return {
    branchesDiffer: true,
    waitForFullLoad: true,
    waitDays: 1,
    pickupIntervalDays: 1,
    otherBranch: { pickupIntervalDays: 1, cargoPerTrip: 40 },
    ...over,
  } as unknown as OptimizeResult;
}

afterEach(() => useLocaleStore.setState({ locale: 'en' }));

describe('подсказки строки выдачи', () => {
  it('согласует дни с числом в подсказке ветки загрузки', () => {
    useLocaleStore.setState({ locale: 'en' });
    const hint = loadingBranchHint(rowOf({}))!;
    expect(hint).toContain('stands 1 day building');
    expect(hint).toContain('every 1 day with');
    expect(hint).not.toMatch(/\b1 days\b/);

    const lost = loadingBranchHint(rowOf({ waitForFullLoad: false, otherBranch: { pickupIntervalDays: 2.5, cargoPerTrip: 40 } as OptimizeResult['otherBranch'] }))!;
    expect(lost).toContain('every 2.5 days for');
  });

  it('молчит, где ветки не различаются', () => {
    expect(loadingBranchHint(rowOf({ branchesDiffer: false }))).toBeNull();
  });

  it('согласует интервал и флот в подсказке снабжения', () => {
    useLocaleStore.setState({ locale: 'en' });
    const [interval, fleet] = supplyCommonHints(rowOf({}), { windowDays: 93.4, trainsForWindow: 1 });
    expect(interval).toBe('Interval 1 day against a window of 93.4 days.');
    expect(fleet).toBe('Keeping the industry supplied takes 1 train.');
    expect(supplyCommonHints(rowOf({}), { windowDays: 93.4, trainsForWindow: 3 })[1]).toContain(
      'takes 3 trains',
    );
  });

  it('в русском ставит форму по числу', () => {
    useLocaleStore.setState({ locale: 'ru' });
    const fleet = (trains: number) =>
      supplyCommonHints(rowOf({}), { windowDays: 93.4, trainsForWindow: trains })[1];
    expect(fleet(1)).toContain('нужно 1 поезд.');
    expect(fleet(3)).toContain('нужно 3 поезда.');
    expect(fleet(5)).toContain('нужно 5 поездов.');
  });
});
