import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';

/**
 * The two things about a list that only the rendered page can answer.
 *
 * A pinned edge column is `position: sticky` on a cell inside a container that scrolls
 * sideways. Whether it actually holds still cannot be read off the stylesheet — that depends on
 * which ancestor ends up being the scroll container, which is exactly what went wrong with the
 * header this change removed: `overflow-x: auto` makes the browser compute `overflow-y: auto`
 * too, so a header pinned to the top stuck to a container that never scrolls vertically and
 * quietly did nothing.
 *
 * And the row metrics come from the skin's own token, not from a number written into a page's
 * stylesheet. The expectation is read off the theme carrier rather than spelled out here, so
 * rescaling the skin moves the check with it.
 */

const harness = harnessFixture();

/** Tabs whose list pins its edge columns; supply's table fits its column and pins nothing. */
const PINNED = [
  { path: '/optimizer', ready: '.page-optimizer' },
  { path: '/consist', ready: '.page-consist' },
];

describe.each(PINNED)('$path', (route) => {
  it('holds its edge columns while the row scrolls sideways', async () => {
    const page = await harness().goto(route.path, route.ready);
    const moved = await page.evaluate(() => {
      const wrap = document.querySelector<HTMLElement>('.table-wrap.pin-edges');
      if (!wrap) return { error: 'no pinned list on the page' };
      const row = wrap.querySelector('tbody tr');
      if (!row) return { error: 'the list has no rows to measure' };
      // narrow the frame so the table is certainly wider than it, whatever the viewport is
      const width = wrap.style.width;
      wrap.style.width = '500px';
      const cells = [...row.children] as HTMLElement[];
      const middle = cells[Math.floor(cells.length / 2)];
      const left = () => cells[0].getBoundingClientRect().left;
      const right = () => cells[cells.length - 1].getBoundingClientRect().right;
      const centre = () => middle.getBoundingClientRect().left;
      const before = { first: left(), last: right(), middle: centre() };
      wrap.scrollLeft = wrap.scrollWidth - wrap.clientWidth;
      const scrolled = wrap.scrollLeft;
      const after = { first: left(), last: right(), middle: centre() };
      const background = getComputedStyle(cells[0]).backgroundColor;
      wrap.style.width = width;
      return {
        scrolled,
        first: Math.abs(before.first - after.first),
        last: Math.abs(before.last - after.last),
        middle: Math.abs(before.middle - after.middle),
        background,
      };
    });

    expect(moved.error, 'the pinned list is what this checks').toBeUndefined();
    expect(moved.scrolled, 'nothing was scrolled, so nothing was proven').toBeGreaterThan(0);
    expect(moved.middle, 'the middle of the row is meant to scroll away').toBeGreaterThan(0);
    // sub-pixel: a fractional container width rounds the right edge by half a pixel
    expect(moved.first, 'the first column is pinned and must not move').toBeLessThan(1);
    expect(moved.last, 'the last column is pinned and must not move').toBeLessThan(1);
    // a see-through pinned cell would let the scrolling row show through it
    expect(moved.background, 'a pinned cell needs a background of its own').not.toBe(
      'rgba(0, 0, 0, 0)',
    );
  });

  it('keeps the money columns right-aligned', async () => {
    // A cell modifier and the row rule are both one class, so whichever comes later wins. When
    // the table rules moved into the skin, .cell-money stayed behind in a file imported earlier
    // and lost silently — the rule was still there, the column was simply left-aligned again.
    const page = await harness().goto(route.path, route.ready);
    const aligned = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('.table-wrap tbody td.cell-money')];
      const heads = [...document.querySelectorAll('.table-wrap thead th.cell-money')];
      if (!cells.length) return { error: 'no money column on this tab' };
      return {
        cells: cells.map((c) => getComputedStyle(c).textAlign),
        heads: heads.map((h) => getComputedStyle(h).textAlign),
        figures: getComputedStyle(cells[0]).fontVariantNumeric,
      };
    });

    expect(aligned.error).toBeUndefined();
    expect(new Set(aligned.cells), 'every money cell is right-aligned').toEqual(
      new Set(['right']),
    );
    expect(new Set(aligned.heads), 'and so is the header above it').toEqual(new Set(['right']));
    expect(aligned.figures, 'money lines up digit under digit').toContain('tabular-nums');
  });

  it('takes its row metrics from the skin, and holds no header at the top', async () => {
    const page = await harness().goto(route.path, route.ready);
    const measured = await page.evaluate(() => {
      const wrap = document.querySelector<HTMLElement>('.table-wrap');
      if (!wrap) return { error: 'no list on the page' };
      // a cell holding a sprite has padding of its own, so measure an ordinary one
      const cell = [...wrap.querySelectorAll('tbody td')].find(
        (td) => !td.querySelector('.train-sprite'),
      );
      if (!cell) return { error: 'the list has no plain cell to measure' };
      const heads = [...wrap.querySelectorAll('thead th')] as HTMLElement[];
      // the edge headers are pinned sideways, which is a different thing from a sticky header
      const middleHead = heads[Math.floor(heads.length / 2)];
      // what the token resolves to, asked of the browser rather than computed here: the skin
      // states it as round(calc(...)) against its own scale
      const probe = document.createElement('div');
      probe.style.padding = 'var(--skin-pad-row)';
      document.body.append(probe);
      const fromToken = getComputedStyle(probe).padding;
      probe.remove();
      return {
        padding: getComputedStyle(cell).padding,
        fromToken,
        headerPosition: getComputedStyle(middleHead).position,
      };
    });

    expect(measured.error).toBeUndefined();
    expect(measured.fromToken, 'the skin states the row padding as a token').toBeTruthy();
    expect(
      measured.padding,
      "row padding is the skin's, not a number written into a page's stylesheet",
    ).toBe(measured.fromToken);
    expect(
      measured.headerPosition,
      'there is no sticky header: the page is one document with one scrollbar',
    ).toBe('static');
  });
});
