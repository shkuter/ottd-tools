import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';
import { ROUTES } from './routes';

/**
 * An icon standing in for a label. It comes out of the game's own sets through
 * the pipeline, so what is checked is that it is one of those and that it
 * loaded — and that the control it names is still named, because a picture
 * says nothing to anything that cannot see it.
 */

const harness = harnessFixture();

/**
 * Tabs whose filter row names a switch with a picture instead of a label. The supply tab
 * had one for the electrified line; that question is the track type now, and a track is
 * picked from a list rather than switched on.
 */
const WITH_ICONS = ['/optimizer'];

describe.each(ROUTES)('$path', ({ path, ready }) => {
  it('draws an icon standing in for a label from the game', async () => {
    const page = await harness().goto(path, ready);

    const icons = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>('.gui-icon')].map((img) => ({
        src: img.getAttribute('src') ?? '',
        loaded: img.complete && img.naturalWidth > 0,
        // the switch it names, which is what a reader without the picture gets
        named: img.closest('.mantine-Switch-root')?.querySelector('input')?.getAttribute('aria-label') ?? '',
      })),
    );

    // where the tab has none, there is nothing to judge; where it has them, the
    // check must be able to fail — a renamed class would otherwise pass silently
    if (icons.length === 0) {
      expect(WITH_ICONS, `${path} shows no icon`).not.toContain(path);
      return;
    }
    expect(WITH_ICONS, `${path} shows icons but is not listed as a tab that does`).toContain(path);

    for (const icon of icons) {
      expect(icon.src, 'the icon comes from the extracted base set').toContain(
        'icons/vanilla_gui/',
      );
      expect(icon.loaded, `${icon.src} did not load`).toBe(true);
      expect(icon.named, `${icon.src} names nothing`).not.toBe('');
    }
  });
});

