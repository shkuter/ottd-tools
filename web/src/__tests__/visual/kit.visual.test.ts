import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME, harnessFixture } from './harness';
import { KIT } from './routes';
import { openKit, pictures } from './kit';

/**
 * The interface-elements page itself: that it holds the specimens the checks of the look are
 * written against, and that it holds the same ones whatever game the settings describe.
 *
 * A specimen that quietly disappeared would not fail anything — the checks that use it would
 * simply find nothing to measure and pass. So the roll call is made here, once.
 */

const harness = harnessFixture();

/** Every specimen the checks address by name. */
const SPECIMENS = [
  'kit-tooltip',
  'kit-notify',
  'kit-pressed',
  'kit-dropdown-cargo',
  'kit-dropdown-long',
  'kit-dropdown-short',
  'kit-dropdown-picture',
  'kit-warning',
  'kit-panel',
  'kit-buy-menu-note',
  'kit-prefill-note',
  'kit-setting-rows',
  'kit-summary',
  'kit-pictures',
  'kit-showcase',
  'kit-list',
  'kit-list-empty',
  'kit-pagination',
  'kit-chart',
];

const present = () =>
  [...document.querySelectorAll('[data-testid]')]
    .map((element) => (element as HTMLElement).dataset.testid ?? '')
    .filter((id) => id.startsWith('kit-'));

describe('the interface-elements page', () => {
  it('shows every specimen the checks are written against', async () => {
    const page = await openKit(harness());
    const found = new Set(await page.evaluate(present));

    expect(SPECIMENS.filter((id) => !found.has(id)), 'specimens missing from the page').toEqual([]);
  });

  it('draws every picture it puts on screen', async () => {
    const page = await openKit(harness());
    const drawn = await pictures(page);

    expect(drawn.length, 'the page shows no pictures at all').toBeGreaterThan(0);
    // a sprite whose file is missing hides itself (TrainImage), so a missing id shows up here
    expect(
      drawn.filter((picture) => !picture.drawn).map((picture) => picture.src),
      'pictures that did not load',
    ).toEqual([]);
  });

  it('shows the same specimens whatever game the settings hold', async () => {
    const page = await openKit(harness());
    const before = new Set(await page.evaluate(present));

    try {
      // the vanilla set: another roster, another railtype table, no FIRS cargoes
      await harness().withGame(
        { trainSet: 'vanilla', firs: false, basecostGrf: false },
        KIT.path,
        KIT.ready,
      );
      const after = new Set(await page.evaluate(present));
      expect([...after].sort()).toEqual([...before].sort());
    } finally {
      // the settings outlive the navigation now, so they go back whatever happened above
      await harness().withGame(DEFAULT_GAME, KIT.path, KIT.ready);
    }
  });
});
