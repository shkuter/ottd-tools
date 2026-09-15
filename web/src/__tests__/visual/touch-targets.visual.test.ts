import { afterEach, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { harnessFixture, VIEWPORT } from './harness';

/**
 * Under a finger every small control takes a press over at least 24 CSS pixels, without its
 * box changing. What is measured is the spot that actually takes the press — the element the
 * browser hit-tests at a point — not whether a rule exists: a spot clipped by the control's own
 * overflow, or by the frame of a list, reads the same in the stylesheet and fails here.
 *
 * The same page is opened twice at the same window size: once as a mouse sees it, once in a
 * window that reports a touch screen, which is what `(pointer: coarse)` matches (design D1).
 * The points probed lie 11px from the centre of the control, inside a 24px spot and outside
 * the control's visible box — a point inside the box proves nothing — and the spot has to take
 * them under a finger and must not under the mouse.
 */

const harness = harnessFixture();

const CONSIST_KEY = 'ottd-tools-consist';

afterEach(async () => {
  await harness().page.evaluate((key) => localStorage.removeItem(key), CONSIST_KEY);
});

interface Probe {
  error?: string;
  /** the box, in document coordinates */
  box: { left: number; top: number; width: number; height: number };
  /** the probe points outside the box, and whether a press there reaches the control */
  points: { dx: number; dy: number; hits: boolean; instead?: string }[];
  /** descendants whose box reaches past the control's own */
  spilling: string[];
}

/**
 * Where the 24px spot of a control is centred: on the control, or — for the arrows of a stepper,
 * whose spots grow away from each other so they meet on the line between them — 12px above the
 * bottom of the up arrow and 12px below the top of the down arrow.
 */
type Anchor = 'centre' | 'above' | 'below';

/** Scrolls the control into the middle of the window and presses around its spot, in the page. */
function probe(page: Page, selector: string, anchor: Anchor = 'centre'): Promise<Probe> {
  return page.evaluate(({ target, anchor }) => {
    const empty = { box: { left: 0, top: 0, width: 0, height: 0 }, points: [], spilling: [] };
    const element = document.querySelector<HTMLElement>(target);
    if (!element) return { ...empty, error: `nothing matches ${target}` };
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    const box = element.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy =
      anchor === 'above' ? box.bottom - Math.max(box.height, 24) / 2
        : anchor === 'below' ? box.top + Math.max(box.height, 24) / 2
          : box.top + box.height / 2;
    const points = [];
    // 11.5px out along the sides: inside a 24px spot and outside a box that falls short of 24px;
    // the corners 11px out each way, since a corner half a pixel from both edges of the spot is
    // left to how the browser rounds the spot to device pixels
    const d = 11.5;
    const c = 11;
    for (const [dx, dy] of [[-d, 0], [d, 0], [0, -d], [0, d], [-c, -c], [c, -c], [-c, c], [c, c]]) {
      const x = cx + dx;
      const y = cy + dy;
      // a point inside the visible box proves nothing about the spot around it
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) continue;
      const hit = document.elementFromPoint(x, y);
      const hits = !!hit && (hit === element || element.contains(hit));
      // what took the press instead, for a failure that says where the spot went
      const instead = hits || !hit ? undefined : `${hit.className.toString().slice(0, 60)} ${hit.getAttribute('data-direction') ?? ''}`.trim();
      points.push({ dx, dy, hits, ...(instead === undefined ? {} : { instead }) });
    }
    const spilling = [...element.querySelectorAll('*')]
      .filter((child) => {
        const inner = child.getBoundingClientRect();
        if (inner.width === 0 && inner.height === 0) return false;
        return (
          inner.left < box.left - 0.5 || inner.right > box.right + 0.5 ||
          inner.top < box.top - 0.5 || inner.bottom > box.bottom + 0.5
        );
      })
      .map((child) => child.className.toString());
    return {
      box: { left: box.left + window.scrollX, top: box.top + window.scrollY, width: box.width, height: box.height },
      points,
      spilling,
    };
  }, { target: selector, anchor });
}

const TARGETS = [
  { name: 'comparison tick', path: '/optimizer', ready: '.page-optimizer tbody', selector: '.page-optimizer label.cell-pick__hit' },
  {
    name: 'row action at the right edge of a list',
    path: '/optimizer',
    ready: '.page-optimizer tbody',
    selector: '.page-optimizer tbody tr:first-child td:last-child .mantine-ActionIcon-root',
  },
  {
    name: 'add button of the catalogue',
    path: '/consist',
    ready: '.page-consist tbody',
    selector: '.page-consist .table-wrap tbody tr:first-child td:last-child .mantine-ActionIcon-root',
  },
  {
    name: 'stepper arrow up',
    path: '/settings',
    ready: '.page-settings',
    selector: '.page-settings .mantine-NumberInput-control[data-direction="up"]',
    anchor: 'above' as const,
  },
  {
    name: 'stepper arrow down',
    path: '/settings',
    ready: '.page-settings',
    selector: '.page-settings .mantine-NumberInput-control[data-direction="down"]',
    anchor: 'below' as const,
  },
  { name: 'setting switch', path: '/settings', ready: '.page-settings', selector: '.page-settings .setting-row .mantine-Switch-body' },
  { name: 'language switch', path: '/optimizer', ready: '.page-optimizer', selector: '.language-switch' },
];

describe.each(TARGETS)('the $name', (target) => {
  it('takes a press over 24px under a finger, keeps its box, and not under the mouse', async () => {
    const mouse = await harness().goto(target.path, target.ready);
    const anchor = 'anchor' in target ? target.anchor : 'centre';
    const withMouse = await probe(mouse, target.selector, anchor);
    const finger = await harness().openTouch(target.path, target.ready, VIEWPORT);
    const withFinger = await probe(finger, target.selector, anchor);

    expect(withFinger.error).toBeUndefined();
    // a control already 24px each way needs no wider spot, and every probe falls inside it
    if (withFinger.points.length === 0) {
      expect(withFinger.box.width, 'the control is narrower than 24px').toBeGreaterThanOrEqual(24);
      expect(withFinger.box.height, 'the control is lower than 24px').toBeGreaterThanOrEqual(24);
    }
    expect(
      withFinger.points.filter((point) => !point.hits),
      'a press 11px from the centre misses the control under a finger',
    ).toEqual([]);
    expect(
      withMouse.points.filter((point) => point.hits),
      'the mouse got the wider spot too',
    ).toEqual([]);
    for (const side of ['left', 'top', 'width', 'height'] as const) {
      expect(withFinger.box[side], `the ${side} of the box moved under a finger`).toBeCloseTo(withMouse.box[side], 0);
    }
    expect(withFinger.spilling, 'the control no longer clips, and something inside it spills out').toEqual([]);
  });
});

describe('neighbouring spots', () => {
  it('meet on the line between the two arrows of a stepper without overlapping', async () => {
    const page = await harness().openTouch('/settings', '.page-settings', VIEWPORT);
    const hits = await page.evaluate(() => {
      const up = document.querySelector<HTMLElement>('.page-settings .mantine-NumberInput-control[data-direction="up"]')!;
      const down = up.parentElement!.querySelector<HTMLElement>('.mantine-NumberInput-control[data-direction="down"]')!;
      up.scrollIntoView({ block: 'center' });
      const a = up.getBoundingClientRect();
      const b = down.getBoundingClientRect();
      const x = a.left + a.width / 2;
      const owner = (y: number) => {
        const hit = document.elementFromPoint(x, y);
        return hit && up.contains(hit) ? 'up' : hit && down.contains(hit) ? 'down' : 'other';
      };
      const line = (a.bottom + b.top) / 2;
      return {
        aboveLine: owner(line - 1),
        belowLine: owner(line + 1),
        farAbove: owner(a.top - 6),
        farBelow: owner(b.bottom + 6),
        upHeight: Math.max(a.height, 24),
      };
    });
    expect(hits).toMatchObject({ aboveLine: 'up', belowLine: 'down', farAbove: 'up', farBelow: 'down' });
  });

  it('keep the count field and the remove button of a consist row apart', async () => {
    const page = await harness().openTouch('/optimizer', '.page-optimizer', VIEWPORT);
    await page.evaluate(
      (key) => localStorage.setItem(key, JSON.stringify({ state: { items: [{ id: 'bean_feast', count: 1 }], capacityIndex: 2 }, version: 0 })),
      CONSIST_KEY,
    );
    await harness().openTouch('/consist', '.page-consist .consist-list', VIEWPORT);
    const spots = await page.evaluate(() => {
      const row = document.querySelector('.consist-list .mantine-Group-root')!;
      row.scrollIntoView({ block: 'center' });
      const controls = [...row.querySelectorAll<HTMLElement>('.mantine-NumberInput-control')].map((c) => c.getBoundingClientRect());
      const remove = row.querySelector<HTMLElement>('.mantine-ActionIcon-root')!;
      const button = remove.getBoundingClientRect();
      // the spots as the stylesheet draws them: centred, at least 24px wide
      const arrowsRight = Math.max(...controls.map((c) => c.left + c.width / 2 + Math.max(c.width, 24) / 2));
      const removeLeft = button.left + button.width / 2 - Math.max(button.width, 24) / 2;
      const middle = (arrowsRight + removeLeft) / 2;
      const y = button.top + button.height / 2;
      const hit = document.elementFromPoint(middle, y);
      return {
        gap: removeLeft - arrowsRight,
        middleTakenByBoth: !!hit && remove.contains(hit) && controls.length > 0 && !!hit.closest('.mantine-NumberInput-control'),
      };
    });
    await page.evaluate((key) => localStorage.removeItem(key), CONSIST_KEY);
    expect(spots.gap, 'the spot of the remove button reaches over the arrows').toBeGreaterThanOrEqual(0);
    expect(spots.middleTakenByBoth).toBe(false);
  });
});

describe('the list under a finger', () => {
  it('scrolls no wider than under the mouse', async () => {
    const width = (page: Page) =>
      page.evaluate(() => document.querySelector<HTMLElement>('.page-optimizer .table-wrap')!.scrollWidth);
    const mouse = await width(await harness().goto('/optimizer', '.page-optimizer tbody'));
    const finger = await width(await harness().openTouch('/optimizer', '.page-optimizer tbody', VIEWPORT));
    expect(finger).toBe(mouse);
  });

  it('ticks the comparison box at a touch 10px from its centre, and the box keeps its name', async () => {
    const page = await harness().openTouch('/optimizer', '.page-optimizer tbody', VIEWPORT);
    const spot = await page.evaluate(() => {
      const label = document.querySelector<HTMLElement>('.page-optimizer label.cell-pick__hit')!;
      label.scrollIntoView({ block: 'center' });
      const box = label.getBoundingClientRect();
      const input = label.querySelector('input')!;
      return {
        x: box.left + box.width / 2,
        y: box.top + box.height / 2 - 10,
        outside: box.height / 2 < 10,
        name: input.getAttribute('aria-label') ?? '',
        checked: input.checked,
      };
    });
    expect(spot.outside, 'the box is taller than the touch is far, so nothing is proven').toBe(true);
    expect(spot.checked).toBe(false);
    await page.touchscreen.tap(spot.x, spot.y);
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('.page-optimizer label.cell-pick__hit input')!;
      return { checked: input.checked, name: input.getAttribute('aria-label') ?? '' };
    });
    expect(after.checked).toBe(true);
    expect(after.name).toBe(spot.name);
    expect(after.name).toMatch(/^Compare /);
  });
});
