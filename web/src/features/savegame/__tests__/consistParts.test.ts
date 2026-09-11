/**
 * The consist of an imported train is written twice: as a string, for the value a column
 * sorts by and for the browser's own tooltip, and as markup, so each vehicle can explain its
 * name. Both come out of `consistParts()`, and this is the assertion that keeps them equal —
 * a second spelling of the same train is exactly what the tab must never show.
 */
import { describe, expect, it } from 'vitest';
import { consistParts, consistText } from '../labels';
import { trains } from '../../../dataset';
import en from '../../../i18n/en.json';

const known = trains.find((train) => train.name.startsWith('0-8-0'))!;
const other = trains.find((train) => train.kind === 'wagon')!;

describe('consistParts', () => {
  it('spells the consist the same way the string form does', () => {
    const consist = [
      { catalogueId: known.id, count: 1 },
      { catalogueId: other.id, count: 11 },
    ];
    expect(consistParts(consist).map((part) => part.text).join(' + ')).toBe(consistText(consist));
  });

  it('carries the catalogue vehicle behind each piece', () => {
    const parts = consistParts([{ catalogueId: known.id, count: 2 }]);
    expect(parts[0].train?.name).toBe(known.name);
    expect(parts[0].text).toBe(`${known.name} ×2`);
  });

  it('keeps a vehicle of an unknown set in its place, with no vehicle behind it', () => {
    const parts = consistParts([{ catalogueId: null, count: 3 }]);
    expect(parts[0].train).toBeNull();
    expect(parts[0].text).toBe(`${en['game.unknownVehicle']} ×3`);
  });

  it('has no pieces for an empty consist, where the string form names it', () => {
    expect(consistParts([])).toEqual([]);
    expect(consistText([])).toBe(en['game.noConsist']);
  });
});
