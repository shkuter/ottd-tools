import { PALETTE } from '../../skin';
import { gamePalette } from '../../dataset';

const GAME_PALETTE: ReadonlySet<string> = new Set(gamePalette);

/**
 * The colours a rendered page is allowed to show, and how to read a computed
 * value as one of them.
 *
 * The set is built from the palette of the base set rather than listed here, so
 * re-extracting OpenGFX2 moves the checks with the data instead of against it
 * (see specs/ui-shell — "Обновление базового набора").
 */

export interface Colour {
  /** `#rrggbb`, lowercase */
  readonly hex: string;
  /** 0…1; the palette has no alpha, so anything below 1 is worth reporting */
  readonly alpha: number;
}

const RGB =
  /^rgba?\(\s*(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?)\s*[,\s]\s*(\d+(?:\.\d+)?)\s*(?:[,/]\s*(\d+(?:\.\d+)?%?)\s*)?\)$/i;

/**
 * `color(srgb r g b / a)`, channels 0…1. Chrome resolves color-mix() to this
 * form, and Mantine mixes its translucent surfaces that way, so a reader that
 * choked on it would fail on a colour that is perfectly legal.
 */
const SRGB =
  /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i;

/** Colour functions Chrome could hand back that this reader cannot decode. */
const UNKNOWN_FUNCTION = /\b(?:color-mix|lab|lch|oklab|oklch|hwb|hsla?)\(/i;

/** Values that stand for "no colour here" rather than for a colour. */
const ABSENT = new Set(['', 'none', 'transparent', 'auto', 'currentcolor']);

function hex(channel: number) {
  return Math.round(channel).toString(16).padStart(2, '0');
}

/**
 * A single computed colour as `#rrggbb` plus alpha, or null when the value
 * carries no colour at all: `none`, `transparent`, a fully transparent rgba, or
 * `currentcolor` — the last one resolves to the element's own `color`, which is
 * collected in its own right.
 *
 * Throws on a form it does not understand: a colour that quietly fails to parse
 * is a colour that stops being checked, which is the failure mode this whole
 * change exists to remove.
 */
export function normaliseColour(value: string): Colour | null {
  const text = value.trim();
  if (ABSENT.has(text.toLowerCase())) return null;

  const srgb = SRGB.exec(text);
  const match = srgb ?? RGB.exec(text);
  if (!match) {
    throw new Error(`normaliseColour: unsupported colour value ${JSON.stringify(value)}`);
  }
  const [, r, g, b, a] = match;
  const scale = srgb ? 255 : 1;
  const alpha = a === undefined ? 1 : a.endsWith('%') ? Number(a.slice(0, -1)) / 100 : Number(a);
  if (alpha === 0) return null;
  return {
    hex: `#${hex(Number(r) * scale)}${hex(Number(g) * scale)}${hex(Number(b) * scale)}`,
    alpha,
  };
}

/**
 * Colours inside a compound value — `background-image` with its hatch gradient,
 * `box-shadow`, `text-shadow`. Chrome writes them all as rgb()/rgba() literals,
 * so they are picked out one by one; a colour function this reader cannot decode
 * throws here too rather than being skipped.
 */
export function extractColours(value: string): Colour[] {
  const text = value.trim();
  if (ABSENT.has(text.toLowerCase())) return [];
  if (UNKNOWN_FUNCTION.test(text)) {
    throw new Error(`extractColours: unsupported colour function in ${JSON.stringify(value)}`);
  }
  const found: Colour[] = [];
  for (const [literal] of text.matchAll(/(?:rgba?|color)\([^)]*\)/gi)) {
    const colour = normaliseColour(literal);
    if (colour) found.push(colour);
  }
  return found;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * A colour as the stylesheet writes it. Skin tokens hold what was typed into the
 * rule — `#101010`, or `1px 1px 0 #101010` for the shadow — while
 * getComputedStyle hands back rgb() for everything it resolves; both forms are
 * read here so an expectation can be taken from a token and compared with what
 * the element got.
 */
export function tokenColour(value: string): Colour | null {
  const text = value.trim();
  if (!HEX.test(text)) return normaliseColour(text);
  const digits = text.slice(1).toLowerCase();
  const wide = digits.length > 4;
  const size = wide ? 2 : 1;
  const channel = (index: number) => {
    const part = digits.slice(index * size, index * size + size);
    return wide ? part : part + part;
  };
  const alpha = digits.length === 4 || digits.length === 8 ? parseInt(channel(3), 16) / 255 : 1;
  if (alpha === 0) return null;
  return { hex: `#${channel(0)}${channel(1)}${channel(2)}`, alpha };
}

/** Every colour named in a token value, in the order it appears. */
export function tokenColours(value: string): Colour[] {
  const found: Colour[] = [];
  for (const [word] of value.matchAll(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi)) {
    const colour = tokenColour(word);
    if (colour) found.push(colour);
  }
  return found;
}

/** Is this a colour of the game's palette? */
export function inPalette(colour: Colour) {
  return PALETTE.has(colour.hex);
}

/**
 * Inside the chain graph, any colour of the game's whole palette: a cargo is painted in
 * the index the set assigned it, which need not be one of the interface gradients
 * (ADR-0008). Everywhere else the narrower rule above holds.
 */
export const GRAPH_CANVAS = 'graph-canvas';
export function inGamePalette(colour: Colour) {
  return GAME_PALETTE.has(colour.hex);
}

/**
 * The colour a theme token stands for, as an element would have to report it.
 * Throws rather than returns null: a token that holds no colour means the check
 * is comparing against nothing, which would pass for the wrong reason.
 */
export function fromToken(tokens: Readonly<Record<string, string>>, token: string) {
  const colour = tokenColour(tokens[token] ?? '');
  if (!colour) throw new Error(`token ${token} holds no colour: ${JSON.stringify(tokens[token])}`);
  return colour.hex;
}

/** The colour an element was painted in, by the declaration it came from. */
export function painted(value: string | undefined, what: string) {
  const colour = value === undefined ? null : normaliseColour(value);
  if (!colour) throw new Error(`${what} paints nothing: ${JSON.stringify(value)}`);
  return colour.hex;
}
