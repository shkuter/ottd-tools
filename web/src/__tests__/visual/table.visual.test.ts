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

  it('lines money up digit under digit', async () => {
    // Which columns read right is checked in list.visual.test.ts, for every kind
    // of figure. What only money has is the tabular figure: a column of prices
    // is compared by eye down the column, and proportional digits make the same
    // number of them different widths.
    const page = await harness().goto(route.path, route.ready);
    const figures = await page.evaluate(() => {
      const cell = document.querySelector('.table-wrap tbody td.cell-money');
      if (!cell) return { error: 'no money column on this tab' as const };
      return { variant: getComputedStyle(cell).fontVariantNumeric };
    });

    expect(figures.error).toBeUndefined();
    if ('error' in figures) return;
    expect(figures.variant, 'money lines up digit under digit').toContain('tabular-nums');
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
      probe.style.padding = 'var(--skin-pad-cell)';
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
  it('marks the edge of a pinned column and lets the last value out from under it', async () => {
    const page = await harness().goto(route.path, route.ready);

    const measured = await page.evaluate(() => {
      const wrap = document.querySelector<HTMLElement>('.table-wrap.pin-edges');
      if (!wrap) return { error: 'no pinned list' as const };
      const row = wrap.querySelector('tbody tr');
      if (!row) return { error: 'no rows' as const };

      const pinned = row.lastElementChild!;
      const edge = getComputedStyle(pinned).borderLeftWidth;

      // scrolled to the far right, the last value of the row is out in the open
      wrap.scrollLeft = wrap.scrollWidth;
      const last = row.children[row.children.length - 2]!.getBoundingClientRect();
      const cover = pinned.getBoundingClientRect();
      return { edge, overlap: Math.round(last.right - cover.left) };
    });

    expect(measured.error, 'the tab lists something').toBeUndefined();
    if ('error' in measured) return;
    expect(measured.edge, 'a pinned column has an edge of its own').not.toBe('0px');
    expect(
      measured.overlap,
      'and at the far end of the scroll nothing hides under it',
    ).toBeLessThanOrEqual(0);
  });
});
