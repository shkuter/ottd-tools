import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';
import { snapshot } from './collect';
import { normaliseColour, tokenColour } from './colours';
import { WINDOW_COLOURS, named } from '../../skin';
import { byData, textWithin } from './query';
import { openDropdown, openKit, showGroup } from './kit';

/**
 * In the game the chosen row of a dropdown is a black plate across the whole
 * row with white lettering (dropdown.cpp:287, dropdown_type.h:49) — that is what
 * tells it apart from the row under the cursor, which is merely lit. Before the
 * skin change the two were indistinguishable, and the rule that fixed it was
 * first written against a selector that matched nothing at all.
 *
 * "Across the whole row" is measured, not assumed: a plate with padding above
 * and below it leaves the window colour showing through and stops looking like
 * the game's.
 */

const harness = harnessFixture();

describe('the chosen option', () => {
  it.each(WINDOW_COLOURS)('is a full-height black plate in the %s window', async (group) => {
    const page = await openKit(harness());
    await showGroup(page, group);
    await openDropdown(page);
    const shot = await page.evaluate(snapshot);

    const options = byData(shot, 'combobox-option');
    const chosen = options.filter((option) => 'checked' in option.data);
    const rest = options.filter((option) => !('checked' in option.data));
    expect(chosen, 'the open dropdown shows no chosen option').not.toHaveLength(0);
    expect(rest, 'the open dropdown shows only chosen options').not.toHaveLength(0);

    const plate = chosen[0];
    const background = normaliseColour(plate.colours['background-color'] ?? '');
    // PC_BLACK, the colour the game fills the selected row with
    expect(background?.hex, `the chosen option is filled ${plate.colours['background-color']}`).toBe(
      tokenColour(named.pcBlack)?.hex,
    );

    const lettering = textWithin(shot, 'mantine-Select-option[checked]')[0];
    expect(lettering, 'the chosen option shows no lettering').toBeDefined();
    expect(normaliseColour(lettering.colours.color ?? '')?.hex).toBe(
      tokenColour(named.pcWhite)?.hex,
    );

    // the plate covers the row: same height as a plain row, and nothing above or below it
    expect(plate.height).toBe(rest[0].height);
    expect([plate.paddingTop, plate.paddingBottom]).toEqual(['0px', '0px']);
  });
});
