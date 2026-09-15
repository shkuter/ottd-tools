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
  // the specimen of a list, which is on the page for exactly this
  { path: '/kit', ready: '.page-kit' },
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
      // the page may hold more than one frame (the specimen page does); a list of selectors
      // would return whichever comes first in the DOM, so the pinned one is asked for by name
      const wrap = document.querySelector<HTMLElement>('.table-wrap.pin-edges');
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

/**
 * A list held by more than its first column: Best train holds the rank together with the engine
 * — the number, the comparison tick, the sprite and the name — and the specimen page holds a list
 * shaped the same way. Each held cell stands where the columns before it end, so they sit side by
 * side without covering one another, and the edge is drawn once, after the last of them. On a
 * window where they would take more than half the list, only the number is held.
 *
 * The widths the check sets are read off the list itself — twice the width of the held columns,
 * plus and minus a margin — so the check does not depend on the data or the language.
 */
const LEADING = [
  { path: '/optimizer', ready: '.page-optimizer', frame: '.page-optimizer .table-wrap.pin-leading' },
  { path: '/kit', ready: '.page-kit', frame: '[data-testid="kit-list-leading"] .table-wrap.pin-leading' },
];
const HELD = 4;

interface Leading {
  error?: string;
  /** the width of the held columns together, and of the first alone */
  sum: number;
  first: number;
  scrolled: number;
  /** how far each cell of the first row moved when the list was scrolled to its end */
  moved: number[];
  /** how far each held cell reaches over the next one, after the scroll */
  overlaps: number[];
  edges: string[];
  inline: string[];
  held: boolean[];
  /** the offsets the held cells should have: the widths of the columns before each */
  expectedLefts: number[];
  lastRowHeld: boolean;
}

/** Sets the frame to `width` (or leaves it), scrolls it end to end and reads the first row. */
function measureLeading({ selector, count, width }: { selector: string; count: number; width: number | null }) {
  return (async (): Promise<Leading> => {
    const empty = { sum: 0, first: 0, scrolled: 0, moved: [], overlaps: [], edges: [], inline: [], held: [], expectedLefts: [], lastRowHeld: false };
    const wrap = document.querySelector<HTMLElement>(selector);
    if (!wrap) return { ...empty, error: 'no list holding its leading columns' };
    // the offsets are rewritten by a resize observer, which reports before the next frame
    const frames = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (width !== null) {
      wrap.style.width = `${width}px`;
      await frames();
    }
    const rows = wrap.querySelectorAll('tbody tr');
    const row = rows[0];
    if (!row) return { ...empty, error: 'the list has no rows' };
    const cells = [...row.children] as HTMLElement[];
    const lead = cells.slice(0, count);
    const widths = lead.map((cell) => cell.getBoundingClientRect().width);
    const expectedLefts = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0));

    wrap.scrollLeft = 0;
    await frames();
    const before = cells.map((cell) => cell.getBoundingClientRect().left);
    wrap.scrollLeft = wrap.scrollWidth;
    await frames();
    const scrolled = wrap.scrollLeft;
    const after = cells.map((cell) => cell.getBoundingClientRect().left);
    const boxes = lead.map((cell) => cell.getBoundingClientRect());
    const last = rows[rows.length - 1].children[count - 1] as HTMLElement | undefined;
    const result = {
      sum: widths.reduce((a, b) => a + b, 0),
      first: widths[0],
      scrolled,
      moved: cells.map((_, i) => Math.abs(before[i] - after[i])),
      overlaps: boxes.slice(1).map((box, i) => boxes[i].right - box.left),
      edges: lead.map((cell) => getComputedStyle(cell).borderRightWidth),
      inline: lead.map((cell) => cell.style.left),
      held: lead.map((cell) => cell.classList.contains('pin-lead')),
      expectedLefts,
      lastRowHeld: !!last?.classList.contains('pin-lead'),
    };
    wrap.scrollLeft = 0;
    return result;
  })();
}

describe.each(LEADING)('$path, a list held by its leading columns', (list) => {
  it('holds the rank and the vehicle side by side, and only the rank on a narrow window', async () => {
    const page = await harness().goto(list.path, list.ready);
    const measure = (width: number | null) =>
      page.evaluate(measureLeading, { selector: list.frame, count: HELD, width });

    const natural = await measure(null);
    expect(natural.error, 'the list this checks').toBeUndefined();
    const threshold = 2 * natural.sum;

    try {
      // wide: every held column stays, side by side, with one edge after the name
      const wide = await measure(threshold + 200);
      expect(wide.scrolled, 'nothing was scrolled, so nothing was proven').toBeGreaterThan(0);
      for (let i = 0; i < HELD; i++) {
        expect(wide.moved[i], `held column ${i + 1} must not move`).toBeLessThan(1);
        expect(wide.held[i], `column ${i + 1} is held`).toBe(true);
        expect(parseFloat(wide.inline[i]), `column ${i + 1} stands after the ones before it`).toBeCloseTo(
          wide.expectedLefts[i],
          0,
        );
      }
      expect(wide.moved.at(-1), 'the action column is held too').toBeLessThan(1);
      expect(Math.max(...wide.moved.slice(HELD, -1)), 'the figures scroll').toBeGreaterThan(0);
      for (const overlap of wide.overlaps) {
        expect(overlap, 'held columns do not cover one another').toBeLessThanOrEqual(1);
      }
      expect(wide.edges.slice(0, HELD - 1), 'no edge between the held columns').toEqual(
        Array(HELD - 1).fill('0px'),
      );
      expect(wide.edges[HELD - 1], 'the edge stands after the name').not.toBe('0px');

      // narrow: only the number is held, and the others lose what the wide window gave them
      const narrowWidth = Math.max(threshold - 200, natural.first + 100);
      expect(narrowWidth, 'the held columns are too narrow to try the fallback').toBeLessThan(threshold);
      const narrow = await measure(narrowWidth);
      expect(narrow.moved[0], 'the number stays').toBeLessThan(1);
      expect(narrow.held[0]).toBe(true);
      expect(narrow.edges[0], 'the edge moves to the number').not.toBe('0px');
      for (let i = 1; i < HELD; i++) {
        expect(narrow.inline[i], `column ${i + 1} keeps no offset`).toBe('');
        expect(narrow.held[i], `column ${i + 1} is not held`).toBe(false);
      }

      // and back
      const again = await measure(threshold + 200);
      expect(again.held, 'the wide window holds all four again').toEqual(Array(HELD).fill(true));
    } finally {
      await page.evaluate((selector) => {
        const wrap = document.querySelector<HTMLElement>(selector);
        if (wrap) wrap.style.width = '';
      }, list.frame);
    }
  });
});

describe('/optimizer, the held columns after the rows change', () => {
  it('recomputes the offsets after a re-sort and after "show more"', async () => {
    const page = await harness().goto('/optimizer', '.page-optimizer');
    const selector = '.page-optimizer .table-wrap.pin-leading';
    const measure = () => page.evaluate(measureLeading, { selector, count: HELD, width: null });

    // by the engine: the order of the rows changes, and with it the widest name in the column
    await page.locator('.page-optimizer thead th:nth-child(3) .sort-button').click();
    const sorted = await measure();
    expect(sorted.error).toBeUndefined();
    for (let i = 0; i < HELD; i++) {
      expect(parseFloat(sorted.inline[i])).toBeCloseTo(sorted.expectedLefts[i], 0);
    }

    const more = page.locator('.page-optimizer .table-more button').first();
    expect(await more.count(), 'the answer is long enough to show more of').toBeGreaterThan(0);
    await more.click();
    const longer = await measure();
    expect(longer.lastRowHeld, 'a row shown later is held like the first').toBe(true);
    for (let i = 0; i < HELD; i++) {
      expect(parseFloat(longer.inline[i])).toBeCloseTo(longer.expectedLefts[i], 0);
    }
  });
});

/**
 * The hint of columns further right: shown at the start of the scroll of a list wider than its
 * frame, clear of the edge of the column held at the right; gone at the end of the scroll, where
 * the last value stands in the open, and gone from a list that fits its frame.
 */
describe.each([
  { path: '/optimizer', ready: '.page-optimizer tbody' },
  { path: '/consist', ready: '.page-consist tbody' },
])('$path, the hint of columns further right', (route) => {
  it('stands at the start of the scroll, clear of the held column, and goes at the end and when the list fits', async () => {
    const page = await harness().goto(route.path, route.ready);
    const shot = await page.evaluate(async (scope) => {
      const frames = () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const wrap = document.querySelector<HTMLElement>(`${scope} .table-wrap.pin-edges`)!;
      // the frame is sized from outside, as the column it stands in sizes it: the hint stands
      // in the holder around the scrolling part, so that is what is narrowed and widened
      const holder = wrap.parentElement!;
      const hint = holder.querySelector<HTMLElement>('.table-overflow-hint')!;
      const row = wrap.querySelector('tbody tr')!;
      const cells = [...row.children] as HTMLElement[];
      const pinned = cells[cells.length - 1];
      const shown = () => getComputedStyle(hint).display !== 'none' && hint.getBoundingClientRect().width > 0;

      holder.style.width = '500px';
      wrap.scrollLeft = 0;
      await frames();
      const start = {
        shown: shown(),
        hintRight: hint.getBoundingClientRect().right,
        hintLeft: hint.getBoundingClientRect().left,
        frameLeft: wrap.getBoundingClientRect().left,
        pinLeft: pinned.getBoundingClientRect().left,
        focusable: hint.tabIndex >= 0 || !!hint.querySelector('a, button, input, [tabindex]'),
        hidden: hint.getAttribute('aria-hidden'),
        pointer: getComputedStyle(hint).pointerEvents,
      };

      wrap.scrollLeft = wrap.scrollWidth;
      await frames();
      const end = {
        shown: shown(),
        overlap: cells[cells.length - 2].getBoundingClientRect().right - pinned.getBoundingClientRect().left,
      };

      holder.style.width = `${wrap.scrollWidth + 2 * wrap.clientLeft + 40}px`;
      wrap.scrollLeft = 0;
      await frames();
      const fits = { shown: shown(), overflows: wrap.scrollWidth > wrap.clientWidth + 1 };

      holder.style.width = '';
      wrap.scrollLeft = 0;
      return { start, end, fits };
    }, route.ready.split(' ')[0]);

    expect(shot.start.shown, 'a list wider than its frame shows the hint at the start').toBe(true);
    expect(shot.start.hintRight, 'the hint covers the edge of the held column').toBeLessThanOrEqual(shot.start.pinLeft + 0.5);
    expect(shot.start.hintLeft).toBeGreaterThan(shot.start.frameLeft);
    expect(shot.start.focusable, 'the hint is no tab stop').toBe(false);
    expect(shot.start.hidden).toBe('true');
    expect(shot.start.pointer, 'the hint takes presses meant for the list').toBe('none');
    expect(shot.end.shown, 'the hint stays at the end of the scroll').toBe(false);
    expect(shot.end.overlap, 'the last value is left under the held column').toBeLessThanOrEqual(0);
    expect(shot.fits.overflows, 'the frame was not widened enough to hold the list').toBe(false);
    expect(shot.fits.shown, 'a list that fits its frame shows the hint').toBe(false);
  });
});
