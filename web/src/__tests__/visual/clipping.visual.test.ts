import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';
import { ROUTES } from './routes';

/**
 * Text cut off by the box it is drawn in.
 *
 * Every other check here measures boxes — heights, widths off the scale, things
 * standing past an edge — and a box of exactly the right size can still hold a
 * word too long for it. That is what happened to the goal switch: held to a step
 * of the width scale, it clipped "Снабжение" in Russian and left a gap inside
 * itself in English, and not one check noticed either.
 *
 * So this asks the browser the one question the others do not: is anything
 * scrolling inside its own box? It runs in both languages, because a label that
 * fits in English is the same label two words longer in Russian.
 */

const harness = harnessFixture();

/**
 * Everything whose content does not fit the box drawn around it — both a word
 * too long for its own box and a box hiding what stands inside it. The goal
 * switch was the second kind: each of its options was drawn at full width and
 * the switch around them, held to a step of the scale, cut the last one off.
 */
function clipped() {
  const out: string[] = [];
  const name = (element: Element) =>
    [...element.classList].find((c) => !c.startsWith('m_')) ?? element.tagName;

  for (const element of document.querySelectorAll<HTMLElement>('main *, header *, footer *')) {
    const text = element.textContent?.trim();
    if (!text) continue;
    const style = getComputedStyle(element);
    // a box that scrolls is meant to hold more than it shows; so is one told to
    // shorten its text with an ellipsis
    if (/auto|scroll/.test(style.overflowX) || style.textOverflow === 'ellipsis') continue;
    // the graph canvas cuts what is panned out of view, on purpose
    if (element.closest('[class*="scroll"], .table-wrap, .graph-canvas')) continue;
    // a box that hides nothing lets its content stand past it, and the check
    // above catches that where it matters; here the question is what is cut
    const hides = style.overflowX === 'hidden' || style.overflowX === 'clip';
    if (element.children.length > 0 && !hides) continue;
    if (element.scrollWidth > element.clientWidth + 1) {
      out.push(
        `${name(element)} "${text.slice(0, 20)}" needs ${element.scrollWidth}px of ${element.clientWidth}`,
      );
    }
  }
  return [...new Set(out)];
}

describe.each(ROUTES)('$path', (route) => {
  it('cuts nothing off in English', async () => {
    const page = await harness().goto(route.path, route.ready);

    expect(await page.evaluate(clipped), 'every word fits the box drawn around it').toEqual([]);
  });

  it('cuts nothing off in Russian, where the same words are longer', async () => {
    const page = await harness().goto(route.path, route.ready);
    await page.evaluate(() => {
      localStorage.setItem(
        'ottd-tools-locale',
        JSON.stringify({ state: { locale: 'ru' }, version: 0 }),
      );
    });
    await page.reload();
    await page.waitForSelector(route.ready);

    expect(await page.evaluate(clipped), 'every word fits the box drawn around it').toEqual([]);
  });
});

/**
 * A field's value with its unit, which the sweep above cannot see: an input keeps its value in
 * an attribute rather than in text. The network blocks size their fields off the width scale,
 * so the longest counts a real game gives are typed in and each input is asked whether its
 * value scrolls inside it — in both languages, since the unit is longer in Russian.
 */
describe('/network, the fields with their values', () => {
  it.each(['en', 'ru'])('shows every value whole in %s', async (locale) => {
    const page = await harness().goto('/network', '.page-network');
    await page.evaluate((chosen) => {
      localStorage.setItem('ottd-tools-locale', JSON.stringify({ state: { locale: chosen }, version: 0 }));
    }, locale);
    await page.reload();
    await page.waitForSelector('.page-network');

    const fields = page.locator('.network-inputs .mantine-NumberInput-input');
    const count = await fields.count();
    expect(count, 'the network blocks have number fields').toBeGreaterThan(0);
    for (let i = 0; i < count; i++) await fields.nth(i).fill('10372');

    const cut = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLInputElement>('.network-inputs .mantine-NumberInput-input')]
        .filter((input) => input.scrollWidth > input.clientWidth + 1)
        .map((input) => `"${input.value}" needs ${input.scrollWidth}px of ${input.clientWidth}`),
    );
    try {
      expect(cut, 'every value fits its field').toEqual([]);
    } finally {
      await page.evaluate(() => {
        localStorage.removeItem('ottd-tools-route');
        localStorage.removeItem('ottd-tools-locale');
      });
    }
  });
});
