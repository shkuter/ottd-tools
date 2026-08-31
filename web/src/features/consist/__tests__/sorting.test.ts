import { describe, expect, it } from 'vitest';
import { sortRows } from '../../../components/table/sorting';
import { catalogueSortValues, DEFAULT_SORT } from '../sorting';
import { activeTrains, trainsMeta } from '../../../dataset';
import { topSpeedOn } from '../../../engine/tracktypes';
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

/**
 * "No power" is what the column itself reports, not what the field says: on plain rail an
 * electric — or, in vanilla, a monorail engine — makes nothing, which is exactly what its
 * cell prints as an em dash.
 */
const makesPower = (train: (typeof rows)[number]) => values.power_hp(train) != null;

describe('catalogue columns', () => {
  it('has vehicles both with and without an engine', () => {
    expect(rows.some(makesPower)).toBe(true);
    expect(rows.some((t) => !makesPower(t))).toBe(true);
  });

  it('puts vehicles with no power at the end, whichever way it sorts', () => {
    const powered = rows.filter(makesPower).length;
    for (const descending of [false, true]) {
      const sorted = sortRows(rows, { column: 'power_hp', descending }, values, collator);
      expect(sorted).toHaveLength(rows.length);
      expect(sorted.slice(powered).every((t) => !makesPower(t))).toBe(true);
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

describe('the columns follow the chosen track', () => {
  const ironHorseGame = { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' as const };
  const valuesOn = (trackType: string) =>
    catalogueSortValues(ironHorseGame, { ...DEFAULT_CALC_SETTINGS, trackType });
  const train = (id: string) => activeTrains(ironHorseGame).find((t) => t.id === id)!;

  it('ranks an electro-diesel by the power it makes on this line', () => {
    // Shoebox: 950hp on diesel away from the wires, 2500hp under them
    const shoebox = train('shoebox');
    expect(valuesOn('RAIL').power_hp(shoebox)).toBe(shoebox.power_by_source!.DIESEL);
    expect(valuesOn('ELRL').power_hp(shoebox)).toBe(shoebox.power_by_source!.OHLE);
  });

  it('ranks a high speed train by the speed it reaches on this line', () => {
    const hst = train('blaze_cab');
    expect(valuesOn('ELRL').speed(hst)).toBe(hst.speed_internal);
    expect(valuesOn('LGVE').speed(hst)).toBe(hst.speed_lgv_internal);
  });

  it('drops an electric with no wires out of the ordering instead of zeroing it', () => {
    // a zero would head the list the moment the direction is reversed; a vehicle with no
    // power here has no value here
    expect(valuesOn('RAIL').power_hp(train('pinhorse'))).toBeNull();
  });
});

describe("the track's own limit reaches the catalogue too", () => {
  const ironHorseGame = { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' as const };
  const plainRail = trainsMeta.railtypes[0];

  it('the speed column promises no more than the line gives', () => {
    // neither vanilla nor Iron Horse states a limit, but a set that does is the whole
    // point of the feature: the catalogue must not show 250 where the consist is
    // computed at 60
    const fast = activeTrains(ironHorseGame).find((t) => (t.speed_internal ?? 0) > 200)!;
    const limited = { ...plainRail, speed_limit_internal: 96 };
    expect(topSpeedOn(fast, limited)).toBe(96);
    expect(topSpeedOn(fast, plainRail)).toBe(fast.speed_internal);
  });

  it('does not hand the line\'s limit to a vehicle that states no speed of its own', () => {
    // the limit belongs to the train a wagon ends up in, not to the wagon: printing it in
    // the wagon's own column would invent a figure the data never gave it
    const wagon = activeTrains(ironHorseGame).find(
      (t) => t.kind === 'wagon' && t.speed_internal === null,
    )!;
    const limited = { ...plainRail, speed_limit_internal: 96 };
    expect(topSpeedOn(wagon, plainRail)).toBeNull();
    expect(topSpeedOn(wagon, limited)).toBeNull();
  });
});
