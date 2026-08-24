import { extractColours, inPalette, normaliseColour, type Colour } from './colours';
import { isExempt } from './exemptions';
import type { ElementStyles, Snapshot } from './collect';

/**
 * Reading a snapshot: which colours are not the game's, and where.
 *
 * Kept apart from the collector because it runs in Node — that is where the
 * palette and the exemption list live, and where a readable failure message can
 * be put together (see design.md, "Сбор в браузере, утверждения в Node").
 */

/**
 * Declarations whose value holds several colours rather than one. Same list as
 * COMPOUND in collect.ts, which cannot be shared: that one is serialised into
 * the page. A scrollbar part is read off a pseudo-element, so its key is
 * "::-webkit-scrollbar-thumb background-color" — a single colour like the rest.
 */
const COMPOUND = new Set(['background-image', 'box-shadow', 'text-shadow', 'scrollbar-color']);

export interface ColourFinding {
  readonly path: string;
  readonly property: string;
  readonly colour: Colour;
  readonly text: string;
  readonly theme: string;
}

/** Every colour this element paints with, declaration by declaration. */
export function coloursOf(element: ElementStyles): { property: string; colour: Colour }[] {
  const found: { property: string; colour: Colour }[] = [];
  for (const [property, value] of Object.entries(element.colours)) {
    const colours = COMPOUND.has(property)
      ? extractColours(value)
      : [normaliseColour(value)].filter((colour): colour is Colour => colour !== null);
    for (const colour of colours) found.push({ property, colour });
  }
  return found;
}

/**
 * Colours the game's palette does not have, minus the ones signed off in
 * exemptions.ts. Alpha is not grounds for a finding: the requirement is about
 * which colour is painted, and the palette has no alpha to compare against.
 */
export function offPalette(shot: Snapshot): ColourFinding[] {
  const findings: ColourFinding[] = [];
  for (const element of shot.elements) {
    for (const { property, colour } of coloursOf(element)) {
      if (inPalette(colour) || isExempt(element.path, colour)) continue;
      findings.push({
        path: element.path,
        property,
        colour,
        text: element.ownText,
        theme: element.theme,
      });
    }
  }
  return findings;
}

/** One finding as a line of a failure message. */
export function describeFinding(finding: ColourFinding) {
  const text = finding.text ? ` (${finding.text})` : '';
  const alpha = finding.colour.alpha === 1 ? '' : ` at alpha ${finding.colour.alpha}`;
  return (
    `${finding.colour.hex}${alpha} as ${finding.property} in the ${finding.theme} window` +
    `\n    ${finding.path}${text}`
  );
}

/** How many findings a failure message spells out before saying "and N more". */
const SPELLED_OUT = 12;

/** Findings as a message, one per line, with the worst repetition folded away. */
export function describeFindings(findings: readonly ColourFinding[]) {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const finding of findings) {
    const key = `${finding.colour.hex}|${finding.property}|${finding.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(describeFinding(finding));
    if (lines.length === SPELLED_OUT) break;
  }
  const more = lines.length < findings.length ? `\n  …and ${findings.length - lines.length} more` : '';
  return `${findings.length} colour(s) outside the palette:\n  ${lines.join('\n  ')}${more}`;
}
