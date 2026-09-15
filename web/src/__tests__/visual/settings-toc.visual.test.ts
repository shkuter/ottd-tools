import { afterEach, describe, expect, it } from 'vitest';
import { harnessFixture, NARROW, VIEWPORT } from './harness';
import { LOCALE_KEY } from '../../state/localeStore';

/**
 * The table of contents of the settings tab, in the browser: a link puts the group's heading in
 * the window below the import button and into the address, the keyboard carries on inside the
 * group it jumped to, and on a narrow window the links wrap rather than scroll.
 */

const harness = harnessFixture();

afterEach(async () => {
  const { page } = harness();
  await page.setViewportSize(VIEWPORT);
  await page.evaluate((key) => {
    localStorage.removeItem(key);
    window.scrollTo(0, 0);
  }, LOCALE_KEY);
});

async function openSettings(locale: 'en' | 'ru' = 'en') {
  await harness().page.evaluate(
    ({ key, language }) => localStorage.setItem(key, JSON.stringify({ state: { locale: language }, version: 0 })),
    { key: LOCALE_KEY, language: locale },
  );
  return harness().goto('/settings', '.page-settings .settings-toc');
}

describe('a link of the table of contents', () => {
  it('puts the heading of its group in the window, below the import button, and in the address', async () => {
    const page = await openSettings();
    await page.locator('.settings-toc').getByRole('link', { name: 'Vehicles', exact: true }).click();
    await page.waitForTimeout(200);
    const shot = await page.evaluate(() => {
      const legend = document.querySelector('#settings-vehicles legend')!.getBoundingClientRect();
      const button = document.querySelector('.savegame-launcher')!.getBoundingClientRect();
      return { top: legend.top, bottom: legend.bottom, buttonBottom: button.bottom, window: window.innerHeight, hash: location.hash, scrolled: window.scrollY };
    });
    expect(shot.scrolled, 'the page did not move, so nothing is proven').toBeGreaterThan(0);
    expect(shot.hash).toBe('#settings-vehicles');
    expect(shot.top, 'the heading is under the import button').toBeGreaterThanOrEqual(shot.buttonBottom);
    expect(shot.bottom).toBeLessThanOrEqual(shot.window);
  });

  it('hands the next Tab to the first control of its group', async () => {
    const page = await openSettings();
    const link = page.locator('.settings-toc').getByRole('link', { name: 'Calculator assumptions', exact: true });
    // reached by the keyboard: from the link before it, one Tab
    await page.locator('.settings-toc a').nth(6).focus();
    await page.keyboard.press('Tab');
    expect(await link.evaluate((element) => element === document.activeElement)).toBe(true);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const group = document.getElementById('settings-calc')!;
      const first = [...group.querySelectorAll<HTMLElement>('input, button, select, textarea, a[href], [tabindex]')].find(
        (element) => element.tabIndex >= 0 && !element.hasAttribute('disabled') && element.getClientRects().length > 0,
      );
      return { inGroup: group.contains(document.activeElement), isFirst: document.activeElement === first };
    });
    expect(focus).toEqual({ inGroup: true, isFirst: true });
  });
});

describe.each(['en', 'ru'] as const)('the table of contents on a narrow window (%s)', (locale) => {
  it('wraps its links onto several lines, all in view, with nothing scrolling sideways', async () => {
    await harness().page.setViewportSize(NARROW);
    const page = await openSettings(locale);
    const shot = await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>('.settings-toc ul')!;
      const links = [...list.querySelectorAll('a')].map((link) => link.getBoundingClientRect());
      return {
        lines: new Set(links.map((box) => Math.round(box.top))).size,
        rightmost: Math.max(...links.map((box) => box.right)),
        leftmost: Math.min(...links.map((box) => box.left)),
        window: window.innerWidth,
        listScrolls: list.scrollWidth > list.clientWidth + 1,
        pageScrolls: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    expect(shot.lines, 'the links stand on one line at 400px').toBeGreaterThan(1);
    expect(shot.leftmost).toBeGreaterThanOrEqual(0);
    expect(shot.rightmost).toBeLessThanOrEqual(shot.window);
    expect(shot.listScrolls).toBe(false);
    expect(shot.pageScrolls).toBe(false);

    // a jump still leaves the heading in the window and below the button
    await page.locator('.settings-toc a[href="#settings-vehicles"]').click();
    await page.waitForTimeout(200);
    const jump = await page.evaluate(() => ({
      top: document.querySelector('#settings-vehicles legend')!.getBoundingClientRect().top,
      buttonBottom: document.querySelector('.savegame-launcher')!.getBoundingClientRect().bottom,
      window: window.innerHeight,
    }));
    expect(jump.top).toBeGreaterThanOrEqual(jump.buttonBottom);
    expect(jump.top).toBeLessThan(jump.window);
  });
});
