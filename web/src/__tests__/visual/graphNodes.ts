import type { Page } from 'playwright';

/**
 * Finding things on the chain graph as a hand would: the graph no longer opens fitted, so the
 * first node in the document may well lie past the edge of the canvas, and a press there would
 * miss it or land on a neighbour. Shared by the checks that press the graph; kept out of the
 * test files, whose tests would run again in every file importing them.
 */

export interface NodePoint {
  x: number;
  y: number;
  /** the node's name, the first line of its tooltip */
  name: string;
}

/**
 * An industry node a press at its centre hits: preferably one lying wholly on the canvas and in
 * the window, otherwise — on a canvas narrower than a node, as at 400px — one whose centre is on
 * the canvas and in the window. Marked with `data-visible-node`, so a check can address it again.
 */
export async function visibleIndustry(page: Page): Promise<NodePoint> {
  const found = await page.evaluate(() => {
    for (const marked of document.querySelectorAll('[data-visible-node]')) marked.removeAttribute('data-visible-node');
    const canvas = document.querySelector('.graph-canvas')!.getBoundingClientRect();
    const nodes = [...document.querySelectorAll<HTMLElement>('.graph-canvas .graph-node--industry')];
    const whole = (box: DOMRect) =>
      box.left >= canvas.left && box.top >= canvas.top && box.right <= canvas.right && box.bottom <= canvas.bottom &&
      box.top >= 0 && box.bottom <= window.innerHeight && box.right <= window.innerWidth;
    const centred = (box: DOMRect) => {
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      return x > canvas.left && x < canvas.right && y > Math.max(canvas.top, 0) && y < Math.min(canvas.bottom, window.innerHeight);
    };
    const ranked = [
      ...nodes.filter((node) => whole(node.getBoundingClientRect())),
      ...nodes.filter((node) => !whole(node.getBoundingClientRect()) && centred(node.getBoundingClientRect())),
    ];
    for (const node of ranked) {
      const box = node.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      if (document.elementFromPoint(x, y)?.closest('.graph-node') !== node) continue;
      node.setAttribute('data-visible-node', '');
      return { x, y, name: (node.getAttribute('title') ?? '').split('\n')[0] };
    }
    return null;
  });
  if (!found) throw new Error('no industry node lies wholly on the canvas at the view the graph opened with');
  return found;
}

/** A point of the canvas, in the window, where a press hits no node. */
export async function backgroundPoint(page: Page): Promise<{ x: number; y: number }> {
  const found = await page.evaluate(() => {
    const canvas = document.querySelector('.graph-canvas')!.getBoundingClientRect();
    const bottom = Math.min(canvas.bottom, window.innerHeight);
    for (let y = canvas.top + 8; y < bottom - 8; y += 12) {
      for (let x = canvas.left + 8; x < canvas.right - 8; x += 12) {
        const hit = document.elementFromPoint(x, y);
        if (hit?.closest('.graph-canvas') && !hit.closest('.graph-node')) return { x, y };
      }
    }
    return null;
  });
  if (!found) throw new Error('the canvas has no bare background in the window to press');
  return found;
}

/** The scale the drawing is shown at, read off its transform. */
export async function graphScale(page: Page): Promise<number> {
  const style = (await page.locator('.graph-layer').getAttribute('style'))!;
  return Number(style.match(/scale\(([\d.]+)\)/)![1]);
}

/**
 * Touches as the browser receives them from a touch screen, several fingers at once: Playwright's
 * own touchscreen knows one. Sent through CDP, which the browser runs through `touch-action`
 * like real touches (design D1). Each call is one frame of the gesture: the fingers down now.
 */
export async function touchInput(page: Page) {
  const session = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: readonly (readonly [number, number])[]) =>
    session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map(([x, y], id) => ({ x, y, id })),
    });
  return {
    start: (points: readonly (readonly [number, number])[]) => send('touchStart', points),
    /** Moves the fingers down to `to` over `steps` frames, a frame apart. */
    move: async (
      from: readonly (readonly [number, number])[],
      to: readonly (readonly [number, number])[],
      steps = 12,
    ) => {
      for (let step = 1; step <= steps; step++) {
        const at = from.map(([x, y], i) => [x + ((to[i][0] - x) * step) / steps, y + ((to[i][1] - y) * step) / steps] as const);
        await send('touchMove', at);
        await page.waitForTimeout(16);
      }
    },
    end: () => send('touchEnd', []),
    detach: () => session.detach(),
  };
}
