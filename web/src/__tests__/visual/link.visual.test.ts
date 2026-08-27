import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';
import { ROUTES } from './routes';

/**
 * Three kinds of clickable text, told apart by their underline.
 *
 * The palette gives coloured text a low contrast against the window — that is
 * the game's own look and it stays — so colour alone leaves a link looking like
 * the words beside it. A link that leads to an address is underlined solid; a
 * button that reads as a link but leads nowhere is underlined dashed, the older
 * convention for exactly that; a button that reads as a button is not underlined
 * at all, or "show 15 more" ends up looking like somewhere to go.
 */

const harness = harnessFixture();

function underlines() {
  const out: string[] = [];
  const style = (element: Element) => {
    const computed = getComputedStyle(element);
    return computed.textDecorationLine === 'underline' ? computed.textDecorationStyle : 'none';
  };
  const name = (element: Element) => element.textContent?.trim().slice(0, 20) ?? '';

  for (const link of document.querySelectorAll('main a, footer a')) {
    if (style(link) !== 'solid') out.push(`link "${name(link)}" is ${style(link)}`);
  }
  for (const pseudo of document.querySelectorAll('.btn-link')) {
    if (style(pseudo) !== 'dashed') out.push(`pseudo-link "${name(pseudo)}" is ${style(pseudo)}`);
  }
  for (const button of document.querySelectorAll('main .mantine-Button-root')) {
    if (button.classList.contains('btn-link')) continue;
    if (style(button) !== 'none') out.push(`button "${name(button)}" is underlined`);
  }
  return [...new Set(out)];
}

describe.each(ROUTES)('$path', (route) => {
  it('underlines clickable text by what it is', async () => {
    const page = await harness().goto(route.path, route.ready);
    const findings = await page.evaluate(underlines);

    expect(findings, 'a link leads somewhere, a button does not').toEqual([]);
  });
});
