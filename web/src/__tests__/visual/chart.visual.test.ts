import { describe, expect, it } from 'vitest';
import { cargos, economies } from '../../dataset';
import { BADGE_TEXT_COLOURS, cargoColour } from '../../features/firs/graph/cargoColour';
import { harnessFixture } from './harness';
import { WINDOW_COLOURS } from '../../skin';
import { openKit, showcase, showGroup } from './kit';
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
  it('is painted by the skin and by the cargo colours of the game, nothing else', async () => {
    const page = await harness().goto('/firs', '.page-firs');
    await page.waitForSelector('.graph-canvas .graph-node', { timeout: 60_000 });

    // the cargo colours the graph may use: the palette entries the data points at — asked
    // of the data, not repeated here — plus the darkest and lightest entries, which letter
    // the badges. Of every economy: the page reads the economy off its own persisted
    // settings, which this process does not share, and a cargo colour of any economy of the
    // set is a colour of the game
    const cargoColours = [
      ...economies.flatMap((economy) =>
        cargos
          .map((cargo) => cargoColour(cargo, economy.id))
          .filter((hex): hex is string => hex !== undefined),
      ),
      ...BADGE_TEXT_COLOURS,
    ];

    const strange = await page.evaluate((allowedHex: string[]) => {
      const style = getComputedStyle(document.documentElement);
      const token = (name: string) => style.getPropertyValue(name).trim();
      const probe = document.createElement('div');
      document.body.append(probe);
      const asColour = (value: string) => {
        probe.style.color = '';
        probe.style.color = value;
        return getComputedStyle(probe).color;
      };
      const wanted = new Set(
        [
          ...['--skin-window', '--skin-button', '--skin-edge-hi', '--skin-edge-lo', '--skin-text', '--skin-button-text', '--skin-muted']
            .map(token)
            .filter(Boolean),
          ...allowedHex,
        ].map(asColour),
      );

      const seen = new Set<string>();
      // what actually paints: fill and stroke on the SVG, text, background and a drawn
      // border on the cards — an HTML element reports a fill it never uses
      for (const element of document.querySelectorAll<HTMLElement | SVGElement>(
        '.graph-canvas path, .graph-canvas polygon, .graph-canvas .graph-node, .graph-canvas .graph-node *',
      )) {
        const computed = getComputedStyle(element);
        const svg = element instanceof SVGElement;
        const properties = svg
          ? (['fill', 'stroke'] as const)
          : computed.borderTopStyle === 'none'
            ? (['backgroundColor', 'color'] as const)
            : (['backgroundColor', 'color', 'borderTopColor'] as const);
        for (const property of properties) {
          const value = computed[property];
          if (!value || value === 'none' || value.startsWith('rgba(0, 0, 0, 0')) continue;
          if (!wanted.has(value)) seen.add(`${element.tagName}.${element.getAttribute('class')} ${property} ${value}`);
        }
      }
      probe.remove();
      return [...seen];
    }, cargoColours);

    expect(strange, 'every colour in the graph is one the skin or the game chose').toEqual([]);
  });
});

/**
 * The same chart on the interface-elements page, where it can be seen in every window colour
 * the shell has: the plate and the figures follow the group, as the game's own graphs do.
 */
describe('the chart specimen', () => {
  it.each(WINDOW_COLOURS)('follows the %s window', async (group) => {
    const page = await openKit(harness());
    await showGroup(page, group);
    const shot = await page.evaluate(snapshot);
    const tokens = shot.themes[group];

    const measured = await showcase.chart(page).evaluate((root) => {
      const ticks = [...root.querySelectorAll<SVGTextElement>('.recharts-text')];
      return {
        plate: getComputedStyle(root).backgroundColor,
        tickColours: [...new Set(ticks.map((tick) => getComputedStyle(tick).fill))],
      };
    });

    expect(painted(measured.plate, 'the chart plate')).toBe(fromToken(tokens, '--skin-field-bg'));
    expect(measured.tickColours.map((colour) => painted(colour, 'an axis figure'))).toEqual([
      fromToken(tokens, '--skin-field-text'),
    ]);
  });
});
