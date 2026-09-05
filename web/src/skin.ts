import paletteJson from './data/opengfx2_palette.json';

/**
 * GUI colours of the base set: 16 colours of 8 shades, extracted from the
 * recolour sprites of OpenGFX2 Classic (see pipeline/extract_opengfx2.py).
 */
export const gradients = (paletteJson as { gradients: Record<string, string[]> }).gradients;

/**
 * Colours the game names outright instead of picking a gradient shade: the text
 * roles (TC_*, string_colours.h) and the fixed GUI colours (PC_*,
 * palette_func.h). They are palette indices, so the skin can reach for exactly
 * the colour the game uses for the same job — pure black text, for one, is
 * TC_BLACK #101010 and belongs to no gradient at all.
 */
export const named = (paletteJson as { named: Record<string, string> }).named;


/**
 * Shade names as the game knows them (palette_func.h:73). DrawFrameRect uses
 * Dark for one pair of edges, Lightest for the other and Light/Lighter for the
 * interior — that is what makes an OpenTTD widget look raised or lowered.
 */
export const SHADES = [
  'darkest',
  'darker',
  'dark',
  'normal',
  'light',
  'lighter',
  'lightest',
  'lighterest',
] as const;

/**
 * Every colour the base set has, gradients and named ones together — the set an
 * interface colour has to belong to. Built here so the rule has one definition:
 * both the stylesheet check and the rendered-page checks ask the same question.
 */
export const PALETTE: ReadonlySet<string> = new Set([
  ...Object.values(gradients).flat(),
  ...Object.values(named),
]);

/**
 * The skin's one geometry multiplier, as `--skin-scale` in skin.css sets it. Kept in TS for
 * the chain graph, whose node boxes the layout engine has to be told in numbers before
 * anything is styled; `sizes.test.ts` holds the two to the same value.
 */
export const SKIN_SCALE = 1.5;
/** `--bevel`: the 1px lines of the game, scaled and rounded to whole pixels. */
export const BEVEL = Math.round(1 * SKIN_SCALE);

/** camelCase of the palette data to the kebab-case CSS custom properties use. */
export const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * Colour groups of the game the shell can paint a window in — one [data-window]
 * block each in skin.css. Kept here rather than in either place that reads it
 * (the route table in App.tsx, the specimens on /kit) so a new group is added
 * once; skin-palette.test.ts checks the stylesheet actually defines them.
 */
export const WINDOW_COLOURS = ['grey', 'mauve', 'brown', 'dark-green'] as const;

export type WindowColour = (typeof WINDOW_COLOURS)[number];

/**
 * Publish the palette as CSS custom properties: --ottd-grey-dark for a gradient
 * shade, --ottd-tc-black for a named colour.
 */
export function applyPalette(root: HTMLElement = document.documentElement) {
  for (const [colour, shades] of Object.entries(gradients)) {
    shades.forEach((value, index) => {
      root.style.setProperty(`--ottd-${kebab(colour)}-${SHADES[index]}`, value);
    });
  }
  for (const [colour, value] of Object.entries(named)) {
    root.style.setProperty(`--ottd-${kebab(colour)}`, value);
  }
}

/**
 * Which step of the width scale in skin.css the field stands on.
 *
 * `content` is not a step but the absence of one: a group of buttons is as wide
 * as its own labels, the way the game sizes them. Held to a step it either
 * clips them (Russian "Снабжение" wanted 255px of a 189px field) or leaves a
 * gap inside itself (English "Profit / Haul / Supply" filled 166 of the same
 * 189) — and which of the two happens depends on the language.
 */
export type FieldWidth = 'narrow' | 'normal' | 'wide' | 'content';

/**
 * The width as a Mantine input takes it. Those draw their own label and need
 * nothing else from Field, but the step they stand on has to be named the same
 * way — spelling the attribute out by hand at each call site is how one of them
 * ends up on a step that does not exist.
 */
export function fieldWidth(width: FieldWidth) {
  return { 'data-width': width };
}
