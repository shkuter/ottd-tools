import { afterEach, describe, expect, it } from 'vitest';
import { harnessFixture, NARROW, VIEWPORT } from './harness';
import { backgroundPoint, graphScale, touchInput, visibleIndustry } from './graphNodes';

/**
 * The chain graph under a real pointer. What is checked here cannot be checked in jsdom:
 * a pointer that has been captured sends its compatibility click to the element holding the
 * capture, not to the element under it — so a canvas that captures on pointerdown swallows
 * every click on a node, while a jsdom test dispatching `click` at the node still passes.
 * That is exactly the bug this file was written for.
 *
 * The graph opens at a scale with labels rather than fitted, so a node is looked for where a
 * hand would find it — wholly on the canvas and hit by a press at its centre — not taken as
 * the first one in the document, which may lie past the edge.
 */
const harness = harnessFixture();

const ROOT = '.graph-canvas .graph-node';

afterEach(async () => {
  await harness().page.setViewportSize(VIEWPORT);
});

/** With no node picked the column beside the canvas holds the legend, and the card after a pick. */
async function column(page: Awaited<ReturnType<ReturnType<typeof harness>['goto']>>) {
  return {
    legend: await page.locator('.firs-side .graph-legend').count(),
    card: await page.locator('.firs-side .node-card').count(),
  };
}

describe('the chain graph under the pointer', () => {
  it('picks the node that is clicked, and clears on the background', async () => {
    const page = await harness().goto('/firs', ROOT);
    expect(await column(page), 'the legend stands in the column before a pick').toEqual({ legend: 1, card: 0 });
    const node = await visibleIndustry(page);

    await page.mouse.click(node.x, node.y);
    await page.waitForSelector('.firs-side .node-card');
    expect(await page.locator('.graph-node[data-selected]').count()).toBe(1);
    expect(await page.locator('.firs-side').innerText()).toContain(node.name);
    // the chain of the pick is what stays lit
    expect(await page.locator('.graph-node[data-dim]').count()).toBeGreaterThan(0);

    const background = await backgroundPoint(page);
    await page.mouse.click(background.x, background.y);
    await page.waitForTimeout(100);
    expect(await column(page), 'the legend comes back when the pick is cleared').toEqual({ legend: 1, card: 0 });
  });

  it('pans on a drag, and a drag is not a pick', async () => {
    const page = await harness().goto('/firs', ROOT);
    const node = await visibleIndustry(page);
    await page.mouse.click(node.x, node.y);
    await page.waitForSelector('.firs-side .node-card');
    const picked = await page.locator('.firs-side').innerText();
    const before = await page.locator('.graph-layer').getAttribute('style');

    const canvas = (await page.locator('.graph-canvas').boundingBox())!;
    await page.mouse.move(canvas.x + 400, canvas.y + 300);
    await page.mouse.down();
    await page.mouse.move(canvas.x + 520, canvas.y + 380, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(100);

    expect(await page.locator('.graph-layer').getAttribute('style')).not.toBe(before);
    // the drag ended over whatever it ended over; the pick is untouched
    expect(await page.locator('.firs-side').innerText()).toBe(picked);
  });

  it('opens with the node labels, drops them on the overview and brings them back close up', async () => {
    const page = await harness().goto('/firs', ROOT);
    const labels = () => page.locator('.graph-layer').getAttribute('data-labels');
    const textShown = async () =>
      page.evaluate(() => {
        const name = document.querySelector<HTMLElement>('.graph-node__name');
        return name ? getComputedStyle(name).display !== 'none' : false;
      });

    expect(await labels(), 'Steeltown opens at a scale its labels are read at').toBeNull();
    expect(await textShown()).toBe(true);

    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.waitForTimeout(200);
    expect(await labels(), 'a whole economy at once is read by pictures and colours').toBe('hidden');
    expect(await textShown()).toBe(false);

    await page.getByRole('button', { name: '1:1', exact: true }).click();
    await page.waitForTimeout(200);
    expect(await labels()).toBeNull();
    expect(await textShown()).toBe(true);
  });

  it('walks the graph with the keyboard, from one tab stop', async () => {
    const page = await harness().goto('/firs', ROOT);
    // the canvas is reachable by tabbing, and the arrows work from there
    await page.locator('.graph-canvas').focus();
    await page.keyboard.press('ArrowRight');
    const first = await page.locator('.graph-canvas').getAttribute('aria-activedescendant');
    expect(first).toMatch(/^graph-node-/);
    await page.keyboard.press('ArrowRight');
    expect(await page.locator('.graph-canvas').getAttribute('aria-activedescendant')).not.toBe(first);
    expect(await page.locator('.graph-node[data-focused]').count()).toBe(1);

    await page.keyboard.press('Enter');
    await page.waitForSelector('.firs-side .node-card');
    expect(await page.locator('.graph-node[data-selected]').count()).toBe(1);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    expect(await column(page)).toEqual({ legend: 1, card: 0 });
  });

  it('zooms by how far the wheel travelled, not by how many events it took', async () => {
    const page = await harness().goto('/firs', ROOT);
    const box = (await page.locator('.graph-canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    const start = await graphScale(page);
    // one mouse notch
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(120);
    const afterNotch = await graphScale(page);

    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.waitForTimeout(150);
    // the graph no longer opens fitted, so the trackpad is measured from the fitted scale
    const fitted = await graphScale(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // the same travel as a trackpad sends it
    for (let i = 0; i < 20; i++) await page.mouse.wheel(0, -5);
    await page.waitForTimeout(200);
    const afterTrackpad = await graphScale(page);

    expect(afterNotch / start).toBeGreaterThan(1.2);
    expect(afterTrackpad / fitted).toBeCloseTo(afterNotch / start, 1);
  });
});

/**
 * On a narrow window the card of a pick stands under the canvas, where it is not seen: a pick
 * brings it into view. On a wide one it stands beside the canvas and the page stays put.
 */
describe('the card of a pick', () => {
  it('is scrolled into view on a narrow window', async () => {
    const page = await harness().goto('/firs', ROOT);
    await page.setViewportSize(NARROW);
    // the canvas low enough in the window for the column under it to start below the window
    await page.evaluate(() => {
      const side = document.querySelector('.firs-side')!.getBoundingClientRect();
      // the column's top ends 20px below the window, the canvas above it still in view
      window.scrollBy(0, side.top - window.innerHeight - 20);
    });
    const before = await page.evaluate(() => {
      const side = document.querySelector('.firs-side')!.getBoundingClientRect();
      return { top: side.top, height: window.innerHeight, scrollY: window.scrollY };
    });
    expect(before.top, 'the column already stood in the window, so nothing is proven').toBeGreaterThan(before.height);

    const node = await visibleIndustry(page);
    await page.mouse.click(node.x, node.y);
    await page.waitForSelector('.firs-side .node-card');
    await page.waitForTimeout(300);

    const after = await page.evaluate(() => {
      const side = document.querySelector('.firs-side')!.getBoundingClientRect();
      return { top: side.top, bottom: side.bottom, height: window.innerHeight };
    });
    expect(after.top, 'the card is still below the window').toBeLessThan(after.height);
    expect(after.bottom).toBeGreaterThan(0);
  });

  it('leaves the page where it is on a wide window', async () => {
    const page = await harness().goto('/firs', ROOT);
    const before = await page.evaluate(() => window.scrollY);
    const node = await visibleIndustry(page);
    await page.mouse.click(node.x, node.y);
    await page.waitForSelector('.firs-side .node-card');
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});

/**
 * The graph under fingers, in a window that reports a touch screen. One finger scrolls the page
 * past the canvas; two fingers that land on it pan and zoom the drawing and keep the page still;
 * a gesture that began as a scroll stays one when a second finger joins it; a tap picks.
 */
describe('the chain graph under fingers', () => {
  /** Opens the tab with the canvas high in the window, and says where its middle is. */
  async function openCanvas() {
    const page = await harness().openTouch('/firs', ROOT);
    await page.evaluate(() => {
      const canvas = document.querySelector('.graph-canvas')!.getBoundingClientRect();
      window.scrollBy(0, canvas.top - 80);
    });
    const middle = await page.evaluate(() => {
      const canvas = document.querySelector('.graph-canvas')!.getBoundingClientRect();
      return { x: canvas.left + canvas.width / 2, y: canvas.top + Math.min(canvas.height, window.innerHeight) / 2 };
    });
    return { page, middle };
  }
  const state = (page: Awaited<ReturnType<typeof openCanvas>>['page']) =>
    page.evaluate(() => ({
      scrollY: window.scrollY,
      transform: document.querySelector<HTMLElement>('.graph-layer')!.style.transform,
    }));

  it('scrolls the page under one finger and leaves the drawing alone', async () => {
    const { page, middle } = await openCanvas();
    const before = await state(page);
    const touch = await touchInput(page);
    await touch.start([[middle.x, middle.y + 150]]);
    await touch.move([[middle.x, middle.y + 150]], [[middle.x - 20, middle.y - 150]], 20);
    await touch.end();
    await touch.detach();
    await page.waitForTimeout(200);

    const after = await state(page);
    expect(after.scrollY - before.scrollY, 'the page did not scroll').toBeGreaterThan(50);
    expect(after.transform).toBe(before.transform);
  });

  it('zooms the drawing between two fingers and keeps the page still', async () => {
    const { page, middle } = await openCanvas();
    const before = await state(page);
    const scale = await graphScale(page);
    const touch = await touchInput(page);
    const { x, y } = middle;
    await touch.start([[x - 30, y], [x + 30, y]]);
    await touch.move([[x - 30, y], [x + 30, y]], [[x - 90, y + 20], [x + 90, y + 20]]);
    await touch.end();
    await touch.detach();
    await page.waitForTimeout(200);

    expect((await graphScale(page)) / scale, 'the fingers ended three times as far apart').toBeCloseTo(3, 1);
    expect((await state(page)).scrollY, 'the page moved under the gesture').toBe(before.scrollY);
    expect(await page.locator('.graph-node[data-selected]').count(), 'a pinch is not a pick').toBe(0);
  });

  it('keeps a scroll a scroll when a second finger joins it', async () => {
    const { page, middle } = await openCanvas();
    const before = await state(page);
    const touch = await touchInput(page);
    const { x, y } = middle;
    await touch.start([[x, y + 150]]);
    await touch.move([[x, y + 150]], [[x, y]], 10);
    const scrolling = (await state(page)).scrollY;
    expect(scrolling - before.scrollY, 'the first finger did not start a scroll').toBeGreaterThan(20);
    await touch.start([[x, y], [x + 60, y]]);
    await touch.move([[x, y], [x + 60, y]], [[x - 40, y - 100], [x + 100, y - 100]], 10);
    await touch.end();
    await touch.detach();
    await page.waitForTimeout(200);

    const after = await state(page);
    expect(after.transform, 'the drawing followed a gesture the page owned').toBe(before.transform);
    expect(after.scrollY).toBeGreaterThanOrEqual(scrolling);
  });

  it('picks the node a finger taps', async () => {
    const { page } = await openCanvas();
    const node = await visibleIndustry(page);
    await page.touchscreen.tap(node.x, node.y);
    await page.waitForSelector('.firs-side .node-card');
    expect(await page.locator('.graph-node[data-selected]').count()).toBe(1);
    expect(await page.locator('.firs-side').innerText()).toContain(node.name);
  });
});
