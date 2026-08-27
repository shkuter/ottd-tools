import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PALETTE, SHADES, WINDOW_COLOURS, gradients, kebab, named } from '../skin';

/**
 * Guards the rule the skin is built on the way settings-effect.test.ts guards
 * the settings: every colour of the interface is a colour of the game's
 * palette, taken by name, and a hex typed straight into a rule fails here
 * instead of quietly becoming a colour OpenTTD does not have.
 */

const files = ['../skin.css', '../skin-mantine.css'];

/** Colours drawn by something other than the game, and their reason. */
const ALLOWED = new Map([
  // the FIRS graph is rendered by graphviz on a white sheet
  ['#fff', 'graphviz draws the FIRS chart on white'],
]);

/** Hex literals, and the --ottd-* variables that stand for palette entries. */
const HEX = /#[0-9a-f]{3,8}\b/gi;
const OTTD_VAR = /var\(--ottd-([a-z0-9-]+)\)/gi;

const names = new Set([
  ...Object.entries(gradients).flatMap(([colour, shades]) =>
    shades.map((_, index) => `${kebab(colour)}-${SHADES[index]}`),
  ),
  ...Object.keys(named).map(kebab),
]);

function read(file: string) {
  return readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8');
}

/**
 * Comments are stripped before the sweep: a colour named in prose — the #ccc
 * Recharts defaults to, say — explains a rule rather than painting anything,
 * and failing on it would only push the explanation out of the file.
 */
function rules(file: string) {
  return read(file).replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('window themes', () => {
  it('defines every colour group the shell can paint a window in', () => {
    const css = read('../skin.css');
    for (const colour of WINDOW_COLOURS) {
      // grey is the base theme, declared beside :root rather than on its own
      const selector = `[data-window='${colour}']`;
      expect(css.includes(selector), `skin.css has no ${selector} block`).toBe(true);
    }
  });
});

describe('skin palette', () => {
  it.each(files)('%s uses no colour outside the base set', (file) => {
    const css = rules(file);
    for (const hex of css.match(HEX) ?? []) {
      const colour = hex.toLowerCase();
      if (ALLOWED.has(colour)) continue;
      expect(PALETTE.has(colour), `${file}: ${hex} is not a colour of the palette`).toBe(true);
    }
  });

  it.each(files)('%s names only palette variables that exist', (file) => {
    const css = rules(file);
    for (const [, name] of css.matchAll(OTTD_VAR)) {
      expect(names.has(name), `${file}: --ottd-${name} is not published by applyPalette`).toBe(
        true,
      );
    }
  });
});
