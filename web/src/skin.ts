import paletteJson from './data/opengfx2_palette.json';

/**
 * GUI colours of the base set: 16 colours of 8 shades, extracted from the
 * recolour sprites of OpenGFX2 Classic (see pipeline/extract_opengfx2.py).
 */
export const gradients = (paletteJson as { gradients: Record<string, string[]> }).gradients;

export const paletteSource = (paletteJson as { source: string }).source;

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

/** Publish the palette as CSS custom properties: --ottd-grey-dark and so on. */
export function applyPalette(root: HTMLElement = document.documentElement) {
  for (const [colour, shades] of Object.entries(gradients)) {
    const name = colour.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    shades.forEach((value, index) => {
      root.style.setProperty(`--ottd-${name}-${SHADES[index]}`, value);
    });
  }
}
