/**
 * The nesting in the settings, measured where it is actually drawn: a parameter of a set is
 * offset from the switch it belongs to and carries the line binding it there. A rule that
 * matched nothing, or a line the browser never drew, only shows on the rendered page.
 *
 * The colour itself is covered by the palette sweep over every tab; what is checked here is
 * that the line exists at all and comes from the same token the row separators use.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';

const harness = harnessFixture();

interface Row {
  left: number;
  borderLeftColor: string;
  borderLeftWidth: number;
}

describe('/settings — a set and its parameters', () => {
  let nested: Row[] = [];
  let plainLeft = 0;
  let separator = '';

  beforeAll(async () => {
    const page = await harness().goto('/settings', '.page-settings');
    // the left edge of the label, not of the row: the offset is padding, so the row's own
    // box stays where it is and the line down its side lines up with the rows above
    nested = await page.$$eval('.setting-row--nested', (rows) =>
      rows.map((row) => {
        const style = getComputedStyle(row);
        return {
          left: row.querySelector('.setting-label')!.getBoundingClientRect().left,
          borderLeftColor: style.borderLeftColor,
          borderLeftWidth: Number.parseFloat(style.borderLeftWidth),
        };
      }),
    );
    plainLeft = await page.$eval(
      '.setting-row:not(.setting-row--nested) .setting-label',
      (label) => label.getBoundingClientRect().left,
    );
    /*
     * The colour the plain rows are separated by, read off a plain row that actually has a
     * separator — the first row of a group has none, and its border-top-color reads back as
     * currentColor. Nested rows are skipped on purpose: comparing the nesting line with a
     * nested row's own border would compare the rule with itself.
     */
    separator = await page.$$eval('.setting-row:not(.setting-row--nested)', (rows) => {
      for (const row of rows) {
        const style = getComputedStyle(row);
        if (Number.parseFloat(style.borderTopWidth) > 0) return style.borderTopColor;
      }
      throw new Error('no plain settings row carries a separator to compare the nesting line with');
    });
  });

  it('draws every parameter the switched-on sets have', () => {
    // the Iron Horse capacity parameter, the FIRS economy, and the six Base Costs
    // multipliers — two vehicle prices, three running classes, infrastructure upkeep
    expect(nested).toHaveLength(8);
  });

  it('offsets a parameter from the setting it hangs from', () => {
    for (const row of nested) expect(row.left).toBeGreaterThan(plainLeft);
  });

  it('binds it with a line, in the colour the rows are separated by', () => {
    for (const row of nested) {
      expect(row.borderLeftWidth).toBeGreaterThan(0);
      expect(row.borderLeftColor).toBe(separator);
    }
  });
});
