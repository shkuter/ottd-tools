import { beforeAll, describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';
import { snapshot, type ThemeTokens } from './collect';
import { ROUTES } from './routes';
import { openKit } from './kit';

/**
 * A window of OpenTTD is painted in the colour group of its kind, and a tab here
 * follows: the settings tab is the game's settings window, the rest are the
 * vehicle-purchase window. What the group means in colours is not written down
 * here — the reference values are read off the theme carriers on /kit, so
 * repainting a group in skin.css moves the expectation with it.
 */

const harness = harnessFixture();
let reference: Record<string, ThemeTokens>;

beforeAll(async () => {
  // /kit carries a section per colour group, so one visit yields every reference
  reference = (await (await openKit(harness())).evaluate(snapshot)).themes;
});

describe.each(ROUTES)('$path', (route) => {
  it('is painted in the colours of its window', async () => {
    const page = await harness().goto(route.path, route.ready);
    const shot = await page.evaluate(snapshot);

    expect(shot.window, `data-window on <html> for ${route.path}`).toBe(route.window);

    // no attribute means the base theme, which the reference calls grey
    const group = route.window || 'grey';
    const expectedTokens = reference[group];
    expect(expectedTokens, `no reference for the ${group} group`).toBeDefined();

    const tokens = shot.themes[group];
    for (const token of ['--skin-window', '--skin-text', '--skin-muted'] as const) {
      expect(tokens[token], `${token} on ${route.path}`).toBe(expectedTokens[token]);
    }
  });
});
