import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { WINDOW_COLOURS } from '../../skin';
import { harnessFixture, VIEWPORT } from './harness';
import { openKit, showGroup } from './kit';
import { ROUTES } from './routes';

/**
 * The keyboard's place on the page is marked the way the game marks the widget it has
 * selected: a dashed frame in the colour of the window's text. Mantine's own ring is the
 * primary colour — the yellow of the very plates it rings — and a field had no ring at all, so
 * what is asserted here is the frame actually drawn, on every kind of control, in every colour
 * group the window can take — and drawn whole: not cut off by a box that clips its overflow,
 * not painted over by a pinned cell, and not laid across the lettering it frames.
 */

const harness = harnessFixture();

/**
 * Where a control draws its frame: on itself, on the part drawn right after a hidden input
 * (a switch's track, a row option's plate), on the header cell a sort button fills, or on the
 * held list cell a checkbox stands in (skin-mantine.css, the comparison tick of Best train).
 */
type FrameOn = 'self' | 'next' | 'header' | 'cell';

interface Control {
  readonly name: string;
  readonly focus: string;
  readonly frame: FrameOn;
  /**
   * Whether the text inside is the control's own caption, which the frame must stay off. A
   * drawing the keyboard can pan — the chain graph — holds labels that move anywhere under its
   * edge, and those are not what the frame marks.
   */
  readonly captioned?: boolean;
}

const KIT_CONTROLS: readonly Control[] = [
  { name: 'field', focus: '.page-kit .mantine-TextInput-input', frame: 'self' },
  { name: 'tab', focus: 'nav a', frame: 'self' },
  { name: 'button', focus: '.page-kit .mantine-Button-root:not(:disabled)', frame: 'self' },
  {
    name: 'option of a switch',
    focus: '.page-kit .mantine-SegmentedControl-input:not(:disabled)',
    frame: 'next',
  },
  { name: 'switch', focus: '.page-kit .mantine-Switch-input:not(:disabled)', frame: 'next' },
  { name: 'checkbox', focus: '.page-kit .mantine-Checkbox-input:not(:disabled)', frame: 'self' },
  { name: 'dropdown', focus: '.page-kit .mantine-Select-input:not(:disabled)', frame: 'self' },
  { name: 'link', focus: '.app-footer a', frame: 'self' },
  { name: 'sortable header', focus: '.page-kit .mantine-Table-th .sort-button', frame: 'header' },
  { name: 'disclosure heading', focus: '.page-kit .how-computed-toggle', frame: 'self' },
];

/** The frame on the control, and everything that could keep it from being seen whole. */
async function frameOf(page: Page, { focus, frame, captioned = true }: Control) {
  // a key press puts the browser in keyboard mode, so a focus that follows counts as visible
  await page.keyboard.press('Shift');
  await page.locator(focus).first().focus();
  return page.evaluate(({ frame, captioned }) => {
    const focused = document.activeElement!;
    const drawn =
      frame === 'next'
        ? focused.nextElementSibling!
        : frame === 'header'
          ? focused.closest('th')!
          : frame === 'cell'
            ? focused.closest('td')!
            : focused;
    const style = getComputedStyle(drawn);
    const probe = document.createElement('div');
    probe.style.color = 'var(--skin-text)';
    drawn.parentElement!.append(probe);
    const text = getComputedStyle(probe).color;
    probe.remove();

    const offset = parseFloat(style.outlineOffset);
    const width = parseFloat(style.outlineWidth);
    // how far the frame reaches past the box, and how deep it lies inside it
    const reach = Math.max(0, offset + width);
    const depth = Math.max(0, -offset);
    const box = drawn.getBoundingClientRect();
    const faults: string[] = [];

    // a box that clips its overflow cuts at the inside of its own border, not the outside
    for (let ancestor = drawn.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const own = getComputedStyle(ancestor);
      if (own.overflowX === 'visible' && own.overflowY === 'visible') continue;
      const outer = ancestor.getBoundingClientRect();
      const left = outer.left + ancestor.clientLeft;
      const top = outer.top + ancestor.clientTop;
      const sides = {
        left: left - (box.left - reach),
        right: box.right + reach - (left + ancestor.clientWidth),
        top: top - (box.top - reach),
        bottom: box.bottom + reach - (top + ancestor.clientHeight),
      };
      for (const [side, cut] of Object.entries(sides)) {
        if (cut > 0.5) faults.push(`${side} cut off by ${ancestor.className.toString().slice(0, 40)}`);
      }
    }

    // a pinned cell of a neighbouring row paints over whatever reaches past a cell's own box
    const cell = drawn.closest('td');
    if (cell && getComputedStyle(cell).position === 'sticky' && reach > 0.5) {
      faults.push(`reaches ${reach}px past a pinned cell, under the next row`);
    }

    // and a pinned cell of its own row lies over whatever has scrolled under it
    const row = drawn.closest('tr');
    const ownCell = drawn.closest('td, th');
    for (const pinned of row ? [...row.children] : []) {
      if (pinned === ownCell || getComputedStyle(pinned).position !== 'sticky') continue;
      const over = pinned.getBoundingClientRect();
      const covered =
        over.left < box.right + reach - 0.5 &&
        over.right > box.left - reach + 0.5 &&
        over.top < box.bottom + reach - 0.5 &&
        over.bottom > box.top - reach + 0.5;
      if (covered) faults.push('lies under a pinned column of its own row');
    }

    /*
     * A frame drawn inside the box must stay off the lettering. Only the text itself is
     * measured, not the boxes around it: across the line, the width of the run; up and down,
     * the em box around the middle of the line — a line box is taller than the letters by its
     * leading, and the game's font draws nothing outside its em.
     */
    if (depth > 0 && captioned) {
      const walker = document.createTreeWalker(drawn, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const run = range.getBoundingClientRect();
        const em = parseFloat(getComputedStyle(node.parentElement!).fontSize);
        const middle = (run.top + run.bottom) / 2;
        const crossed =
          run.left < box.left + depth - 0.5 ||
          run.right > box.right - depth + 0.5 ||
          middle - em / 2 < box.top + depth - 0.5 ||
          middle + em / 2 > box.bottom - depth + 0.5;
        if (crossed) faults.push(`the frame lies across "${node.textContent.trim().slice(0, 20)}"`);
      }
    }

    return {
      style: style.outlineStyle,
      colour: style.outlineColor,
      width: style.outlineWidth,
      text,
      faults,
    };
  }, { frame, captioned });
}

function expectWholeFrame(drawn: Awaited<ReturnType<typeof frameOf>>) {
  expect(drawn.style, 'no dashed frame round the focused control').toBe('dashed');
  expect(parseFloat(drawn.width)).toBeGreaterThan(0);
  expect(drawn.colour, 'the frame is not the colour of the window text').toBe(drawn.text);
  expect(drawn.faults, 'the frame is not seen whole').toEqual([]);
}

describe.each(WINDOW_COLOURS)('in the %s window', (group) => {
  it.each(KIT_CONTROLS)('frames a $name reached from the keyboard', async (control) => {
    const page = await openKit(harness());
    await showGroup(page, group);
    expectWholeFrame(await frameOf(page, control));
  });
});

/**
 * The lists of the tabs themselves: a catalogue as wide as its column, pinned edge columns and
 * a row action in the last one — the places where a frame is cut off or painted over.
 */
const LIST_CONTROLS: readonly (Control & { readonly path: string })[] = [
  { path: '/consist', name: 'row action', focus: '.page-consist tbody .btn-add', frame: 'self' },
  { path: '/consist', name: 'sortable header', focus: '.page-consist th .sort-button', frame: 'header' },
  { path: '/optimizer', name: 'sortable header', focus: '.page-optimizer th .sort-button', frame: 'header' },
  // the tick stands in a held leading cell, which any frame reaching past it would be covered
  // by, and a frame inside the box would cover the tick — so the cell is what is framed
  {
    path: '/optimizer',
    name: 'checkbox',
    focus: '.page-optimizer tbody .mantine-Checkbox-input',
    frame: 'cell',
  },
  { path: '/game', name: 'button that reads as a link', focus: '.page-game tbody .btn-link', frame: 'self' },
];

/** Controls outside the lists that the skin frames by rules of their own. */
const PAGE_CONTROLS: readonly (Control & { readonly path: string })[] = [
  { path: '/network', name: 'plain link', focus: '.page-network a:not(.mantine-focus-auto)', frame: 'self' },
  { path: '/firs', name: 'chain graph canvas', focus: '.graph-canvas', frame: 'self', captioned: false },
  { path: '/income', name: 'income chart', focus: '.page-route svg[tabindex]', frame: 'self' },
];

describe('on the tabs themselves', () => {
  it.each([...LIST_CONTROLS, ...PAGE_CONTROLS])('frames the $name on $path whole', async (control) => {
    const route = ROUTES.find((entry) => entry.path === control.path)!;
    const page = await harness().goto(route.path, route.ready);
    expectWholeFrame(await frameOf(page, control));
  });
});

/** The window width at which a header of the best-train list crosses its pinned last column. */
const CROSSING_WIDTH = { width: 1280, height: 900 };

/**
 * Opens the best-train list at that width with the list scrolled to its start, and marks the
 * header that runs under the pinned last column (`data-crossing`, with the column's left edge in
 * `data-pin-edge`). Fails when no header does: the checks would be measuring a header that was
 * never under anything.
 */
async function openWithCrossingHeader() {
  const page = await harness().goto('/optimizer', '.page-optimizer');
  await page.setViewportSize(CROSSING_WIDTH);
  const found = await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.page-optimizer .table-wrap')!;
    list.scrollLeft = 0;
    const cells = [...list.querySelectorAll<HTMLElement>('thead th')];
    const pin = cells.filter((cell) => getComputedStyle(cell).position === 'sticky').pop()!;
    const edge = pin.getBoundingClientRect().left;
    const crossing = cells.find((cell) => {
      const box = cell.getBoundingClientRect();
      return cell !== pin && cell.querySelector('.sort-button') && box.left < edge && box.right > edge;
    });
    if (!crossing) return false;
    crossing.dataset.crossing = '';
    crossing.dataset.pinEdge = String(edge);
    return true;
  });
  expect(found, 'no header crosses the pinned column at this width, so nothing is measured').toBe(true);
  return page;
}

describe('a header half under the pinned last column', () => {
  /*
   * The browser scrolls a focused element into view only while it is out of view altogether, so
   * a header half under the pinned column stays there and its frame is hidden. Which header that
   * is depends on the window's width; at this one a header of the best-train list crosses the
   * pinned column's edge before the list is scrolled, and the check makes sure one does, or it
   * would be measuring a header that was never under anything.
   */
  it('is scrolled clear of it when the keyboard reaches it', async () => {
    const page = await openWithCrossingHeader();
    const drawn = await frameOf(page, {
      name: 'header half under the pinned column',
      focus: '.page-optimizer th[data-crossing] .sort-button',
      frame: 'header',
    });
    await page.setViewportSize(VIEWPORT);
    expectWholeFrame(drawn);
  });

  it('stays where it is under a press of the mouse', async () => {
    // a press of the mouse shows no frame, so the list has nothing to bring into sight — and
    // one that jumped under the pointer would move the header that was about to be clicked
    const page = await openWithCrossingHeader();
    const point = await page.evaluate(() => {
      const header = document.querySelector('.page-optimizer th[data-crossing]')!.getBoundingClientRect();
      const edge = Number(document.querySelector<HTMLElement>('.page-optimizer th[data-crossing]')!.dataset.pinEdge);
      // the part of the header still in sight, left of the pinned column
      return { x: (header.left + edge) / 2, y: (header.top + header.bottom) / 2 };
    });

    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    const scrolled = await page.evaluate(
      () => document.querySelector<HTMLElement>('.page-optimizer .table-wrap')!.scrollLeft,
    );
    await page.mouse.up();
    await page.setViewportSize(VIEWPORT);

    expect(scrolled, 'the list moved under the pointer').toBe(0);
  });
});

describe('a click of the mouse', () => {
  it('leaves no frame on the button it pressed', async () => {
    const page = await openKit(harness());
    const button = page.locator('.page-kit .mantine-Button-root:not(:disabled)').first();
    await button.click();
    const style = await button.evaluate((element) => ({
      focused: document.activeElement === element,
      outline: getComputedStyle(element).outlineStyle,
    }));
    expect(style.focused, 'the click did not focus the button, so nothing is measured').toBe(true);
    expect(style.outline).toBe('none');
  });
});

describe('a system asking for less motion', () => {
  /*
   * Mantine drops its CSS transitions and animations through one rule of its own —
   * `[data-respect-reduced-motion] [data-reduce-motion]` under the reduced-motion query — and the
   * attribute on the root is only there when the theme asks for it; its JS transitions
   * (windows, dropdowns) follow the same theme flag. The harness browser already asks for
   * reduced motion, so the page is measured as it is, and then once more with the root attribute
   * taken away — which is what the page looked like before the theme asked. A finished
   * transition reads 0s either way, so what is compared is whether the moving parts carry a
   * transition at all.
   *
   * The harness cuts every transition outright with a style of its own (see harness.ts), which
   * would make both readings "none"; that style is lifted for the measurement and put back.
   */
  it('gets controls that change at once', async () => {
    const page = await openKit(harness());
    const shot = await page.evaluate(() => {
      const root = document.documentElement;
      const cuts = [...document.querySelectorAll('style')].filter((style) =>
        style.textContent?.includes('transition: none !important'),
      );
      const places = cuts.map((style) => ({ style, parent: style.parentNode!, next: style.nextSibling }));
      cuts.forEach((style) => style.remove());

      const read = () =>
        [...document.querySelectorAll('[data-reduce-motion]')].map((element) => ({
          transition: getComputedStyle(element).transitionProperty,
          animation: getComputedStyle(element).animationName,
        }));
      const respected = root.dataset.respectReducedMotion === 'true';
      const reduced = read();
      root.removeAttribute('data-respect-reduced-motion');
      const ignored = read();

      if (respected) root.dataset.respectReducedMotion = 'true';
      places.forEach(({ style, parent, next }) => parent.insertBefore(style, next));
      return { respected, lifted: cuts.length, reduced, ignored };
    });

    expect(shot.lifted, "the harness's own cut was not found, so nothing is measured").toBeGreaterThan(0);
    expect(shot.respected, 'the theme does not ask Mantine to respect the request').toBe(true);
    expect(shot.reduced.length, 'nothing on the page moves, so nothing is measured').toBeGreaterThan(0);
    for (const part of shot.reduced) {
      expect(part.transition, 'a part still moves under reduced motion').toBe('none');
      expect(part.animation).toBe('none');
    }
    // and it is the theme's request that stills them, not a rule of the skin that always did
    expect(shot.ignored.some((part) => part.transition !== 'none')).toBe(true);
  });
});

describe('a header under the hint of columns further right', () => {
  /*
   * The hint stands over the right end of the scrolling part while the list is not scrolled to
   * its end, so a header the keyboard reaches there would have its frame under the hint. The
   * list scrolls it clear of the hint as it does of the pinned column; the check makes sure a
   * header does run under the hint at this width, or it would be measuring nothing.
   */
  it('is scrolled clear of the hint when the keyboard reaches it', async () => {
    const page = await harness().goto('/optimizer', '.page-optimizer');
    await page.setViewportSize(CROSSING_WIDTH);
    try {
      const found = await page.evaluate(() => {
        const list = document.querySelector<HTMLElement>('.page-optimizer .table-wrap')!;
        list.scrollLeft = 0;
        const hint = list.parentElement!.querySelector<HTMLElement>('.table-overflow-hint')!;
        if (getComputedStyle(hint).display === 'none') return false;
        const edge = hint.getBoundingClientRect().left;
        const cells = [...list.querySelectorAll<HTMLElement>('thead th')];
        const under = cells.find((cell) => {
          const box = cell.getBoundingClientRect();
          return getComputedStyle(cell).position !== 'sticky' && cell.querySelector('.sort-button') && box.right > edge + 1;
        });
        if (!under) return false;
        under.dataset.underHint = '';
        return true;
      });
      expect(found, 'no header runs under the hint at this width, so nothing is measured').toBe(true);

      await page.keyboard.press('Shift');
      await page.locator('.page-optimizer th[data-under-hint] .sort-button').focus();
      await page.waitForTimeout(100);
      const clear = await page.evaluate(() => {
        const header = document.querySelector('.page-optimizer th[data-under-hint]')!.getBoundingClientRect();
        const hint = document.querySelector<HTMLElement>('.page-optimizer .table-overflow-hint')!;
        const shown = getComputedStyle(hint).display !== 'none';
        return { shown, headerRight: header.right, hintLeft: hint.getBoundingClientRect().left };
      });
      if (clear.shown) {
        expect(clear.headerRight, 'the frame of the header lies under the hint').toBeLessThanOrEqual(clear.hintLeft + 0.5);
      }
    } finally {
      await page.setViewportSize(VIEWPORT);
    }
  });
});
