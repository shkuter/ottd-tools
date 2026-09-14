import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';
import { snapshot } from './collect';
import { KIT, ROUTES } from './routes';

/**
 * One weight: the game's font ships in a single face, so a rule asking for bold
 * gets a synthesised one — smeared glyphs on a font whose whole point is that
 * its pixels line up. The library asks for 600 on buttons and 700 on headings,
 * and the skin says 400 everywhere; a rule that stops matching (a selector list
 * broken while editing, a component renamed) puts the bold back, and nothing
 * fails — which is exactly what happened before this check existed.
 */

const harness = harnessFixture();

describe.each(ROUTES)('$path', ({ path, ready }) => {
  it('sets everything in the one weight of the game', async () => {
    const page = await harness().goto(path, ready);
    const shot = await page.evaluate(snapshot);

    const bold = shot.elements.filter(
      (el) => el.fontWeight !== '' && Number(el.fontWeight) > 400,
    );

    expect(
      bold.map((el) => `${el.classes.join('.') || el.path}: ${el.fontWeight} — ${el.ownText}`),
      'the font has one face; anything heavier is the browser smearing it',
    ).toEqual([]);
  });
});

/**
 * What is read is not set below the body size. FS_SMALL is the game's size for labels on maps
 * and graphs; the footer, the language switch, the site's line under its name, subheadings and
 * the lettering on buttons are text to read, and at FS_SMALL they came out at 9px. Chart and
 * graph labels are not in the list: they keep whatever size their drawing needs.
 */
const TEXT_TO_READ = [
  '.app-footer .footer-meta',
  '.app-footer a',
  '.app-footer .language-switch',
  '.app-header .subtitle',
  'main h4',
  'main h5',
  'main h6',
  '.mantine-Button-label',
].join(', ');

describe.each([...ROUTES, KIT])('$path', ({ path, ready }) => {
  it('sets what is read at no less than the body size', async () => {
    const page = await harness().goto(path, ready);
    const found = await page.evaluate((selector) => {
      const probe = document.createElement('div');
      probe.style.fontSize = 'var(--skin-font)';
      document.body.append(probe);
      const body = parseFloat(getComputedStyle(probe).fontSize);
      probe.remove();

      const size = (element: Element) => parseFloat(getComputedStyle(element).fontSize);
      const footer = document.querySelector('.app-footer .footer-meta')!;
      return {
        body,
        small: [...document.querySelectorAll(selector)]
          .filter((element) => element.textContent?.trim() && size(element) < body - 0.5)
          .map(
            (element) =>
              `${element.className}: ${getComputedStyle(element).fontSize} — ${element.textContent!.trim().slice(0, 30)}`,
          ),
        footerText: size(footer),
        footerLinks: [...footer.querySelectorAll('a')].map(size),
      };
    }, TEXT_TO_READ);

    expect(found.body, 'the body size did not resolve').toBeGreaterThan(0);
    expect(found.small, 'text to be read is set below the body size').toEqual([]);
    for (const link of found.footerLinks) {
      expect(link, 'a footer link is not the size of the text around it').toBe(found.footerText);
    }
  });
});
