import type { Colour } from './colours';

/**
 * Colours drawn by something other than the skin, and the reason each is let
 * through — the same shape as ALLOWED in skin-palette.test.ts, one step wider:
 * an exemption is tied to the subtree it applies to, so a white sheet under the
 * FIRS chart does not also excuse white on a button.
 *
 * A colour the SKIN draws is not exempted, it is fixed. This list is for output
 * of a renderer that paints from its own data — graphviz, the chart library —
 * and for the browser's own defaults where the game has nothing to say.
 */
export interface Exemption {
  /** class of the subtree it is confined to, as it appears in the collected DOM path */
  readonly within: string;
  /** `#rrggbb`, lowercase, as normaliseColour reports it */
  readonly colour: string;
  readonly reason: string;
}

/*
 * All of these are inside the FIRS chart. Its colours come from the dot graph
 * extract_firs.py writes and from graphviz's own defaults — the calculator does
 * not paint them, and repainting the chart in palette colours would be a new
 * demand on the look, which this change deliberately does not make.
 *
 * Listed colour by colour rather than as "anything inside the chart": a white
 * sheet under the graph is no excuse for white on a button.
 */
export const EXEMPTIONS: readonly Exemption[] = [
  {
    within: '.graph-container',
    colour: '#ffffff',
    reason: 'graphviz draws the chart on a white sheet of its own',
  },
  {
    within: '.graph-container',
    colour: '#000000',
    reason: "node outlines and labels in graphviz's default black",
  },
  {
    within: '.graph-container',
    colour: '#888888',
    reason: 'edge colour set by the dot graph (edge [color="#888888"])',
  },
  {
    within: '.graph-container',
    colour: '#f5efd8',
    reason: 'cargo node fill set by the dot graph',
  },
  {
    within: '.graph-container',
    colour: '#dce7f5',
    reason: 'industry node fill set by the dot graph',
  },
];

/**
 * Was this colour, on this element, signed off? `path` is the DOM path the
 * collector records, which spells out every ancestor's classes — so a subtree
 * match is a substring check against it.
 */
export function isExempt(path: string, colour: Colour) {
  return EXEMPTIONS.some(
    (exemption) => colour.hex === exemption.colour && path.includes(exemption.within),
  );
}
