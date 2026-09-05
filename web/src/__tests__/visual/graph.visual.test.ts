import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';

/**
 * The chain graph under a real pointer. What is checked here cannot be checked in jsdom:
 * a pointer that has been captured sends its compatibility click to the element holding the
 * capture, not to the element under it — so a canvas that captures on pointerdown swallows
 * every click on a node, while a jsdom test dispatching `click` at the node still passes.
 * That is exactly the bug this file was written for.
 */
const harness = harnessFixture();

const ROOT = '.graph-canvas .graph-node';
const industry = '.graph-node--industry';

describe('the chain graph under the pointer', () => {
  it('picks the node that is clicked, and clears on the background', async () => {
    const page = await harness().goto('/firs', ROOT);
    const node = page.locator(industry).first();
    const name = (await node.getAttribute('title'))!.split('\n')[0];

    await node.click();
    await page.waitForSelector('.firs-side');
    expect(await page.locator('.graph-node[data-selected]').count()).toBe(1);
    expect(await page.locator('.firs-side').innerText()).toContain(name);
    // the chain of the pick is what stays lit
    expect(await page.locator('.graph-node[data-dim]').count()).toBeGreaterThan(0);

    const canvas = (await page.locator('.graph-canvas').boundingBox())!;
    await page.mouse.click(canvas.x + 12, canvas.y + canvas.height - 12);
    await page.waitForTimeout(100);
    expect(await page.locator('.firs-side').count()).toBe(0);
  });

  it('pans on a drag, and a drag is not a pick', async () => {
    const page = await harness().goto('/firs', ROOT);
    await page.locator(industry).first().click();
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

  it('drops the node labels on the overview and brings them back close up', async () => {
    const page = await harness().goto('/firs', ROOT);
    const labels = () => page.locator('.graph-layer').getAttribute('data-labels');
    const textShown = async () =>
      page.evaluate(() => {
        const name = document.querySelector<HTMLElement>('.graph-node__name');
        return name ? getComputedStyle(name).display !== 'none' : false;
      });

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
    await page.waitForSelector('.firs-side');
    expect(await page.locator('.graph-node[data-selected]').count()).toBe(1);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    expect(await page.locator('.firs-side').count()).toBe(0);
  });

  it('zooms by how far the wheel travelled, not by how many events it took', async () => {
    const page = await harness().goto('/firs', ROOT);
    const scale = async () =>
      Number((await page.locator('.graph-layer').getAttribute('style'))!.match(/scale\(([\d.]+)\)/)![1]);
    const box = (await page.locator('.graph-canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

    const start = await scale();
    // one mouse notch
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(120);
    const afterNotch = await scale();

    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await page.waitForTimeout(150);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    // the same travel as a trackpad sends it
    for (let i = 0; i < 20; i++) await page.mouse.wheel(0, -5);
    await page.waitForTimeout(200);
    const afterTrackpad = await scale();

    expect(afterNotch / start).toBeGreaterThan(1.2);
    expect(afterTrackpad / start).toBeCloseTo(afterNotch / start, 1);
  });
});
