import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';
import { ROUTES } from './routes';

/**
 * Two things every tab does the same way, and used not to.
 *
 * The page is titled in one place: a panel that titled itself with the page's
 * own heading put the tab's name eight pixels lower than its neighbours and
 * indented it by the panel's padding.
 *
 * A tab with nothing to show says so in the frame its list would stand in.
 * Blank space under the filters reads as a calculation that failed rather than
 * as one that was never asked for, which is why the message goes where the
 * answer would have gone.
 */

const harness = harnessFixture();

function titlePlace() {
  const title = document.querySelector('main h2');
  if (!title) return null;
  const box = title.getBoundingClientRect();
  const main = document.querySelector('main')!.getBoundingClientRect();
  return { top: Math.round(box.top - main.top), left: Math.round(box.left - main.left) };
}

/** Anything of a panel's content standing past its own right edge. */
function spillingOutOfPanels() {
  const out: string[] = [];
  for (const panel of document.querySelectorAll('main .route-controls, main .consist-side, main .firs-side')) {
    const edge = panel.getBoundingClientRect().right;
    for (const part of panel.querySelectorAll('*')) {
      const box = part.getBoundingClientRect();
      if (box.width === 0) continue;
      if (box.right > edge + 0.5) {
        const name = [...part.classList].find((c) => !c.startsWith('m_')) ?? part.tagName;
        out.push(`${name} stands ${Math.round(box.right - edge)}px past the panel`);
      }
    }
  }
  return [...new Set(out)];
}

describe('a tab', () => {
  it('titles itself in the same place as every other one', async () => {
    const places = new Map<string, unknown>();
    for (const route of ROUTES) {
      const page = await harness().goto(route.path, route.ready);
      places.set(route.path, await page.evaluate(titlePlace));
    }

    const missing = [...places].filter(([, place]) => place === null).map(([path]) => path);
    expect(missing, 'every tab is titled').toEqual([]);

    const distinct = [...new Set([...places.values()].map((place) => JSON.stringify(place)))];
    expect(distinct, `titles stand at ${distinct.join(' and ')}`).toHaveLength(1);
  });

  it.each(ROUTES)('says what it has nothing to show on $path', async ({ path, ready }) => {
    const page = await harness().goto(path, ready);

    const findings = await page.evaluate(() => {
      const out: string[] = [];
      for (const frame of document.querySelectorAll<HTMLElement>('main .table-wrap')) {
        const message = frame.querySelector('.table-empty');
        const rows = frame.querySelectorAll('tbody tr').length;
        // whichever it holds, it holds one of the two: rows, or a line saying why not
        if (rows === 0 && !message?.textContent?.trim()) {
          out.push('a frame stands empty and says nothing');
        }
        if (!message) continue;
        // and the message is inside the frame, drawn on its plate rather than
        // floating on the page above it
        const inside = message.getBoundingClientRect();
        const around = frame.getBoundingClientRect();
        if (inside.top < around.top || inside.bottom > around.bottom) {
          out.push(`"${message.textContent?.trim().slice(0, 24)}" is not on the frame`);
        }
        if (getComputedStyle(frame).borderTopWidth === '0px') {
          out.push('the frame around the message has no edge of its own');
        }
      }
      return out;
    });

    expect(findings, 'an empty state stands in the frame a list would').toEqual([]);
  });
  it.each(ROUTES)('keeps its panels around their content on $path', async ({ path, ready }) => {
    const page = await harness().goto(path, ready);
    expect(await page.evaluate(spillingOutOfPanels), 'a panel holds what it contains').toEqual([]);
  });

  it('holds them in Russian too, where the same words are longer', async () => {
    const page = await harness().goto('/income', '.page-route');
    await page.evaluate(() => {
      localStorage.setItem('ottd-tools-locale', JSON.stringify({ state: { locale: 'ru' }, version: 0 }));
    });
    await page.reload();
    await page.waitForSelector('.page-route');

    expect(await page.evaluate(spillingOutOfPanels), 'a panel holds what it contains').toEqual([]);
  });
});
