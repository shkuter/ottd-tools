import {
  createTheme,
  Select,
  type ComboboxProps,
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
 *
 * One shape does live here rather than in the stylesheets: the size and place of
 * a dropdown, which the library writes as an inline style and no rule can reach
 * (see gameLikeDropdown below).
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

/**
 * A metric of the game, in the interface scale the skin is set to. The scale
 * itself lives in one place (--skin-scale, skin.css); this only spells the
 * multiplication out for Mantine, which wants plain values in its theme.
 */
const scaled = (unscaled: number) => `round(calc(${unscaled}px * var(--skin-scale)), 1px)`;

/*
 * The gap Mantine's own `shift` keeps between a floating element and the edge of the
 * window (`padding: 5` in getPopoverMiddlewares). `size` is given the same gap, or it would
 * report the whole viewport as available while `shift` holds the list five pixels short of
 * it — and the list would hang exactly those five pixels off the screen.
 */
const WINDOW_EDGE_GAP = 5;

/*
 * A dropdown as wide as it needs to be, the way the game sizes its own: the
 * width of the longest item, raised to the width of the button when the items
 * are shorter (dropdown.cpp, UpdateSizeAndPosition and GetDropDownListDimension),
 * and never past the edge of the window.
 *
 * It has to be a default prop rather than a rule in skin-mantine.css: Mantine's
 * own default is `width: 'target'`, and at that value it writes the field's
 * width onto the dropdown as an inline style (the `size` branch of
 * getPopoverMiddlewares in @mantine/core/.../use-popover.mjs), which no rule can
 * override. Line numbers are left out on purpose — they move with every patch
 * release of the package.
 *
 * `max-content` keeps each item on one line while it fits; once maxWidth cuts
 * in, the item wraps again on its own, which is what a narrow window needs. No
 * `white-space` rule anywhere does that work.
 *
 * A list of another kind — MultiSelect, Autocomplete, a bare Combobox — has to
 * be given the same defaults. The app has none today, which is the only reason
 * `Select` alone covers "every dropdown".
 */
const gameLikeDropdown: ComboboxProps = {
  width: 'max-content',
  /*
   * Aligned with the left edge of the field, the way the game aligns a list with the left
   * edge of its button (dropdown.cpp, UpdateSizeAndPosition). Mantine centres a popover on
   * its target, which is invisible while the list is the width of the field and sends the
   * list off to the left as soon as it is wider.
   */
  position: 'bottom-start',
  middlewares: {
    size: {
      padding: WINDOW_EDGE_GAP,
      apply: ({ rects, availableWidth, elements }) => {
        elements.floating.style.minWidth = `${rects.reference.width}px`;
        elements.floating.style.maxWidth = `${availableWidth}px`;
      },
    },
  },
};

export const theme: MantineThemeOverride = createTheme({
  components: {
    Select: Select.extend({ defaultProps: { comboboxProps: gameLikeDropdown } }),
  },

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

  /*
   * The font steps are the skin's own tokens rather than a second copy of the
   * arithmetic: --skin-font is the game's FS_NORMAL times --skin-scale, and the
   * others follow it (skin.css). Mantine reaches for `sm` when a component is
   * given no size, so the game's size goes in both `sm` and `md`: the controls
   * come out game-sized without a size prop on every call, and
   * --mantine-font-size-md still means the body size.
   */
  fontSizes: {
    xs: 'var(--skin-font-small)',
    sm: 'var(--skin-font)',
    md: 'var(--skin-font)',
    lg: 'var(--skin-font-heading)',
    xl: 'var(--skin-font-large)',
  },
  headings: {
    // the game's font has one face; a bolder heading would be a synthesised one
    fontWeight: '400',
    sizes: {
      h1: { fontSize: 'var(--skin-font-large)' },
      h2: { fontSize: 'var(--skin-font-heading)' },
      h3: { fontSize: 'var(--skin-font)' },
      h4: { fontSize: 'var(--skin-font-small)' },
      h5: { fontSize: 'var(--skin-font-small)' },
      h6: { fontSize: 'var(--skin-font-small)' },
    },
  },

  /* vsep_normal 2 and its multiples: the gaps the game leaves between widgets */
  spacing: {
    xs: scaled(2),
    sm: scaled(4),
    md: scaled(6),
    lg: scaled(8),
    xl: scaled(10),
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
 *
 * Only the roles that do not follow the window colour live here. The ones that
 * do are written in skin.css beside the themes themselves — a variable declared
 * on <html> keeps the value it computed there, so it could not follow a theme
 * set further down the page (see the [data-window] block).
 */
const skinColours = {
  /*
   * The library's own black and white, which it hands out as a text colour to
   * switches, checkboxes and segmented controls. Pure #fff and #000 are not
   * colours of the game's palette — TC_WHITE is #fcfcfc and TC_BLACK #101010 —
   * so they are pointed at the real ones rather than left to leak through.
   */
  '--mantine-color-white': 'var(--ottd-tc-white)',
  '--mantine-color-black': 'var(--ottd-tc-black)',

  '--mantine-color-anchor': 'var(--skin-link)',
  '--mantine-color-error': 'var(--skin-loss)',
  '--mantine-color-success': 'var(--skin-profit)',

  // a filled button is the game's yellow with black lettering
  '--mantine-primary-color-filled': 'var(--skin-button)',
  '--mantine-primary-color-filled-hover': 'var(--skin-button-hover)',
  '--mantine-primary-color-contrast': 'var(--skin-button-text)',
  '--mantine-primary-color-light': 'var(--skin-button)',
  '--mantine-primary-color-light-hover': 'var(--skin-button-hover)',
  '--mantine-primary-color-light-color': 'var(--skin-button-text)',
};

/*
 * Control heights, on the same scale as everything else. The game's widget is
 * as tall as a scrollbar button — 12 unscaled — and the steps either side of it
 * are interpolated the way the font sizes are; `sm` and `md` hold the game's
 * own height for the same reason they hold its font size.
 */
const HEIGHTS = { xs: 8, sm: 12, md: 12, lg: 16, xl: 20 };

const skinMetrics = Object.fromEntries(
  Object.entries(HEIGHTS).flatMap(([step, unscaled]) => [
    [`--input-height-${step}`, scaled(unscaled)],
    [`--button-height-${step}`, scaled(unscaled)],
    // a compact button drops the padding, not the text: one bevel shorter
    [`--button-height-compact-${step}`, scaled(unscaled - 2)],
  ]),
);

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: skinMetrics,
  dark: skinColours,
  light: skinColours,
});
