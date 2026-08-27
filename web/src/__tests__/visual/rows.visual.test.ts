import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';
import { ROUTES } from './routes';
import en from '../../i18n/en.json';

/**
 * The row of controls a tab is filtered by, and the two things that made it read
 * as stepped: labels sitting on different lines, and fields sized by whatever
 * they happen to hold.
 *
 * Measured on the rendered page rather than asserted in the stylesheet, because
 * neither is a property of any one rule — a row goes ragged when a control built
 * differently from its neighbours joins it, and that is only visible once they
 * are laid out together.
 */

const harness = harnessFixture();

/** Tabs that filter their content with a row of controls. */
const WITH_ROWS = ['/optimizer', '/consist', '/supply', '/game'];

/** A row reads line by line: one that wraps is several, each level in itself. */
function readRow() {
  const rows = [...document.querySelectorAll('main .filters')];
  if (rows.length === 0) return null;

  const cells = rows.flatMap((row) =>
    [...row.children].filter((cell) => cell.getBoundingClientRect().width > 0),
  );
  const lines = new Map<number, Element[]>();
  for (const cell of cells) {
    const top = cell.getBoundingClientRect().top;
    const key = [...lines.keys()].find((line) => Math.abs(line - top) < 20) ?? top;
    lines.set(key, [...(lines.get(key) ?? []), cell]);
  }

  const middle = (element: Element) => {
    const box = element.getBoundingClientRect();
    return Math.round(box.top + box.height / 2);
  };

  return [...lines.values()].map((line) => ({
    labels: line
      .map((cell) => cell.querySelector('.mantine-InputWrapper-label'))
      .filter((label): label is Element => label !== null)
      .map((label) => Math.round(label.getBoundingClientRect().top)),
    controls: line
      .map((cell) =>
        cell.querySelector('input, .mantine-SegmentedControl-root, .mantine-Switch-track'),
      )
      .filter((control): control is Element => control !== null)
      .map(middle),
  }));
}

/** Field widths standing on no step of the scale, with the scale for the message. */
function offTheScale() {
  const rows = [...document.querySelectorAll('main .filters')];
  if (rows.length === 0) return null;

  // the steps are stated in characters, so the browser resolves them rather than
  // the check: a ch is whatever the interface font makes it
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  document.body.append(probe);
  const scale = ['--skin-field-narrow', '--skin-field-normal', '--skin-field-wide'].map((name) => {
    probe.style.width = `var(${name})`;
    return Math.round(probe.getBoundingClientRect().width);
  });
  probe.remove();

  // both shapes a field comes in: an input of the library, wrapped, and one built
  // by Field, which is the wrapper itself
  const off: string[] = [];
  const fields = rows.flatMap((row) => [
    ...row.querySelectorAll('.mantine-Input-wrapper, .field-cell'),
  ]);
  for (const field of fields) {
    const width = Math.round(field.getBoundingClientRect().width);
    if (width === 0 || scale.some((step) => Math.abs(step - width) <= 1)) continue;
    const label = field
      .closest('.mantine-InputWrapper-root')
      ?.querySelector('.mantine-InputWrapper-label');
    off.push(`${label?.textContent ?? '?'}: ${width}px`);
  }
  return { scale, off, fields: fields.length };
}

describe('the optimizer row', () => {
  it('does not shift when the hint about the goal comes and goes', async () => {
    // The hint used to stand inside the row, so showing it pushed the controls
    // beside it sideways and the whole row down a line. Out on a line of its
    // own it is free to appear and disappear without moving anything.
    const page = await harness().goto('/optimizer', '.page-optimizer');

    const places = async () =>
      await page.evaluate(() => {
        const row = document.querySelector('main .filters');
        if (!row) return { error: 'no filter row' as const };
        const top = row.getBoundingClientRect().top;
        return {
          hint: document.querySelector('.goal-hint') !== null,
          cells: [...row.children].map((cell) => {
            const box = cell.getBoundingClientRect();
            return `${Math.round(box.left)}x${Math.round(box.top - top)}`;
          }),
        };
      });

    // the hint stands under the row while the output is unknown, and goes once it is
    // given. The field is found by its own label, read off the dictionary rather than
    // spelled out here: renaming the string fails the check instead of quietly leaving
    // it to measure some other field
    const output = page.getByLabel(en['opt.production'], { exact: true });
    await output.fill('0');
    await output.blur();
    await page.waitForSelector('.goal-hint');
    const shown = await places();

    await output.fill('500');
    await output.blur();
    await page.waitForSelector('.goal-hint', { state: 'detached' });
    const hidden = await places();

    expect(shown.error ?? hidden.error, 'the tab shows a filter row').toBeUndefined();
    if ('error' in shown || 'error' in hidden) return;
    expect(shown.hint, 'the hint is shown while the output is unknown').toBe(true);
    expect(hidden.hint, 'and gone once it is given').toBe(false);
    expect(hidden.cells, 'the fields of the row stand where they stood').toEqual(shown.cells);
  });
});

describe.each(ROUTES)('$path', (route) => {
  it('stands on one line', async () => {
    const page = await harness().goto(route.path, route.ready);
    const lines = await page.evaluate(readRow);

    // a tab without a row has nothing to line up, but which tabs those are is
    // stated here rather than inferred: a renamed class would otherwise leave
    // every one of these checks green with nothing to check
    if (lines === null) {
      expect(WITH_ROWS, `${route.path} shows no filter row`).not.toContain(route.path);
      return;
    }
    expect(WITH_ROWS, `${route.path} shows a row but is not listed as a tab that does`).toContain(
      route.path,
    );

    for (const line of lines) {
      expect([...new Set(line.labels)], 'the labels of one line sit on one line').toHaveLength(
        line.labels.length === 0 ? 0 : 1,
      );
      expect(
        [...new Set(line.controls)],
        'and the controls are centred on one line, whatever their heights',
      ).toHaveLength(line.controls.length === 0 ? 0 : 1);
    }
  });

  it('sizes its fields off the scale', async () => {
    const page = await harness().goto(route.path, route.ready);
    const widths = await page.evaluate(offTheScale);

    if (widths === null) return;
    expect(widths.off, `the scale is ${widths.scale.join('/')}px`).toEqual([]);
    expect(widths.fields, `${route.path} has a row, so it has fields`).toBeGreaterThan(0);
  });
});
