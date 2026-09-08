/**
 * The comparison panel, which only exists once the player has ticked two rows and asked for it.
 * Every other visual check walks the tabs as they open, so nothing here was ever drawn: the
 * mark on a row's best value in particular is a rule that had already been wrong twice — once
 * losing to the colour money paints itself in, once matching the fill of the hovered row.
 */
import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';

const harness = harnessFixture();

/** Opens the search tab, ticks the first two rows and asks for the comparison. */
async function openPanel() {
  const page = await harness().goto('/optimizer', '.page-optimizer');
  await page.waitForSelector('tbody .cell-pick input');
  const ticks = await page.$$('tbody .cell-pick input');
  await ticks[0]!.click();
  await ticks[1]!.click();
  await page.click('.compare-bar button');
  await page.waitForSelector('.compare-panel');
  return page;
}

describe('comparison panel', () => {
  it('marks the best value so it survives the hovered row', async () => {
    const page = await openPanel();
    const marked = await page.$$('.compare-panel .compare-best');
    expect(marked.length, 'no best value is marked at all').toBeGreaterThan(0);
    // Somewhere a single winner: a mark on every cell of every row would say nothing at all.
    // Rows where the engines tie do mark both, which is what the spec asks for.
    const perRow = await page.evaluate(() =>
      [...document.querySelectorAll('.compare-panel tbody tr')].map((row) => ({
        marked: row.querySelectorAll('.compare-best').length,
        values: row.querySelectorAll('.cell-num').length,
      })),
    );
    expect(perRow.some((r) => r.marked === 1 && r.values > 1)).toBe(true);

    const read = () =>
      page.evaluate(() => {
        const cell = document.querySelector('.compare-panel .compare-best') as HTMLElement;
        // The neighbour to compare against is another value cell of the same row, not the
        // label at its head: those two differ in alignment and padding anyway.
        const plain = [...cell.parentElement!.children].find(
          (c) => c !== cell && c.classList.contains('cell-num'),
        ) as HTMLElement;
        const of = (el: HTMLElement) => {
          const style = getComputedStyle(el);
          return { shadow: style.boxShadow, background: style.backgroundColor };
        };
        const row = cell.closest('tr') as HTMLElement;
        return { best: of(cell), plain: of(plain), row: getComputedStyle(row).backgroundColor };
      });

    const resting = await read();
    // The mark is a frame of its own, not a fill: the cell wears the same background as its
    // neighbour, so nothing about it reads as "hovered" while the pointer is elsewhere.
    expect(resting.best.shadow).not.toBe('none');
    expect(resting.best.shadow).not.toBe(resting.plain.shadow);
    expect(resting.best.background).toBe(resting.plain.background);

    // And under the pointer: the row itself takes the hover fill, the cells stay as clear as
    // each other, and the frame is still there — a fill-based mark would have vanished here,
    // wearing exactly the colour the row had just put on.
    await page.hover('.compare-panel tbody tr');
    const hovered = await read();
    expect(hovered.row, 'the row does not react to the pointer at all').not.toBe(resting.row);
    expect(hovered.best.background).toBe(hovered.plain.background);
    expect(hovered.best.shadow).toBe(resting.best.shadow);
  });

  it('draws the panel in the skin, holding only the column of labels', async () => {
    const page = await openPanel();
    const layout = await page.evaluate(() => {
      const frame = document.querySelector('.compare-panel .table-wrap') as HTMLElement;
      const cells = [...document.querySelectorAll('.compare-panel thead th')] as HTMLElement[];
      return {
        frameBorder: getComputedStyle(frame).borderTopWidth,
        pinned: cells.filter((c) => getComputedStyle(c).position === 'sticky').length,
        first: getComputedStyle(cells[0]!).position === 'sticky',
        columns: cells.length,
      };
    });
    // The panel stands in the same raised frame as every other list and holds the column a row
    // is recognised by — the figure's name — while its last column, one engine's numbers,
    // scrolls with the rest instead of being parked over its neighbour.
    expect(layout.frameBorder).not.toBe('0px');
    expect(layout.pinned).toBe(1);
    expect(layout.first).toBe(true);
    expect(layout.columns).toBeGreaterThanOrEqual(3);
  });
});
