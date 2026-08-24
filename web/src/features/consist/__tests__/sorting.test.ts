import { describe, expect, it } from 'vitest';
import { sortRows } from '../../../components/table/sorting';
import { catalogueSortValues, DEFAULT_SORT } from '../sorting';
import { activeTrains } from '../../../dataset';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../../engine/settings';

/**
 * What the catalogue's columns compare by. The mechanism itself is checked in
 * components/table/__tests__; the question here is whether a column sorts by the very figure
 * its cell prints — a wagon shows an em dash where it has no engine, so it must not sort as
 * "nought horsepower" and head the list the moment the direction is reversed.
 */

const collator = new Intl.Collator('ru', { numeric: true });
const values = catalogueSortValues(DEFAULT_GAME_SETTINGS, DEFAULT_CALC_SETTINGS);
const rows = activeTrains(DEFAULT_GAME_SETTINGS);

describe('catalogue columns', () => {
  it('has vehicles both with and without an engine', () => {
    expect(rows.some((t) => t.power_hp)).toBe(true);
    expect(rows.some((t) => !t.power_hp)).toBe(true);
  });

  it('puts vehicles with no power at the end, whichever way it sorts', () => {
    const powered = rows.filter((t) => t.power_hp).length;
    for (const descending of [false, true]) {
      const sorted = sortRows(rows, { column: 'power_hp', descending }, values, collator);
      expect(sorted).toHaveLength(rows.length);
      expect(sorted.slice(powered).every((t) => !t.power_hp)).toBe(true);
    }
  });

  it('does the same for vehicles with no speed limit', () => {
    const limited = rows.filter((t) => t.speed_internal).length;
    expect(limited).toBeLessThan(rows.length);
    for (const descending of [false, true]) {
      const sorted = sortRows(rows, { column: 'speed', descending }, values, collator);
      expect(sorted.slice(limited).every((t) => !t.speed_internal)).toBe(true);
    }
  });

  it('and for vehicles that carry nothing', () => {
    const index = DEFAULT_CALC_SETTINGS.capacityIndex;
    const carrying = rows.filter((t) => t.capacities[index]).length;
    expect(carrying).toBeLessThan(rows.length);
    for (const descending of [false, true]) {
      const sorted = sortRows(rows, { column: 'capacity', descending }, values, collator);
      expect(sorted.slice(carrying).every((t) => !t.capacities[index])).toBe(true);
    }
  });

  it('defaults to the year, the order of the game purchase list', () => {
    const sorted = sortRows(rows, DEFAULT_SORT, values, collator);
    const years = sorted.map((t) => t.intro_year);
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });
});
