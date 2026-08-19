import { describe, expect, it } from 'vitest';
import { colourTuple, PRIMARY_SHADE, theme } from '../theme';
import { gradients } from '../skin';
import { SHADES } from '../skin';

describe('colourTuple', () => {
  it('expands the 8 shades of a base-set group to the 10 Mantine wants', () => {
    const grey = gradients.grey;
    expect(grey).toHaveLength(SHADES.length);

    const tuple = colourTuple(grey);
    expect(tuple).toHaveLength(10);
    // the ends are duplicated, so no colour the game does not have is invented
    expect(tuple[0]).toBe(grey[0]);
    expect(tuple[1]).toBe(grey[0]);
    expect(tuple[9]).toBe(grey[grey.length - 1]);
    expect(tuple[8]).toBe(grey[grey.length - 1]);
    expect(new Set(tuple).size).toBe(new Set(grey).size);
  });

  it('keeps shade n at index n + 1, which is what PRIMARY_SHADE relies on', () => {
    const yellow = gradients.yellow;
    const tuple = colourTuple(yellow);
    yellow.forEach((shade, index) => expect(tuple[index + 1]).toBe(shade));
    // the primary shade must be the button fill of the skin: yellow `light`
    expect(tuple[PRIMARY_SHADE]).toBe(yellow[SHADES.indexOf('light')]);
  });
});

describe('theme', () => {
  it('takes its colours from the base set and squares off the corners', () => {
    expect(theme.defaultRadius).toBe(0);
    expect(theme.primaryColor).toBe('yellow');
    expect(theme.colors?.yellow).toEqual(colourTuple(gradients.yellow));
    // the window grey has to reach Mantine's dark surfaces too
    expect(theme.colors?.dark).toEqual(colourTuple(gradients.grey));
  });
});
