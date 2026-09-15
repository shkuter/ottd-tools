import { afterEach, describe, expect, it } from 'vitest';
import { harnessFixture, NARROW, VIEWPORT } from './harness';
import { visibleIndustry } from './graphNodes';
import { holdPanel } from './panels';
import { LOCALE_KEY } from '../../state/localeStore';

/**
 * A side panel held beside a list on a wide window — the consist panel, the column of the chain
 * graph — is no taller than the window under its top: past that its end, the totals of a long
 * consist, would stay below the screen while the catalogue is scrolled. It scrolls inside itself
 * when its content is taller, and only then, it stands below the import button in the corner,
 * and on a narrow window, where it is not held, it is as long as its content.
 */

const harness = harnessFixture();

const CONSIST_KEY = 'ottd-tools-consist';
/** Thirty vehicles of Iron Horse, the set the checks run on: a consist far taller than the window. */
const LONG = [
  'bean_feast', 'buffalo', 'cheese_bug', 'grub', 'hercules', 'lark', 'reliance', 'spinner', 'fireball', 'lamia',
  'thor', 'xerxes', 'ox', 'carrack', 'alfama', 'autocoach_pony_gen_2', 'debden', 'eastern', 'longwater', 'merrylegs',
  'poplar', 'ravensbourne', 'serpentine', 'snowplough_pony_gen_2', 'swift', 'vigilant', 'walbrook', 'pinhorse',
  'stoat', 'abernant',
];

afterEach(async () => {
  const { page } = harness();
  await page.setViewportSize(VIEWPORT);
  await page.evaluate(
    ({ consist, locale }) => {
      localStorage.removeItem(consist);
      localStorage.removeItem(locale);
      window.scrollTo(0, 0);
    },
    { consist: CONSIST_KEY, locale: LOCALE_KEY },
  );
});

/** Opens the consist builder with these vehicles in the consist, in this language. */
async function openConsist(ids: readonly string[], locale: 'en' | 'ru' = 'en') {
  await harness().page.evaluate(
    ({ consist, items, localeKey, locale: language }) => {
      localStorage.setItem(consist, JSON.stringify({ state: { items, capacityIndex: 2 }, version: 0 }));
      localStorage.setItem(localeKey, JSON.stringify({ state: { locale: language }, version: 0 }));
    },
    { consist: CONSIST_KEY, items: ids.map((id) => ({ id, count: 1 })), localeKey: LOCALE_KEY, locale },
  );
  return harness().goto('/consist', '.page-consist .consist-side');
}

type Page = Awaited<ReturnType<typeof openConsist>>;

function measure(page: Page, selector: string) {
  return page.evaluate((panelSelector) => {
    const panel = document.querySelector<HTMLElement>(panelSelector)!;
    const box = panel.getBoundingClientRect();
    const style = getComputedStyle(panel);
    return {
      top: box.top,
      bottom: box.bottom,
      height: box.height,
      window: window.innerHeight,
      scrollHeight: panel.scrollHeight,
      clientHeight: panel.clientHeight,
      position: style.position,
      launcherBottom: document.querySelector('.savegame-launcher')!.getBoundingClientRect().bottom,
      pageScrolled: window.scrollY,
    };
  }, selector);
}

describe.each(['en', 'ru'] as const)('the consist panel of a long consist on a wide window (%s)', (locale) => {
  it('fits the window under its top, scrolls inside itself and stands below the import button', async () => {
    const page = await openConsist(LONG, locale);
    const panel = await holdPanel(page, '.consist-side');

    expect(panel.error).toBeUndefined();
    expect(panel.scrolled, 'the page did not scroll, so the panel was never held').toBeGreaterThan(0);
    expect(panel.position).toBe('sticky');
    expect(panel.top, 'the panel is not held at its top').toBeCloseTo(panel.heldAt, 0);
    expect(panel.height, 'the panel is taller than the window under its top').toBeLessThanOrEqual(
      panel.window - panel.top + 1,
    );
    expect(panel.scrollHeight, 'thirty vehicles should overflow the panel').toBeGreaterThan(panel.clientHeight);
    expect(panel.top, 'the import button lies over the panel').toBeGreaterThanOrEqual(panel.launcherBottom);

    // the totals at the end of the panel are reached by scrolling the panel
    const totals = await page.evaluate(() => {
      const side = document.querySelector<HTMLElement>('.consist-side')!;
      side.scrollTop = side.scrollHeight;
      const table = side.querySelector('.summary-table')!.getBoundingClientRect();
      const box = side.getBoundingClientRect();
      return { top: table.top, bottom: table.bottom, panelTop: box.top, panelBottom: box.bottom };
    });
    expect(totals.bottom).toBeLessThanOrEqual(totals.panelBottom + 1);
    expect(totals.top).toBeGreaterThanOrEqual(totals.panelTop - 1);

    // the page keeps its own scrollbar under the panel
    expect(
      await page.evaluate(() => document.scrollingElement!.scrollHeight > window.innerHeight),
    ).toBe(true);
  });
});

describe('a side panel that is not taller than the window', () => {
  it('draws no scrollbar of its own', async () => {
    const page = await openConsist(LONG.slice(0, 2));
    const panel = await measure(page, '.consist-side');
    expect(panel.scrollHeight).toBeLessThanOrEqual(panel.clientHeight + 1);
  });
});

describe('the consist panel on a narrow window', () => {
  it('stands under the catalogue as long as its content, with no scrollbar of its own', async () => {
    await harness().page.setViewportSize(NARROW);
    const page = await openConsist(LONG);
    const panel = await measure(page, '.consist-side');
    expect(panel.position).toBe('static');
    expect(panel.scrollHeight).toBeLessThanOrEqual(panel.clientHeight + 1);
    expect(panel.height, 'thirty vehicles make a panel taller than the window').toBeGreaterThan(panel.window);
  });
});

describe('the column of the chain graph with a node picked', () => {
  it('stands below the import button as the page scrolls', async () => {
    const page = await harness().goto('/firs', '.graph-canvas .graph-node');
    const node = await visibleIndustry(page);
    await page.mouse.click(node.x, node.y);
    await page.waitForSelector('.firs-side .node-card');
    const panel = await holdPanel(page, '.firs-side');
    expect(panel.error).toBeUndefined();
    expect(panel.scrolled).toBeGreaterThan(0);
    expect(panel.top, 'the column is not held at its top').toBeCloseTo(panel.heldAt, 0);
    expect(panel.top).toBeGreaterThanOrEqual(panel.launcherBottom);
    expect(panel.height).toBeLessThanOrEqual(panel.window - panel.top + 1);
  });
});
