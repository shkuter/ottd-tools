import { describe, expect, it } from 'vitest';
import { cargoByLabel, gamePalette } from '../../../../dataset';
import { BADGE_TEXT_COLOURS, badgeTextColour, cargoColour } from '../cargoColour';

describe('cargoColour', () => {
  it('resolves the index the set assigned in the economy through the game palette', () => {
    const coal = cargoByLabel.get('COAL')!;
    expect(cargoColour(coal, 'STEELTOWN')).toBe(gamePalette[coal.colour_by_economy.STEELTOWN]);
    // the same cargo, another economy, another slot — another colour
    expect(cargoColour(coal, 'BASIC_TEMPERATE')).toBe(gamePalette[coal.colour_by_economy.BASIC_TEMPERATE]);
    expect(cargoColour(coal, 'STEELTOWN')).not.toBe(cargoColour(coal, 'BASIC_TEMPERATE'));
  });

  it('has no colour for a cargo outside the economy, or for no cargo', () => {
    expect(cargoColour(cargoByLabel.get('SLAG'), 'BASIC_TEMPERATE')).toBeUndefined();
    expect(cargoColour(undefined, 'STEELTOWN')).toBeUndefined();
  });
});

describe('badgeTextColour', () => {
  it('letters a dark badge light and a light badge dark, in palette entries', () => {
    const [dark, light] = BADGE_TEXT_COLOURS;
    expect(gamePalette).toContain(dark);
    expect(gamePalette).toContain(light);
    expect(badgeTextColour('#000000')).toBe(light);
    expect(badgeTextColour('#fcfcfc')).toBe(dark);
  });
});
