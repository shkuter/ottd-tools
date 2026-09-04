import { afterEach, describe, expect, it } from 'vitest';
import { harnessFixture, VIEWPORT } from './harness';
import trains from '../../data/trains.json';
import { ROUTE_KEY } from '../../state/routeStore';
import { snapshot } from './collect';
import { normaliseColour, tokenColour } from './colours';
import { WINDOW_COLOURS, named } from '../../skin';
import { byData, textWithin } from './query';
import {
  closeDropdown,
  dropdownMetrics,
  openDropdown,
  openDropdownIn,
  openKit,
  openField,
  openList,
  openOptions,
  optionLabels,
  showGroup,
  specimenInput,
} from './kit';

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

/*
 * The harness keeps one page for the whole file, so a check that resized the window would
 * hand the next one a different page — including after a failed assertion, which is exactly
 * when the next failure would be misread.
 */
afterEach(async () => {
  const page = harness().page;
  await page.setViewportSize(VIEWPORT);
  // the corridor check picks a track and an engine, and those live in a persisted store
  await page.evaluate((key) => localStorage.removeItem(key), ROUTE_KEY);
});

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

/**
 * A dropdown of the game is as wide as its longest item, raised to the width of the
 * button when the items are shorter (dropdown.cpp, UpdateSizeAndPosition and
 * GetDropDownListDimension). Mantine's own default is the opposite — the width of the
 * field, with the item wrapped onto as many lines as it takes — and a name of an industry
 * runs to forty characters in Russian.
 *
 * The width is written by a middleware rather than by a rule, so what is checked here is
 * the geometry on screen: no stylesheet holds the number to compare against.
 */
describe('the width of an open dropdown', () => {
  it('grows past the field for an option that does not fit it', async () => {
    const page = await openKit(harness());
    await openDropdownIn(page, 'kit-dropdown-long');
    const box = await dropdownMetrics(page, specimenInput(page, 'kit-dropdown-long'));

    expect(box.dropdownWidth).toBeGreaterThan(box.fieldWidth);
    // one line per option: a wrapped one would be taller than its neighbour
    const [longOption, shortOption] = box.options.map((option) => option.height);
    expect(longOption).toBe(shortOption);
  });

  it('starts at the left edge of its field, as the game starts at its button', async () => {
    const page = await openKit(harness());
    // a window in which the specimen has room to its right: with none, the list is pushed
    // off the edge instead, which is the narrow-window case below. The page is shared by
    // every check in this file, so the size goes back before the next one runs.
    await page.setViewportSize({ width: 1200, height: 900 });
    await openDropdownIn(page, 'kit-dropdown-long');
    const box = await dropdownMetrics(page, specimenInput(page, 'kit-dropdown-long'));

    expect(box.fieldLeft + box.dropdownWidth).toBeLessThan(box.viewportWidth);
    // the list grew past the field, and it grew to the right — a centred list would have
    // moved its left edge off the field's
    expect(box.dropdownWidth).toBeGreaterThan(box.fieldWidth);
    expect(Math.abs(box.dropdownLeft - box.fieldLeft)).toBeLessThanOrEqual(1);
  });

  it('stays at the width of the field when every option is shorter', async () => {
    const page = await openKit(harness());
    await openDropdownIn(page, 'kit-dropdown-short');
    const box = await dropdownMetrics(page, specimenInput(page, 'kit-dropdown-short'));

    // the game raises the list to the width of the button; rounding is the browser's
    expect(box.dropdownWidth).toBeGreaterThanOrEqual(box.fieldWidth - 1);
    expect(box.dropdownWidth).toBeLessThanOrEqual(box.fieldWidth + 1);
  });

  it('does not shrink below the field while a search narrows the list', async () => {
    const page = await openKit(harness());
    await openDropdownIn(page, 'kit-dropdown-long');
    // the search text comes from the list itself: which words are in it depends on the
    // interface language, and the check is about the width, not about the wording
    const labels = await optionLabels(page);
    const shortest = labels.reduce((a, b) => (a.length <= b.length ? a : b));
    // typing leaves only the short option, so max-content alone would collapse the list
    await specimenInput(page, 'kit-dropdown-long').fill(shortest.slice(0, 4));
    // the second option of the open list goes away when the search has narrowed it
    await openOptions(page).nth(1).waitFor({ state: 'detached' });
    const box = await dropdownMetrics(page, specimenInput(page, 'kit-dropdown-long'));

    expect(box.dropdownWidth).toBeGreaterThanOrEqual(box.fieldWidth - 1);
  });

  it('wraps the option instead of leaving the window when the window is narrow', async () => {
    const page = await openKit(harness());
    const wide = await openDropdownIn(page, 'kit-dropdown-long').then(() =>
      dropdownMetrics(page, specimenInput(page, 'kit-dropdown-long')),
    );
    await closeDropdown(page);

    // narrower than the long option, which is about 340px of text
    await page.setViewportSize({ width: 280, height: 900 });
    await openDropdownIn(page, 'kit-dropdown-long');
    const narrow = await dropdownMetrics(page, specimenInput(page, 'kit-dropdown-long'));

    expect(narrow.dropdownRight).toBeLessThanOrEqual(narrow.viewportWidth);
    // the long option is on more than one line now, and nothing of it is cut off
    const [longWide] = wide.options;
    const [longNarrow] = narrow.options;
    expect(longNarrow.height).toBeGreaterThan(longWide.height);
    const clipped = await openList(page).evaluate((list) =>
      [...list.querySelectorAll('[data-combobox-option]')].some(
        (option) => option.scrollWidth > option.clientWidth + 1,
      ),
    );
    expect(clipped, 'an option is wider than the box it is drawn in').toBe(false);
  });
});

/**
 * A dropdown option carrying a picture is the game's own icon item
 * (dropdown_common_type.h, DropDownListIconItem). The cell holding the picture is what
 * keeps the names lined up, the way the sprite column of a list does.
 */
describe('an option with a picture', () => {
  it('lines every name up and stays as tall as an option without one', async () => {
    const page = await openKit(harness());
    await openDropdownIn(page, 'kit-dropdown-short');
    const plain = await dropdownMetrics(page, specimenInput(page, 'kit-dropdown-short'));
    await closeDropdown(page);

    await openDropdownIn(page, 'kit-dropdown-picture');
    const withPicture = await dropdownMetrics(page, specimenInput(page, 'kit-dropdown-picture'));

    expect(withPicture.options).not.toHaveLength(0);
    expect(withPicture.options.every((option) => option.hasPicture)).toBe(true);

    const lefts = withPicture.options.map((option) => option.nameLeft);
    expect(lefts.every((left) => left !== null)).toBe(true);
    expect(new Set(lefts.map((left) => Math.round(left!)))).toHaveLength(1);

    expect(withPicture.options[0].height).toBe(plain.options[0].height);
  });
});

/**
 * The cargo lists are the ones the player uses most, and the icon in them is the game's own
 * (build_vehicle_gui.cpp fills its cargo filter with icon items). Checked on the tab rather
 * than on a specimen: the icon comes from the dataset, and what is asserted is that the list
 * shows the same one the field does.
 */
describe('a cargo list', () => {
  it('shows the icon of every cargo, the one its field shows', async () => {
    const page = await harness().goto('/optimizer', '.page-optimizer');
    const field = page.locator('.filters .mantine-Select-input').first();
    const chosen = await field.evaluate(
      (input) => input.parentElement?.querySelector<HTMLImageElement>('.cargo-icon')?.src ?? '',
    );
    await openField(page, field);

    const box = await dropdownMetrics(page, field);
    expect(box.options).not.toHaveLength(0);
    expect(box.options.every((option) => option.hasPicture)).toBe(true);

    const icons = await openList(page).evaluate((list) =>
      [...list.querySelectorAll('[data-combobox-option]')].map((option) => ({
        src: option.querySelector('img')?.src ?? '',
        checked: 'checked' in (option as HTMLElement).dataset,
      })),
    );
    // each cargo brings its own icon rather than all of them sharing one
    expect(new Set(icons.map((icon) => icon.src)).size).toBeGreaterThan(1);
    // and the one the field wears is the one its own option wears
    expect(icons.find((icon) => icon.checked)?.src).toBe(chosen);
  });
});

/**
 * The field a vehicle is picked in shows the sprite of what is picked, which takes the width
 * of the sprite column away from the name — and the names of Iron Horse engines run to thirty
 * characters. The engine has to be picked first: with none chosen there is no left section,
 * and the field would be measured with room it does not have in use.
 */
describe('the field of the corridor replacement', () => {
  it('shows the sprite of the chosen engine and fits the longest name beside it', async () => {
    // the width has to hold the longest name the set has, not merely the longest the track
    // that happens to be picked here offers
    const longest = (trains.items as { kind: string; name: string }[])
      .filter((train) => train.kind === 'engine')
      .map((train) => train.name)
      .reduce((a, b) => (a.length >= b.length ? a : b));

    const page = await harness().goto('/network', '.page-network');
    // the candidates follow the target track, which is all this check needs of the corridor
    await openField(
      page,
      page.locator('.network-inputs .field:not(.field-engine) .mantine-Select-input'),
    );
    await openOptions(page).first().click();

    const engine = page.locator('.field-engine .mantine-Select-input');
    await openField(page, engine);
    const names = await optionLabels(page);
    expect(names, 'the replacement list offered nothing to pick').not.toHaveLength(0);
    const list = await dropdownMetrics(page, engine);
    await openOptions(page).first().click();

    const field = await engine.evaluate((input, name) => {
      const style = getComputedStyle(input);
      const context = document.createElement('canvas').getContext('2d')!;
      context.font = style.font;
      const sprite = input.parentElement?.querySelector('img');
      const section = input.parentElement?.querySelector('.mantine-Input-section');
      const box = input.getBoundingClientRect();
      return {
        sprite: !!sprite && sprite.getBoundingClientRect().width > 0,
        /** how far into the field the sprite starts — the list starts it at the same place */
        spriteLeft: sprite ? sprite.getBoundingClientRect().left - box.left : null,
        // the sprite has to fit the room the field leaves it, or it is drawn over the name
        spriteRight: sprite?.getBoundingClientRect().right ?? 0,
        textStart: input.getBoundingClientRect().left + parseFloat(style.paddingLeft),
        section: section?.getBoundingClientRect().width ?? 0,
        column: parseFloat(
          getComputedStyle(input).getPropertyValue('--skin-sprite-cell') || '0',
        ),
        // the sections eat into the field as padding: the sprite on the left, the chevron
        // on the right
        forName:
          input.getBoundingClientRect().width -
          parseFloat(style.paddingLeft) -
          parseFloat(style.paddingRight),
        name: context.measureText(name).width,
      };
    }, longest);

    expect(field.sprite, 'the field shows no sprite for the engine it holds').toBe(true);
    expect(field.section, 'the left section is not the width of the sprite column').toBe(
      field.column,
    );
    expect(field.spriteRight, 'the sprite is drawn over the name').toBeLessThanOrEqual(
      field.textStart,
    );
    // the field shows the vehicle where the list showed it, rather than centred in its
    // column; the couple of pixels between them are the row's own padding
    const drift = Math.abs((field.spriteLeft ?? 0) - (list.options[0].pictureLeft ?? 0));
    expect(drift, 'the sprite sits at a different place in the field than in the list')
      .toBeLessThanOrEqual(4);
    expect(
      field.name,
      `"${longest}" needs ${Math.ceil(field.name)}px, the field leaves ${Math.floor(field.forName)}px`,
    ).toBeLessThanOrEqual(field.forName);
  });
});

/**
 * The width rule is a default of the theme, not of a page, and the spec says so — "on every
 * dropdown of the application, whatever tab it is on". The supply tab holds the longest names
 * of the dataset; what is asserted is the rule rather than a number, because how long the
 * longest name is depends on the language and on the sets that are on.
 */
describe('a list on a working tab', () => {
  it('keeps its options on one line and is no narrower than its field', async () => {
    const page = await harness().goto('/supply', '.page-industry-supply');
    const field = page.locator('.filters .mantine-Select-input').first();
    await openField(page, field);

    const names = await optionLabels(page);
    expect(names, 'the industry list came up empty').not.toHaveLength(0);

    const box = await dropdownMetrics(page, field);
    const heights = box.options.map((option) => option.height);
    // one line per option: the longest one is no taller than the shortest
    expect(Math.max(...heights)).toBe(Math.min(...heights));
    expect(box.dropdownWidth).toBeGreaterThanOrEqual(box.fieldWidth - 1);
  });
});
