import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXEMPT_ELEMENTS, SHOWN_ELEMENTS } from '../shown';

/**
 * The interface-elements page is the only place the skin is seen whole, and it is only worth
 * that while it holds one of everything the app draws. The rule is easy to break by accident:
 * a component is added to a tab, and the page nobody opens while writing it stays as it was.
 *
 * So the page's own claim (SHOWN_ELEMENTS) is held against what the app actually uses, read
 * off the source — the exports of `components/` and the library components the tabs import.
 */

const SRC = new URL('../../..', import.meta.url).pathname;

/** The page's own source, and everything else the app is drawn from. */
const KIT = join(SRC, 'features', 'kit');

function files(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') files(path, out);
    } else if (entry.name.endsWith('.tsx')) {
      out.push(path);
    }
  }
  return out;
}

/** Components the app defines for itself, by the name they are exported under. */
function ourComponents(): string[] {
  return files(join(SRC, 'components')).flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return [
      ...[...source.matchAll(/^export function ([A-Z][A-Za-z]*)/gm)],
      ...[...source.matchAll(/^export const ([A-Z][A-Za-z]*) = /gm)],
    ].map((match) => match[1]);
  });
}

/**
 * Components of the library the app puts on screen — read from every file it is drawn from,
 * not only the tabs: the shell and our own components use the library too.
 */
function libraryComponents(): string[] {
  const names = new Set<string>();
  for (const file of files(SRC)) {
    if (file.startsWith(KIT)) continue;
    const source = readFileSync(file, 'utf8');
    for (const block of source.matchAll(/import \{([^}]*)\} from '@mantine\/(?:core|charts)'/g)) {
      for (const name of block[1].split(',')) {
        const cleaned = name.trim();
        // `type Foo` is a type import, not something drawn on screen
        if (/^[A-Z][A-Za-z]*$/.test(cleaned) && drawn(source, cleaned)) names.add(cleaned);
      }
    }
  }
  return [...names];
}

/** Is the component actually used as an element, rather than merely named? */
function drawn(source: string, name: string): boolean {
  return new RegExp(`<${name}[\\s/>.]`).test(source);
}

describe('the interface-elements page', () => {
  it('shows one of everything the app draws', () => {
    const ours = ourComponents();
    const library = libraryComponents();
    // a walk that found nothing would make every assertion below pass on emptiness
    expect(ours.length, 'no components of our own were found to check against').toBeGreaterThan(10);
    expect(library.length, 'no library components were found to check against').toBeGreaterThan(10);

    const shown = new Set(SHOWN_ELEMENTS);
    const missing = [...ours, ...library]
      .filter((name) => !shown.has(name) && !(name in EXEMPT_ELEMENTS))
      .sort();

    expect(
      missing,
      'add a specimen to KitPage for these, or name them in EXEMPT_ELEMENTS with the reason',
    ).toEqual([]);
  });

  it('claims nothing it does not draw', () => {
    const page = readFileSync(join(KIT, 'KitPage.tsx'), 'utf8');
    // `<Table` must not stand for `<TableFrame`, so the name has to end where it ends
    const undrawn = SHOWN_ELEMENTS.filter((name) => !drawn(page, name)).sort();

    expect(undrawn, 'these are listed as shown but no specimen uses them').toEqual([]);
  });
});
