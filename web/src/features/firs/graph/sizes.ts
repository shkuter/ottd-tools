/**
 * Node boxes of the chain graph, in CSS pixels. The layout engine is handed these sizes
 * up front (fixedsize nodes), so the layout depends on the skin's scale and on nothing else
 * — not on the language, not on the font the browser resolves. The figures follow the
 * skin: the game's 10px font at --skin-scale 1.5 is 15px, set on 18px lines, in a box with
 * a bevelled border.
 */
import { BEVEL, SKIN_SCALE } from '../../../skin';

export const LINE_HEIGHT = 12 * SKIN_SCALE;
export const NODE_PADDING = 4 * SKIN_SCALE;

/** Industry card: a picture box, the name on up to two lines, and one line per note. */
export const INDUSTRY_WIDTH = 200;
export const INDUSTRY_IMAGE_HEIGHT = 112;
export const INDUSTRY_NAME_LINES = 2;

/** Cargo badge: the name on one line, and one line per "To …" note. */
export const CARGO_WIDTH = 150;

export function industryHeight(noteLines: number): number {
  return (
    INDUSTRY_IMAGE_HEIGHT +
    2 * BEVEL +
    NODE_PADDING * 2 +
    LINE_HEIGHT * (INDUSTRY_NAME_LINES + 1 + noteLines) // +1: the accept-mode line
  );
}

export function cargoHeight(noteLines: number): number {
  return NODE_PADDING * 2 + LINE_HEIGHT * (1 + noteLines);
}
