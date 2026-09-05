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
});
