/**
 * How a route's ways out sit on the rendered page: an arrow at the end of the row, and the
 * cargo itself as a link. What they carry is checked in jsdom; what cannot be checked there
 * is the layout — the link must stay inside the line of text it is made of, and it must not
 * break the neighbouring column into pieces.
 */
import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';

const harness = harnessFixture();

describe('the ways out of a route on the page', () => {
  it('keeps the cargo link on the line of its own text', async () => {
    const page = await harness().goto('/game', '.route-row');
    const link = page.locator('.route-row .cargo-bridge').first();

    const display = await link.evaluate((el) => getComputedStyle(el).display);
    // inline, or the cargo icon and its name would become separate flex items
    expect(display).toBe('inline');

    // and the line it sits in is not turned into a flex row either: that would put a second
    // space into the neighbouring column, between a figure and its share
    const rowDisplay = await link.evaluate(
      (el) => getComputedStyle(el.closest('td')!).display,
    );
    expect(rowDisplay).not.toContain('flex');
  });

  it('offers the row action the same way the optimizer does', async () => {
    const page = await harness().goto('/game', '.route-row');
    const routeArrow = page.locator('.route-row td:last-child .btn-add').first();
    const route = {
      text: await routeArrow.innerText(),
      box: await routeArrow.boundingBox(),
    };

    await harness().goto('/optimizer', 'tbody tr .btn-add');
    const optimizerArrow = page.locator('tbody tr td:last-child .btn-add').first();

    // same control, same place: the last cell of the row, at the same size
    expect(route.text).toBe(await optimizerArrow.innerText());
    const optimizerBox = await optimizerArrow.boundingBox();
    expect(Math.round(route.box!.height)).toBe(Math.round(optimizerBox!.height));
  });

  it('sets the row action apart from the figures beside it', async () => {
    const page = await harness().goto('/game', '.route-row');
    const arrow = page.locator('.route-bridge-cell .btn-add').first();
    const money = page.locator('.route-row .cell-money').last();

    const [arrowBox, moneyBox] = await Promise.all([arrow.boundingBox(), money.boundingBox()]);
    // the arrow is a control of its own, standing after the figures rather than among them
    expect(arrowBox!.x).toBeGreaterThan(moneyBox!.x + moneyBox!.width);
    // and it is drawn as a control: the skin gives it a frame, not bare text
    const border = await arrow.evaluate((el) => getComputedStyle(el).borderTopWidth);
    expect(border).not.toBe('0px');
  });
});
