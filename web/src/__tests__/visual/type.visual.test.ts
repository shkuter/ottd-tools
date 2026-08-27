import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';
import { snapshot } from './collect';
import { ROUTES } from './routes';

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

