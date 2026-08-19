import {
  createTheme,
  type CSSVariablesResolver,
  type MantineColorsTuple,
  type MantineThemeOverride,
} from '@mantine/core';
import { gradients } from './skin';

/**
 * Mantine's theme, built from the colours of the base set.
 *
 * The look itself lives in skin.css — this only teaches Mantine the game's
 * palette, font and metrics so its components start in the right place instead
 * of being dragged there rule by rule.
 */

/**
 * A colour group of the base set has 8 shades (see SHADES in skin.ts), a
 * MantineColorsTuple needs at least 10. Duplicating the two ends keeps every
 * shade at its own position instead of interpolating colours the game does not
 * have: index 1 + n maps to shade n, so shade `light` (4) lands on index 5 —
 * that is where PRIMARY_SHADE points.
 */
export function colourTuple(shades: readonly string[]): MantineColorsTuple {
  const [first] = shades;
  const last = shades[shades.length - 1];
  return [first, ...shades, last] as unknown as MantineColorsTuple;
}

/** Index of the `light` shade in the expanded tuple — the game's button fill. */
export const PRIMARY_SHADE = 5;

export const theme: MantineThemeOverride = createTheme({
  // the game paints its windows grey and fills its buttons yellow
  colors: {
    gray: colourTuple(gradients.grey),
    dark: colourTuple(gradients.grey),
    yellow: colourTuple(gradients.yellow),
    green: colourTuple(gradients.green),
    red: colourTuple(gradients.red),
    ottdBlue: colourTuple(gradients.darkBlue),
  },
  primaryColor: 'yellow',
  primaryShade: PRIMARY_SHADE,

  // OpenTTD draws square widgets with 2px bevels; the bevels are skin.css's job
  defaultRadius: 0,

  fontFamily: "'OpenTTD Sans', 'Segoe UI', system-ui, sans-serif",
  fontFamilyMonospace: "'OpenTTD Mono', ui-monospace, monospace",
  fontSizes: {
    xs: '12px',
    sm: '14px',
    md: '14px',
    lg: '16px',
    xl: '18px',
  },
  headings: {
    sizes: {
      h1: { fontSize: '24px' },
      h2: { fontSize: '18px' },
      h3: { fontSize: '16px' },
      h4: { fontSize: '12px' },
      h5: { fontSize: '12px' },
      h6: { fontSize: '12px' },
    },
  },

  cursorType: 'pointer',
});

/**
 * Point Mantine at the skin's own tokens instead of giving it a second set of
 * colours. Everything here resolves to a --skin-* variable defined in
 * skin.css, so recolouring the interface stays a one-block edit there.
 *
 * These go into the colour-scheme block, not the shared one: Mantine writes its
 * own defaults under :root[data-mantine-color-scheme=...], and that selector
 * outranks a plain :root no matter which of the two is written last. The scheme
 * is forced (see main.tsx), so both branches hold the same values.
 */
const skinColours = {
  // window surface and text, the way the game paints its dialogs
  '--mantine-color-body': 'var(--skin-window)',
  '--mantine-color-text': 'var(--skin-text)',
  '--mantine-color-bright': 'var(--skin-text)',
  '--mantine-color-dimmed': 'var(--skin-label)',
  '--mantine-color-placeholder': 'var(--skin-label)',
  '--mantine-color-anchor': 'var(--skin-link)',
  '--mantine-color-error': 'var(--skin-loss)',
  '--mantine-color-success': 'var(--skin-profit)',

  // "default" is what inputs, plain buttons and table surfaces are made of
  '--mantine-color-default': 'var(--skin-field-bg)',
  '--mantine-color-default-hover': 'var(--skin-window-hover)',
  '--mantine-color-default-color': 'var(--skin-field-text)',
  '--mantine-color-default-border': 'var(--skin-edge-lo)',
  '--mantine-color-disabled': 'var(--skin-window)',
  '--mantine-color-disabled-color': 'var(--skin-label)',
  '--mantine-color-disabled-border': 'var(--skin-edge-lo)',

  // a filled button is the game's yellow with black lettering
  '--mantine-primary-color-filled': 'var(--skin-button)',
  '--mantine-primary-color-filled-hover': 'var(--skin-button-hover)',
  '--mantine-primary-color-contrast': 'var(--skin-button-text)',
  '--mantine-primary-color-light': 'var(--skin-button)',
  '--mantine-primary-color-light-hover': 'var(--skin-button-hover)',
  '--mantine-primary-color-light-color': 'var(--skin-button-text)',
};

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  dark: skinColours,
  light: skinColours,
});
