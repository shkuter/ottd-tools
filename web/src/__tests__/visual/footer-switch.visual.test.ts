import { afterEach, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { harnessFixture, NARROW, VIEWPORT } from './harness';

/**
 * The language switch stands at the right edge of the footer, which is a row and not a
 * block any more. What a row does when it runs out of width is the question: the switch has
 * to drop below the text rather than wedge itself into the line of licence links or hang
 * past the edge of the window.
 */

const harness = harnessFixture();

afterEach(async () => {
  await harness().page.setViewportSize(VIEWPORT);
});

async function boxes(page: Page) {
  return page.evaluate(() => {
    const rect = (element: Element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    };
    const footer = document.querySelector('.app-footer')!;
    return {
      footer: rect(footer),
      text: rect(footer.querySelector('.footer-meta')!),
      switch: rect(footer.querySelector('.language-switch')!),
      // the footer's own side padding: the switch is against the edge, not merely inside it
      padding: parseFloat(getComputedStyle(footer).paddingRight),
      documentWidth: document.documentElement.clientWidth,
    };
  });
}

describe('the language switch', () => {
  it('stands against the right edge of the footer', async () => {
    const page = await harness().goto('/optimizer', '.page-optimizer');
    const shot = await boxes(page);

    expect(shot.switch.left, 'the switch overlaps the versions and sources').toBeGreaterThanOrEqual(
      shot.text.right,
    );
    // flush against the edge, up to the footer's own padding — a switch merely somewhere
    // inside the row would pass a "does not hang past" check just as well
    expect(shot.footer.right - shot.switch.right, 'the switch is not against the edge').toBeCloseTo(
      shot.padding,
      0,
    );
    expect(shot.switch.right, 'the switch hangs past the window').toBeLessThanOrEqual(
      shot.documentWidth,
    );
  });

  it('drops below the text in a narrow window', async () => {
    const page = await harness().goto('/optimizer', '.page-optimizer');
    await page.setViewportSize(NARROW);
    const shot = await boxes(page);

    expect(
      shot.switch.top,
      'at 400px the switch still shares the line with the text',
    ).toBeGreaterThanOrEqual(shot.text.bottom);
    // a wrapped switch goes to the start of its line, so what is owed here is that it
    // stays inside the footer's own box rather than hanging into its padding
    expect(shot.switch.left, 'the switch stands in the footer padding').toBeGreaterThanOrEqual(
      shot.footer.left + shot.padding - 0.5,
    );
    expect(shot.switch.right, 'the switch runs into the footer padding').toBeLessThanOrEqual(
      shot.footer.right - shot.padding + 0.5,
    );
    expect(shot.switch.right, 'at 400px the switch hangs past the window').toBeLessThanOrEqual(
      shot.documentWidth,
    );
    expect(shot.switch.bottom - shot.switch.top, 'the switch is not drawn').toBeGreaterThan(0);
  });
});
