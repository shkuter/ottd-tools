import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';
import { snapshot } from './collect';
import { ROUTES } from './routes';
import { byClass } from './query';

/**
 * The geometry of a control, which the skin sets and the component library keeps
 * trying to set as well.
 *
 * One height: the game sizes every control the same way, a line of text with the
 * frame above and below it, while the library sizes each kind off a scale of its
 * own. A row of controls then reads as stepped no matter how the labels line up.
 *
 * Nothing sticking out: the parts inside a control — the stepper of a number
 * field, the thumb of a switch — are sized by the library, and a part left on
 * its own scale hangs over the plate it sits on. Checked by measuring rather
 * than by naming the parts, because the ones worth catching are the ones nobody
 * thought to name.
 *
 * And one arrow: the same drawing at the same size on a dropdown, on a stepper
 * and as the mark on a sorted column. Matching their boxes was not enough —
 * the library draws a double chevron in one place and a single one in another.
 */

const harness = harnessFixture();

/** Controls whose height is the game's, all of them the same. */
const CONTROLS = [
  'mantine-Input-input',
  'mantine-Button-root',
  'mantine-ActionIcon-root',
  'mantine-SegmentedControl-root',
  'mantine-Pagination-control',
];

describe.each(ROUTES)('$path', (route) => {
  it('gives every control the height of the game', async () => {
    const { path, ready } = route;
    const page = await harness().goto(path, ready);
    const shot = await page.evaluate(snapshot);

    const heights = new Map<string, number[]>();
    for (const name of CONTROLS) {
      for (const el of byClass(shot, name)) {
        // a control the page has hidden has no height to compare
        if (el.height === 0) continue;
        heights.set(name, [...(heights.get(name) ?? []), Math.round(el.height)]);
      }
    }

    const seen = [...new Set([...heights.values()].flat())];
    expect(seen.length, `controls stand at ${seen.join(', ')}px`).toBeLessThanOrEqual(1);
  });

  it('keeps the parts of a control inside it', async () => {
    const { path, ready } = route;
    const page = await harness().goto(path, ready);

    const spilling = await page.evaluate(() => {
      const OUTSIDE = ['mantine-Popover-dropdown', 'mantine-Tooltip-tooltip'];
      const out: string[] = [];
      for (const control of document.querySelectorAll<HTMLElement>(
        '.mantine-Input-wrapper, .mantine-Button-root, .mantine-ActionIcon-root, .mantine-SegmentedControl-root, .mantine-Switch-track',
      )) {
        const box = control.getBoundingClientRect();
        if (box.height === 0) continue;
        for (const part of control.querySelectorAll<HTMLElement>('*')) {
          // a dropdown or a tooltip is drawn over the page on purpose
          if (OUTSIDE.some((name) => part.classList.contains(name))) continue;
          const inner = part.getBoundingClientRect();
          if (inner.height === 0) continue;
          const over = Math.max(box.top - inner.top, inner.bottom - box.bottom);
          if (over > 0.5) {
            const name = [...part.classList].find((c) => c.startsWith('mantine-')) ?? part.tagName;
            out.push(`${name} stands ${Math.round(over)}px past its control`);
          }
        }
      }
      return [...new Set(out)];
    });

    expect(spilling, 'a part sized by the library, not by the skin').toEqual([]);
  });

  it('centres what a control holds', async () => {
    const { path, ready } = route;
    const page = await harness().goto(path, ready);

    const askew = await page.evaluate(() => {
      const out: string[] = [];
      for (const button of document.querySelectorAll<HTMLElement>(
        '.mantine-ActionIcon-root, .mantine-NumberInput-control',
      )) {
        const mark = button.querySelector<HTMLElement>('svg, img');
        if (!mark) continue;
        const box = button.getBoundingClientRect();
        const inner = mark.getBoundingClientRect();
        if (box.height === 0 || inner.height === 0) continue;
        const vertical = box.top + box.bottom - inner.top - inner.bottom;
        const horizontal = box.left + box.right - inner.left - inner.right;
        // half a pixel of drift is the browser rounding, a whole one is a rule
        if (Math.abs(vertical) > 1 || Math.abs(horizontal) > 1) {
          const name = [...button.classList].find((c) => c.startsWith('mantine-')) ?? button.tagName;
          out.push(
            `${name}: off by ${Math.round(vertical / 2)}px down, ${Math.round(horizontal / 2)}px across`,
          );
        }
      }
      return [...new Set(out)];
    });

    expect(askew, 'the mark on a button sits off its middle').toEqual([]);
  });

  it('draws one arrow at one size', async () => {
    const { path, ready } = route;
    const page = await harness().goto(path, ready);

    const arrows = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          '.mantine-ComboboxChevron-chevron, .mantine-NumberInput-control svg, .sort-mark',
        ),
      ]
        .filter((el) => el.getBoundingClientRect().height > 0)
        .map((el) => {
          const style = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          return {
            shape: style.maskImage,
            size: `${Math.round(box.width)}x${Math.round(box.height)}`,
          };
        }),
    );

    // nothing to compare on a tab without arrows
    if (arrows.length === 0) return;

    expect(
      [...new Set(arrows.map((a) => a.shape))],
      'every arrow is drawn from the same shape',
    ).toHaveLength(1);
    expect(
      [...new Set(arrows.map((a) => a.size))],
      'and at the same size',
    ).toHaveLength(1);
  });
});

describe('the moving part of a switch', () => {
  it('is centred in its track', async () => {
    /* Being inside the track is not enough: the thumb sat flush against the top
       edge with the whole 4px gap under it, because a max-height from one rule
       met a `top` from another and left `bottom` with nothing to do. Off-centre
       reads as broken even though nothing hangs over anything. */
    const page = await harness().goto('/optimizer', '.page-optimizer');

    const gaps = await page.evaluate(() => {
      const track = document.querySelector('.mantine-Switch-track');
      const thumb = document.querySelector('.mantine-Switch-thumb');
      if (!track || !thumb) return { error: 'no switch on the page' as const };
      const around = track.getBoundingClientRect();
      const inside = thumb.getBoundingClientRect();
      return {
        above: inside.top - around.top,
        below: around.bottom - inside.bottom,
        track: Math.round(around.height),
        thumb: Math.round(inside.height),
      };
    });

    expect(gaps.error, 'the tab shows a switch').toBeUndefined();
    if ('error' in gaps) return;
    expect(
      Math.abs(gaps.above - gaps.below),
      `the thumb stands ${gaps.above}px from the top and ${gaps.below}px from the bottom`,
    ).toBeLessThanOrEqual(1);
    // and it is the whole of the track, not a smaller button centred in it: a
    // library height cap once left it two thirds as tall, which reads as a
    // switch of a different kind rather than as a mistake
    expect(
      gaps.track - gaps.thumb,
      `the thumb is ${gaps.thumb}px tall in a ${gaps.track}px track`,
    ).toBeLessThanOrEqual(1);
  });
});
