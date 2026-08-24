import { describe, expect, it } from 'vitest';
import {
  extractColours,
  inPalette,
  normaliseColour,
  tokenColour,
  tokenColours,
} from './colours';
import { PALETTE } from '../../skin';
import paletteJson from '../../data/opengfx2_palette.json';

/**
 * The reader the rendered-page checks measure with. It runs in Node like the
 * rest of the suite — the browser is only needed to produce the values it reads.
 */

describe('normaliseColour', () => {
  it('reads the forms getComputedStyle returns', () => {
    expect(normaliseColour('rgb(16, 16, 16)')).toEqual({ hex: '#101010', alpha: 1 });
    expect(normaliseColour('rgba(252, 192, 0, 1)')).toEqual({ hex: '#fcc000', alpha: 1 });
    // the space/slash form Chrome uses for some properties
    expect(normaliseColour('rgb(132 132 164 / 0.5)')).toEqual({ hex: '#8484a4', alpha: 0.5 });
    expect(normaliseColour('rgba(16, 16, 16, 30%)')).toEqual({ hex: '#101010', alpha: 0.3 });
    // what Chrome resolves color-mix() to — Mantine's translucent overlays land here
    expect(normaliseColour('color(srgb 0.513726 0.521569 0.513726 / 0.75)')).toEqual({
      hex: '#838583',
      alpha: 0.75,
    });
  });

  it('reports no colour where there is none', () => {
    expect(normaliseColour('transparent')).toBeNull();
    expect(normaliseColour('none')).toBeNull();
    expect(normaliseColour('')).toBeNull();
    // currentcolor resolves to the element's own colour, collected separately
    expect(normaliseColour('currentcolor')).toBeNull();
    expect(normaliseColour('rgba(0, 0, 0, 0)')).toBeNull();
  });

  it('throws on a form it cannot read instead of skipping it', () => {
    expect(() => normaliseColour('oklch(0.7 0.1 200)')).toThrow(/unsupported colour value/);
    expect(() => normaliseColour('lab(50% 40 30)')).toThrow(/unsupported colour value/);
    expect(() => normaliseColour('#fcc000')).toThrow(/unsupported colour value/);
  });
});

describe('extractColours', () => {
  it('picks every colour out of a compound value', () => {
    // the checkerboard the game hatches an unavailable widget with
    const hatch =
      'repeating-linear-gradient(45deg, rgb(98, 101, 98) 0%, rgb(98, 101, 98) 25%, ' +
      'rgba(0, 0, 0, 0) 25%, rgba(0, 0, 0, 0) 50%)';
    expect(extractColours(hatch)).toEqual([
      { hex: '#626562', alpha: 1 },
      { hex: '#626562', alpha: 1 },
    ]);
  });

  it('reads a colour function inside a compound value', () => {
    // Mantine's translucent surfaces reach a gradient in this form
    expect(
      extractColours('linear-gradient(color(srgb 0.5 0.5 0.5 / 0.75), rgb(0, 0, 0))'),
    ).toEqual([
      { hex: '#808080', alpha: 0.75 },
      { hex: '#000000', alpha: 1 },
    ]);
  });

  it('reads a shadow and reports nothing for none', () => {
    expect(extractColours('rgb(16, 16, 16) 1px 1px 0px')).toEqual([{ hex: '#101010', alpha: 1 }]);
    expect(extractColours('none')).toEqual([]);
  });

  it('throws on a colour function it cannot read', () => {
    expect(() => extractColours('linear-gradient(oklch(0.7 0.1 200), rgb(0, 0, 0))')).toThrow(
      /unsupported colour function/,
    );
  });
});

describe('tokenColour', () => {
  it('reads a colour the way a rule writes it', () => {
    expect(tokenColour('#101010')).toEqual({ hex: '#101010', alpha: 1 });
    expect(tokenColour('#FCC000')).toEqual({ hex: '#fcc000', alpha: 1 });
    // short form, and the rgb() form a resolved token can also hold
    expect(tokenColour('#fff')).toEqual({ hex: '#ffffff', alpha: 1 });
    expect(tokenColour('rgb(16, 16, 16)')).toEqual({ hex: '#101010', alpha: 1 });
  });

  it('picks the colour out of a shadow token', () => {
    // --skin-text-shadow, as skin.css declares it
    expect(tokenColours('1px 1px 0 #101010')).toEqual([{ hex: '#101010', alpha: 1 }]);
    expect(tokenColours('none')).toEqual([]);
  });
});

describe('palette', () => {
  it('holds every colour of the base set, and only those', () => {
    const fromData = new Set([
      ...Object.values(paletteJson.gradients).flat(),
      ...Object.values(paletteJson.named),
    ]);
    expect(PALETTE.size).toBe(fromData.size);
    // TC_BLACK belongs to no gradient, so it is here only because `named` is read
    expect(PALETTE.has('#101010')).toBe(true);
    expect(inPalette({ hex: '#101010', alpha: 1 })).toBe(true);
    // a colour of the sRGB cube the DOS palette does not have
    expect(inPalette({ hex: '#ff00ff', alpha: 1 })).toBe(false);
  });
});
