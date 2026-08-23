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
