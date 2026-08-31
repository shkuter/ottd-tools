import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';

/**
 * The catalogue with a set other than the one the checks seed.
 *
 * Every other check runs on Iron Horse, which is enough for the skin but says nothing
 * about a set whose data is filed elsewhere: the vanilla sprites live in a directory of
 * their own, and a catalogue that quietly hides every image because the path is wrong
 * looks exactly like a catalogue of vehicles that ship no sprite.
 */

const harness = harnessFixture();

/** Vehicle rows, and how many of them show a sprite the browser actually loaded. */
function catalogueSprites() {
  const rows = [...document.querySelectorAll('main .cell-vehicle')];
  const images = rows.flatMap((cell) => [...cell.querySelectorAll('img.train-sprite')]);
  const loaded = images.filter((img) => {
    const image = img as HTMLImageElement;
    return image.complete && image.naturalWidth > 0 && image.style.display !== 'none';
  });
  return {
    rows: rows.length,
    images: images.length,
    loaded: loaded.length,
    sources: [...new Set(loaded.map((img) => new URL((img as HTMLImageElement).src).pathname))]
      .slice(0, 3),
  };
}

describe('the consist catalogue on the vanilla set', () => {
  it('lists its vehicles and shows their sprites', async () => {
    // the roster is switched the way a player switches it: seeding localStorage would
    // not survive, the harness writes its own settings on every navigation
    const page = await harness().goto('/settings', '.settings-group');
    // the settings rows label their control with a plain span, not a <label>, so the
    // field is found through its row rather than by its label
    await page.locator('.setting-row', { hasText: 'Train set' }).locator('input').first().click();
    await page.getByRole('option', { name: 'Vanilla OpenTTD' }).click();

    // navigating inside the app, not through the address bar: the harness seeds its own
    // settings on every fresh navigation and would undo the choice
    await page.locator('.app-header a[href$="/consist"]').click();
    await page.waitForSelector('.page-consist .cell-vehicle');
    // sprites load lazily, so give the ones on screen a moment to arrive
    await page.waitForFunction(() => {
      const images = [...document.querySelectorAll('img.train-sprite')];
      return images.length > 0 && images.some((img) => (img as HTMLImageElement).complete);
    });

    const seen = await page.evaluate(catalogueSprites);
    expect(seen.rows, 'the vanilla catalogue is not empty').toBeGreaterThan(0);
    expect(seen.loaded, `sprites loaded, sources: ${seen.sources.join(', ')}`)
      .toBeGreaterThan(0);
    expect(seen.sources, 'sprites come from the set\'s own directory')
      .toEqual(seen.sources.filter((path) => path.includes('/icons/vanilla_trains/')));
  });
});
