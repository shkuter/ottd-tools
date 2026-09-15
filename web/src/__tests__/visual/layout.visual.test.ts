import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';
import { snapshot } from './collect';
import { ROUTES } from './routes';

/**
 * The shell is an ordinary document: the page is as tall as its content and
 * scrolls as a whole, header and footer included. So there is one vertical
 * scrollbar in the window and no inner scroll areas for lists or graphs —
 * sideways scrolling stays where the content really is wider than its column,
 * which is the catalogue and the chain graph. The one vertical exception is the
 * third one of the spec: a side panel held beside the content on a wide window
 * (the consist panel, the column of the chain graph) scrolls inside itself once
 * it is taller than the window; the tab names such panels in `scrollsY`.
 *
 * What is measured is a bar that is actually there — content taller than its box
 * with an overflow that lets it scroll. A scroll area that is declared but never
 * fills up draws nothing and is left alone; whether one exists at all cannot be
 * told from the stylesheet either way, which is why this is asked of the
 * rendered page.
 */

const harness = harnessFixture();

describe.each(ROUTES)('$path', (route) => {
  it('scrolls as one document', async () => {
    const page = await harness().goto(route.path, route.ready);
    const shot = await page.evaluate(snapshot);

    const panels = route.scrollsY ?? [];
    const inner = shot.elements.filter(
      (element) => element.scrollsY && !element.classes.some((name) => panels.includes(name)),
    );
    expect(
      inner.map((element) => element.path),
      'the window is meant to hold one vertical scrollbar — the page itself',
    ).toEqual([]);

    const sideways = shot.elements.filter((element) => element.scrollsX);
    const allowed = route.scrollsX ?? [];
    const unexpected = sideways.filter(
      (element) => !element.classes.some((name) => allowed.includes(name)),
    );
    expect(
      unexpected.map((element) => element.path),
      'only the catalogue and the chain graph may scroll sideways',
    ).toEqual([]);
  });
});
