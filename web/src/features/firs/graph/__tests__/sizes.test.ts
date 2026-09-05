import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BEVEL, SKIN_SCALE } from '../../../../skin';
import { LINE_HEIGHT, NODE_PADDING, INDUSTRY_IMAGE_HEIGHT } from '../sizes';

const css = readFileSync(new URL('../../../../skin.css', import.meta.url), 'utf8');

describe('the node sizes follow the skin', () => {
  it('uses the multiplier skin.css declares', () => {
    expect(css).toMatch(new RegExp(`--skin-scale: ${SKIN_SCALE};`));
    expect(css).toContain('--bevel: round(calc(1px * var(--skin-scale)), 1px);');
    expect(BEVEL).toBe(Math.round(SKIN_SCALE));
  });

  it('states the same line, padding and picture the stylesheet paints the node with', () => {
    expect(css).toContain(`--graph-line-height: calc(${LINE_HEIGHT / SKIN_SCALE}px * var(--skin-scale));`);
    expect(css).toContain(`--graph-node-padding: calc(${NODE_PADDING / SKIN_SCALE}px * var(--skin-scale));`);
    expect(css).toContain(`--graph-image-height: ${INDUSTRY_IMAGE_HEIGHT}px;`);
  });
});
