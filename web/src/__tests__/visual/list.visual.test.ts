import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';
import { ROUTES } from './routes';
import { snapshot } from './collect';
import { WINDOW_COLOURS } from '../../skin';
import { fromToken, painted } from './colours';
import { openKit, showcase, showGroup } from './kit';

/**
 * What a list does with its columns, checked where it shows: on the page.
 *
 * A column of figures is read down the column, which only works when the digits
 * line up — so every numeric column is aligned right, not just the money ones.
 * The action on a row ends the row, so its button stands at the edge of the list
 * rather than adrift in the middle of a column wider than itself. And a name
 * beside a sprite starts where every other name in that column starts, however
 * long the sprite happens to be.
 */

const harness = harnessFixture();

/** Columns whose alignment disagrees with what they hold, and actions off the edge. */
function misaligned() {
  const out: string[] = [];
  for (const table of document.querySelectorAll('main table')) {
    // a header may span several columns (the sprite and the name of a vehicle are
    // one heading over two cells), so cells are found by position
    let column = 0;
    for (const head of table.querySelectorAll<HTMLTableCellElement>('thead th')) {
      const cell = table.querySelector(`tbody tr td:nth-child(${column + 1})`);
      column += head.colSpan || 1;
      if (!cell) continue;

      const marked =
        head.classList.contains('cell-num') || head.classList.contains('cell-money');
      // what the cell actually holds, so a column of figures nobody marked is
      // caught as well: taking the answer from the class alone would let it pass
      const text = cell.textContent?.trim() ?? '';
      const holdsFigures = text !== '' && /^[\d\s.,%×/+-]+$/.test(text) && /\d/.test(text);
      const numeric = marked || holdsFigures;
      const right = getComputedStyle(cell).textAlign === 'right';
      const name = head.textContent?.trim() ?? '';
      if (numeric && !right) {
        out.push(`column "${name}" holds figures but reads left`);
      }
      // the column holding the action is aligned right without being numeric
      if (!numeric && right && !cell.querySelector('.btn-add')) {
        out.push(`column "${name}" is not numeric but reads right`);
      }
    }

    for (const button of table.querySelectorAll('tbody .btn-add')) {
      const cell = button.closest('td');
      if (!cell) continue;
      const gap = Math.round(
        cell.getBoundingClientRect().right - button.getBoundingClientRect().right,
      );
      const padding = Math.round(parseFloat(getComputedStyle(cell).paddingRight));
      if (Math.abs(gap - padding) > 1) {
        out.push(`the row action sits ${gap}px from the edge, padding is ${padding}px`);
      }
    }
  }
  return [...new Set(out)];
}

/** Where the name in each vehicle cell begins, one entry per distinct position. */
function nameStarts() {
  const lefts = new Set<number>();
  for (const cell of document.querySelectorAll('main .cell-vehicle')) {
    const text = [...cell.childNodes].find(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
    );
    if (!text) continue;
    const range = document.createRange();
    range.selectNodeContents(text);
    lefts.add(Math.round(range.getBoundingClientRect().left));
  }
  return [...lefts];
}

describe.each(ROUTES)('$path', (route) => {
  it('aligns its figures and its actions', async () => {
    const page = await harness().goto(route.path, route.ready);
    const findings = await page.evaluate(misaligned);

    expect(findings, 'figures right, text left, the action at the edge').toEqual([]);
  });

  it('aligns them on every list it keeps behind a tab', async () => {
    /* The game tab holds four lists behind tabs of its own and mounts only the
       open one, so a sweep of the page as it loads sees one list in four. Three
       columns of figures sat unaligned behind those tabs for exactly that
       reason. */
    const page = await harness().goto(route.path, route.ready);
    const tabs = await page.locator('main [role="tab"]').all();

    for (const tab of tabs) {
      await tab.click();
      await page.waitForTimeout(100);
      const name = (await tab.textContent())?.trim();
      const findings = await page.evaluate(misaligned);
      expect(findings, `on the "${name}" list: figures right, text left`).toEqual([]);
    }
  });

  it('starts every name at one place', async () => {
    const page = await harness().goto(route.path, route.ready);
    const starts = await page.evaluate(nameStarts);

    // at most one starting position, however wide the sprites beside the names are
    expect(starts.length, `names start at ${starts.join(', ')}`).toBeLessThanOrEqual(1);
  });
});

/**
 * The same two measures on the specimen of a list, plus the state a tab shows instead of a
 * list: a page that filtered everything away says so, in the dimmed lettering of the skin.
 */
describe('/kit', () => {
  it('aligns its figures and starts every name at one place', async () => {
    const page = await openKit(harness());

    expect(await page.evaluate(misaligned), 'on the list specimen: figures right, text left')
      .toEqual([]);
    const starts = await page.evaluate(nameStarts);
    expect(starts.length, `names start at ${starts.join(', ')}`).toBeLessThanOrEqual(1);
  });

  it.each(WINDOW_COLOURS)('says why a list is empty, in the %s window', async (group) => {
    const page = await openKit(harness());
    // the tier of one follows the picker, so the empty frame is read in each colour in turn
    await showGroup(page, group);
    const shot = await page.evaluate(snapshot);
    const empty = await showcase.emptyList(page).evaluate((frame) => {
      const message = frame.querySelector('.table-empty');
      return {
        message: message?.textContent?.trim() ?? '',
        colour: message ? getComputedStyle(message).color : '',
        tables: frame.querySelectorAll('table').length,
      };
    });

    expect(empty.tables, 'an empty frame draws no table').toBe(0);
    expect(empty.message.length, 'and says why instead').toBeGreaterThan(0);
    expect(painted(empty.colour, 'the empty-list message'), 'in the dimmed lettering').toBe(
      fromToken(shot.themes[group], '--skin-muted'),
    );
  });
});
