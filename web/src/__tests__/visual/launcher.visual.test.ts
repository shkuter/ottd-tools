import { afterEach, describe, expect, it } from 'vitest';
import { harnessFixture, NARROW, VIEWPORT } from './harness';
import { KIT, ROUTES } from './routes';

/**
 * The import button is pinned to the corner of the window, so it is drawn over whatever is
 * underneath it — and what is underneath it is the header. The room the header keeps on its
 * right is measured here rather than trusted: it comes from a custom property the button
 * writes, and a header that wraps (which it does at 400px) would swallow a spacer instead.
 */

const harness = harnessFixture();

afterEach(async () => {
  await harness().page.setViewportSize(VIEWPORT);
});

/** Boxes of the button and of everything the header draws. */
async function boxes(page: Awaited<ReturnType<typeof harness>['page']>) {
  return page.evaluate(() => {
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };
    const header = document.querySelector('.app-header')!;
    const button = document.querySelector('.savegame-launcher')!;
    return {
      button: rect(button),
      header: rect(header),
      parts: [...header.querySelectorAll('h1, .subtitle, nav a, nav button')].map((element) => ({
        name: element.tagName.toLowerCase() + (element.textContent ?? '').slice(0, 20),
        ...rect(element),
      })),
    };
  });
}

function overlapping(shot: Awaited<ReturnType<typeof boxes>>) {
  const { button } = shot;
  return shot.parts.filter(
    (part) =>
      part.right > button.left &&
      part.left < button.right &&
      part.bottom > button.top &&
      part.top < button.bottom,
  );
}

describe.each([...ROUTES, KIT])('$path', (route) => {
  it('keeps the header clear of the import button', async () => {
    const page = await harness().goto(route.path, route.ready);

    const wide = await boxes(page);
    expect(wide.parts.length, 'the header drew nothing to check').toBeGreaterThan(0);
    expect(
      overlapping(wide).map((part) => part.name),
      'the button is drawn over the header',
    ).toEqual([]);

    await page.setViewportSize(NARROW);
    const narrow = await boxes(page);
    expect(
      overlapping(narrow).map((part) => part.name),
      'at 400px the button is drawn over the header',
    ).toEqual([]);
  });
});

describe('the import button', () => {
  it('stays in the corner while the header scrolls away', async () => {
    const page = await harness().goto('/optimizer', '.page-optimizer');
    const before = await boxes(page);

    await page.evaluate(() => window.scrollTo(0, 400));
    const after = await boxes(page);

    expect(after.button.top).toBe(before.button.top);
    expect(after.button.right).toBe(before.button.right);
    // the header is an ordinary part of the page and goes up with it
    expect(after.header.top).toBeLessThan(before.header.top);
  });

  it('shows its whole caption at 400px', async () => {
    const page = await harness().goto('/optimizer', '.page-optimizer');
    await page.setViewportSize(NARROW);

    const caption = await page.evaluate(() => {
      const label = document.querySelector('.savegame-launcher label')!;
      const box = label.getBoundingClientRect();
      return {
        text: (label.textContent ?? '').trim(),
        clipped: label.scrollWidth > label.clientWidth + 1,
        left: box.left,
        right: box.right,
        width: window.innerWidth,
      };
    });

    expect(caption.text, 'the button lost its caption').not.toBe('');
    expect(caption.clipped, 'the caption is cut off').toBe(false);
    expect(caption.left).toBeGreaterThanOrEqual(0);
    expect(caption.right).toBeLessThanOrEqual(caption.width);
  });
});

/**
 * The room the header keeps has to follow the button's real width, not a number chosen for
 * one of the captions: "Load savegame" and «Загрузить сейв» are not the same length, and the
 * language changes without a reload.
 */
describe('the room kept for the button', () => {
  it('follows the caption into another language', async () => {
    // the language is switched the way a player switches it — on the settings screen, with
    // no reload: that is the path the observer is there for, since the button is not
    // remounted and only its width changes
    const page = await harness().goto('/settings', '.page-settings');
    const english = await boxes(page);
    const englishRoom = await room(page);

    const field = page
      .locator('.setting-row', { hasText: 'Language' })
      .locator('.mantine-Select-input');
    await field.click();
    await page.locator('[data-combobox-option]', { hasText: 'Русский' }).click();
    await page.waitForFunction(() => document.documentElement.lang === 'ru');
    const russian = await boxes(page);
    const russianRoom = await room(page);

    // the two captions differ in width, so the check is not comparing a number with itself
    const englishWidth = english.button.right - english.button.left;
    const russianWidth = russian.button.right - russian.button.left;
    expect(Math.round(russianWidth)).not.toBe(Math.round(englishWidth));

    // and the room moved with it, by the same amount
    expect(russianRoom - englishRoom).toBeCloseTo(russianWidth - englishWidth, 0);
    expect(
      overlapping(russian).map((part) => part.name),
      'the button is drawn over the header in Russian',
    ).toEqual([]);

    // back to the language the rest of the file measures in
    await page.evaluate(() => localStorage.removeItem('ottd-tools-locale'));
    await page.reload();
    await page.waitForSelector('.page-settings');
  });
});

/** How much the row with the site's name keeps free on its right. */
function room(page: Awaited<ReturnType<typeof harness>['page']>) {
  return page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('.app-title')!).paddingRight),
  );
}

/**
 * The header is two rows: the site's name with its line, and the menu of tabs under them
 * across the width. The menu is not squeezed by the button in the corner — only the row that
 * shares the corner with it gives up the width.
 */
describe('the rows of the header', () => {
  it('puts the menu under the name, across the width', async () => {
    const page = await harness().goto('/optimizer', '.page-optimizer');

    const rows = await page.evaluate(() => {
      const rect = (selector: string) =>
        document.querySelector(selector)!.getBoundingClientRect();
      return {
        title: rect('.app-title'),
        menu: rect('.app-header nav'),
        header: rect('.app-header'),
        titleRoom: parseFloat(getComputedStyle(document.querySelector('.app-title')!).paddingRight),
        /** the header's own side padding, which both rows stand inside */
        headerPad: ['paddingLeft', 'paddingRight'].reduce(
          (sum, side) =>
            sum +
            parseFloat(
              getComputedStyle(document.querySelector('.app-header')!)[
                side as 'paddingLeft' | 'paddingRight'
              ],
            ),
          0,
        ),
        menuRoom: parseFloat(
          getComputedStyle(document.querySelector('.app-header nav')!).paddingRight,
        ),
      };
    });

    // the menu is below the name, not beside it
    expect(rows.menu.top).toBeGreaterThanOrEqual(rows.title.bottom - 1);
    // and it runs the width of the header, while the name's row keeps room for the button:
    // both boxes are as wide as the header, but the name has less of it to write in
    expect(rows.menu.width).toBeCloseTo(rows.header.width - rows.headerPad, 0);
    expect(rows.title.width - rows.titleRoom).toBeLessThan(rows.menu.width);
    expect(rows.titleRoom).toBeGreaterThan(0);
    expect(rows.menuRoom).toBe(0);
  });
});
