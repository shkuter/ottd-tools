import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { WINDOW_COLOURS } from '../../skin';
import { harnessFixture, VIEWPORT } from './harness';
import { normaliseColour } from './colours';
import { openKit, showGroup, showWindow } from './kit';

/**
 * The window the differences are confirmed in. It is the one place the shell is allowed an
 * inner scroll area: a window has a height of its own, and a list of differences is easily
 * taller than the screen. The page under it, meanwhile, keeps standing still — the rule about
 * one scrollbar is about the page, and the page is not what is being scrolled.
 *
 * Driven with a real savegame rather than with a stand-in: what makes the window tall is the
 * table of differences, and that is what has to fit in it.
 */

const harness = harnessFixture();
/* the page is shared by the whole file, so a check that resized it puts the size back */
afterEach(async () => {
  await harness().page.setViewportSize(VIEWPORT);
});

const SAVEGAME = fileURLToPath(
  new URL('../../savegame/__tests__/fixtures/londworth-1975.sav', import.meta.url),
);

describe('the import window', () => {
  it('scrolls its content inside itself and leaves the page still', async () => {
    const page = await harness().goto('/optimizer', '.page-optimizer');
    // a screen too short for the differences: on a desktop they fit, and then there is no
    // inner scrolling to look at
    await page.setViewportSize({ width: 1440, height: 500 });
    await page.setInputFiles('.savegame-launcher input[type=file]', SAVEGAME);
    await page.waitForSelector('.savegame-diff');

    const shot = await page.evaluate(() => {
      const content = document.querySelector('.mantine-Modal-content')!;
      const inner = document.querySelector('.mantine-Modal-inner')!;
      const box = content.getBoundingClientRect();
      const scroller = [content, inner, ...content.querySelectorAll('*')].find(
        (element) =>
          element.scrollHeight > element.clientHeight + 1 &&
          ['auto', 'scroll'].includes(getComputedStyle(element).overflowY),
      );
      return {
        scroller: scroller ? scroller.className.toString() : null,
        /** how much of the content is out of sight — the window keeps its own height */
        hidden: scroller ? scroller.scrollHeight - scroller.clientHeight : 0,
        fits: box.top >= 0 && box.bottom <= window.innerHeight + 1,
      };
    });

    expect(shot.scroller, 'nothing inside the window scrolls').not.toBeNull();
    // the differences of a real game do not fit a screen this short; if they ever do, this
    // check is measuring nothing and should be given a taller savegame
    expect(shot.hidden, 'the whole content is on screen as it is').toBeGreaterThan(0);
    expect(shot.fits, 'the window hangs off the edge of the screen').toBe(true);

    // the page behind it does not move under the wheel — which is how a player would
    // scroll it; the pointer is put to the left of the window, on the page itself
    const before = await page.evaluate(() => window.scrollY);
    await page.mouse.move(5, 500);
    await page.mouse.wheel(0, 600);
    const after = await page.evaluate(() => window.scrollY);
    expect(after, 'the page scrolled under the open window').toBe(before);

    // and the confirmation is reachable: scrolled into view, it lands inside the window
    const apply = page.locator('.savegame-diff button').first();
    await apply.scrollIntoViewIfNeeded();
    expect(await apply.isVisible()).toBe(true);
  });
});

/**
 * A window takes the colour group of the tab it stands over, the way every window of the game
 * wears the colour of what it belongs to. It renders into a portal under <body>, so this is
 * only true as long as the theme is carried by <html> — a theme on the page would not reach
 * it, and the window would come up in the base group instead.
 */
describe('the colour of a window', () => {
  it('follows the group of the page under it', async () => {
    const seen = new Map<string, string>();
    for (const group of WINDOW_COLOURS) {
      const page = await openKit(harness());
      await showGroup(page, group);
      await showWindow(page);

      const painted = await page.evaluate(() => {
        const content = document.querySelector('.mantine-Modal-content')!;
        return {
          background: getComputedStyle(content).backgroundColor,
          token: getComputedStyle(document.documentElement)
            .getPropertyValue('--skin-window')
            .trim(),
        };
      });

      // the token is a palette entry, so it comes back as a hex; the painted colour as rgb()
      expect(
        normaliseColour(painted.background)?.hex,
        `the window in the ${group} group is filled ${painted.background}, not ${painted.token}`,
      ).toBe(painted.token.toLowerCase());
      seen.set(group, normaliseColour(painted.background)?.hex ?? painted.background);
    }

    // and the groups really differ: one colour everywhere would pass the check above
    expect(new Set(seen.values()).size, `the groups came up as ${[...seen]}`).toBe(seen.size);
  });
});

/**
 * The caption bar carries the cross on its right, and it stays on screen while the content
 * scrolls: so does the row that confirms or cancels, on the bottom edge. A confirmation that
 * has to be scrolled down to reads as one that is not there.
 */
describe('the caption bar and the buttons of a window', () => {
  it('keeps the cross on the right of the caption', async () => {
    const page = await openKit(harness());
    await showWindow(page);

    const bar = await page.evaluate(() => {
      const rect = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect();
      return { close: rect('.mantine-Modal-close'), title: rect('.mantine-Modal-title'),
        content: rect('.mantine-Modal-content') };
    });

    expect(bar.close.left, 'the cross is drawn before the title').toBeGreaterThanOrEqual(
      bar.title.right,
    );
    expect(
      bar.content.right - bar.close.right,
      'the cross is not at the right edge of the window',
    ).toBeLessThan(bar.content.width / 4);
  });

  it('stands still while the differences scroll behind them', async () => {
    const page = await harness().goto('/optimizer', '.page-optimizer');
    await page.setInputFiles('.savegame-launcher input[type=file]', SAVEGAME);
    await page.waitForSelector('.savegame-diff');

    const before = await page.evaluate(() => {
      const rect = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect();
      return { header: rect('.mantine-Modal-header').top, actions: rect('.window-actions').bottom,
        content: rect('.mantine-Modal-content').bottom };
    });

    await page.evaluate(() => {
      document.querySelector('.mantine-Modal-body')!.scrollTop = 400;
    });
    const after = await page.evaluate(() => {
      const rect = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect();
      return { header: rect('.mantine-Modal-header').top, actions: rect('.window-actions').bottom,
        scrolled: document.querySelector('.mantine-Modal-body')!.scrollTop };
    });

    expect(after.scrolled, 'the content did not scroll, so nothing is being checked')
      .toBeGreaterThan(0);
    expect(after.header, 'the caption bar scrolled away').toBe(before.header);
    expect(after.actions, 'the row of buttons scrolled away').toBe(before.actions);
    // and the buttons are inside the window, on its bottom edge
    expect(before.content - before.actions).toBeLessThan(40);

    // nothing shows under the row: a gap below it is one the content keeps scrolling through
    const bottomEdge = await page.evaluate(() => {
      const body = document.querySelector('.mantine-Modal-body')!.getBoundingClientRect();
      const row = document.querySelector('.window-actions')!.getBoundingClientRect();
      const under = document.elementFromPoint(row.left + row.width / 2, body.bottom - 2);
      return { gap: body.bottom - row.bottom, under: !!under?.closest('.window-actions') };
    });
    expect(bottomEdge.gap, 'the content scrolls through a gap under the buttons').toBeLessThanOrEqual(1);
    expect(bottomEdge.under, 'something other than the buttons is drawn at the bottom edge').toBe(true);
  });

  it('shows the differences without scrolling sideways on a desktop', async () => {
    // the file's own page is shared, so the size is the one a desktop has
    const page = await harness().goto('/optimizer', '.page-optimizer');
    await page.setInputFiles('.savegame-launcher input[type=file]', SAVEGAME);
    await page.waitForSelector('.savegame-diff');

    const sideways = await page.evaluate(() => {
      const content = document.querySelector('.mantine-Modal-content')!;
      return [content, ...content.querySelectorAll('*')]
        .filter((element) => element.scrollWidth > element.clientWidth + 1)
        .map((element) => element.className.toString() || element.tagName);
    });

    expect(sideways, 'something in the window is wider than the window').toEqual([]);
  });
});

/**
 * The button is pinned over the page, the window over everything: a window that opened
 * under its own button would leave it clickable while the differences wait to be confirmed.
 */
describe('an open window', () => {
  it('covers the button that opened it', async () => {
    const page = await openKit(harness());
    await showWindow(page);

    const covered = await page.evaluate(() => {
      const box = document.querySelector('.savegame-launcher')!.getBoundingClientRect();
      const onTop = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return {
        launcher: !!onTop?.closest('.savegame-launcher'),
        what: onTop?.className.toString() ?? '',
      };
    });

    expect(covered.launcher, `the button is on top of the window (${covered.what})`).toBe(false);
  });
});

/**
 * The same panel stands on the settings screen, in the flow of the page. What the window
 * gives it — a row of buttons pinned to the bottom edge — must not follow it there, or the
 * confirmation floats over the settings.
 */
describe('the import panel on the settings screen', () => {
  it('keeps its buttons in the flow of the page', async () => {
    const page = await harness().goto('/settings', '.page-settings');
    await page.setInputFiles('.savegame-import input[type=file]', SAVEGAME);
    await page.waitForSelector('.page-settings .savegame-diff');

    const pinned = await page.evaluate(() => {
      const row = document.querySelector('.page-settings .window-actions')!;
      return {
        position: getComputedStyle(row).position,
        // the row sits with the panel, not at the bottom of the screen
        offScreen: row.getBoundingClientRect().bottom > window.innerHeight,
      };
    });

    expect(pinned.position, 'the settings panel pins its buttons like the window').toBe('static');
    expect(pinned.offScreen, 'the buttons are held at the bottom of the screen').toBe(true);
  });
});
