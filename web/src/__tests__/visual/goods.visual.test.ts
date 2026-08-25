import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';

/**
 * A cell listing several cargoes stacks them one per line, and the cell beside it stacks the
 * figures for the same cargoes. The two only read correctly while their lines sit at the same
 * heights — a cargo the game shows no rating for leaves its line blank, and a blank line of no
 * height would slide every rating below it up against the wrong cargo.
 *
 * Only the rendered page can answer this: the stylesheet says nothing about where a line ends
 * up, and jsdom lays nothing out at all.
 */

const harness = harnessFixture();

describe('cargo lines of a station', () => {
  it('line up with the figures beside them, blank ones included', async () => {
    const page = await harness().goto('/game', '.page-game');
    await page.click('[role="tab"]:nth-of-type(3)');
    await page.waitForSelector('.goods-list');

    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('tbody tr')]
        .map((row) => {
          const lists = row.querySelectorAll('.goods-list');
          if (lists.length < 2) return null;
          const tops = (list: Element) =>
            [...list.children].map((entry) => Math.round(entry.getBoundingClientRect().top));
          const name = row.querySelector('td')?.textContent ?? '';
          return { station: name, left: tops(lists[0]), right: tops(lists[1]) };
        })
        .filter((row): row is { station: string; left: number[]; right: number[] } => row !== null),
    );

    // the fixture holds a station with two cargoes, one of them unrated
    expect(rows.some((row) => row.left.length > 1)).toBe(true);
    for (const row of rows) {
      expect(row.right, `${row.station}: a rating sits beside the wrong cargo`).toEqual(row.left);
    }
  });
});
