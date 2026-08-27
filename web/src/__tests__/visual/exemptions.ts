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
 * Empty, and meant to stay that way.
 *
 * The list is for a colour the skin does not choose — one a third-party renderer
 * paints from its own data. The chain graph was its last inhabitant, until it
 * turned out that graphviz writes its colours as *presentation* attributes,
 * which lose to any CSS rule: a renderer of its own is not the same as a colour
 * of its own, and the first thing to try is overriding it.
 *
 * An entry is a subtree, a colour and a reason — colour by colour, never "any
 * colour inside this chart": a white sheet under a graph is no excuse for white
 * on a button.
 */
export const EXEMPTIONS: readonly Exemption[] = [];

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
