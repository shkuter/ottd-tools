import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';
import { snapshot } from './collect';
import { fromToken, painted } from './colours';

/**
 * The income chart and the chain graph: two pictures drawn by libraries of their
 * own, held to the look of the game.
 *
 * The chart is a dark plate let into the window, the way the game draws its
 * production and finance graphs, with a solid grid and figures light enough to
 * read on it — a figure left in the body colour is black on black and simply
 * disappears. The graph is laid out by graphviz, which writes its own colours
 * into the SVG; the skin overrides them, so no white sheet and no pale nodes
 * are left anywhere in it.
 */

const harness = harnessFixture();

describe('the income chart', () => {
  it('is a dark plate with figures that can be read on it', async () => {
    const page = await harness().goto('/income', '.page-route');
    const shot = await page.evaluate(snapshot);
    const tokens = shot.themes.grey;

    const measured = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('.mantine-LineChart-root');
      if (!root) return { error: 'no chart' as const };
      const grid = root.querySelector('.recharts-cartesian-grid line');
      const ticks = [...root.querySelectorAll<SVGTextElement>('.recharts-text')];
      const box = root.getBoundingClientRect();
      return {
        plate: getComputedStyle(root).backgroundColor,
        gridDashes: grid ? getComputedStyle(grid).strokeDasharray : null,
        tickColours: [...new Set(ticks.map((tick) => getComputedStyle(tick).fill))],
        // nothing of the reading sits outside the plate it is drawn on
        spilling: ticks
          .map((tick) => tick.getBoundingClientRect())
          .filter((r) => r.top < box.top - 1 || r.bottom > box.bottom + 1).length,
      };
    });

    expect(measured.error, 'the tab draws a chart').toBeUndefined();
    if ('error' in measured) return;
    expect(painted(measured.plate, 'the chart plate'), 'the plate is the sunken field of the game').toBe(
      fromToken(tokens, '--skin-field-bg'),
    );
    expect(measured.gridDashes, 'the grid is solid, as the game draws it').toBe('0px');
    expect(
      measured.tickColours.map((colour) => painted(colour, 'an axis figure')),
      'the figures are lettered as a dark plate is',
    ).toEqual([fromToken(tokens, '--skin-field-text')]);
    expect(measured.spilling, 'and they stay on it').toBe(0);
  });
});

describe('the chain graph', () => {
  it('is painted by the skin, not by graphviz', async () => {
    const page = await harness().goto('/firs', '.page-firs');
    await page.waitForSelector('.graph-container g.node', { timeout: 30_000 });

    const strange = await page.evaluate(() => {
      // what the skin says the graph is painted in, asked of the page rather than
      // repeated here: naming graphviz's own colours would tie this check to a
      // palette that lives in a Python file on the other side of the pipeline
      const style = getComputedStyle(document.documentElement);
      const token = (name: string) => style.getPropertyValue(name).trim();
      const allowed = new Set(
        ['--skin-window', '--skin-button', '--skin-edge-lo', '--skin-text', '--skin-button-text']
          .map(token)
          .filter(Boolean),
      );

      const seen = new Set<string>();
      const probe = document.createElement('div');
      document.body.append(probe);
      const asColour = (value: string) => {
        probe.style.color = '';
        probe.style.color = value;
        return getComputedStyle(probe).color;
      };
      const wanted = new Set([...allowed].map(asColour));

      // only what actually draws: a <g> or the <svg> itself carries a fill it
      // never paints with, handing it down to children that set their own
      for (const element of document.querySelectorAll<SVGElement>(
        '.graph-container polygon, .graph-container ellipse, .graph-container path, .graph-container text',
      )) {
        const computed = getComputedStyle(element);
        for (const property of ['fill', 'stroke'] as const) {
          const value = computed[property];
          if (value === 'none' || value.startsWith('rgba(0, 0, 0, 0')) continue;
          if (!wanted.has(value)) seen.add(`${element.tagName} ${property} ${value}`);
        }
      }
      probe.remove();
      return [...seen];
    });

    expect(strange, 'every colour in the graph is one the skin chose').toEqual([]);
  });
});
