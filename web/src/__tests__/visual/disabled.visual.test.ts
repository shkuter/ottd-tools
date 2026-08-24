import { beforeAll, describe, expect, it } from 'vitest';
import { WINDOW_COLOURS } from '../../skin';
import { harnessFixture } from './harness';
import { snapshot, type ElementStyles, type Snapshot } from './collect';
import { extractColours, tokenColour } from './colours';
import { openKit } from './kit';

/**
 * The game lays a checkerboard of a darker shade over an unavailable widget
 * (widget.cpp:2359) instead of just dimming it, and the shade is the widget's
 * own: a button hatches in the yellow it is made of, a field in the window's
 * colour. The pattern comes from a gradient, so a token that fails to resolve
 * leaves it a flat grey — which is what happened once already and looked close
 * enough to pass by eye.
 */

const harness = harnessFixture();

function hatchOf(element: ElementStyles) {
  const image = element.colours['background-image'];
  expect(image, `${element.path} is unavailable and carries no hatch`).toBeDefined();
  return extractColours(image!).map((colour) => colour.hex);
}

describe('an unavailable widget', () => {
  // one snapshot for the lot: the page shows a specimen per group side by side,
  // and nothing here depends on which group the portal is switched to
  let shot: Snapshot;
  beforeAll(async () => {
    shot = await (await openKit(harness())).evaluate(snapshot);
  });

  it.each(WINDOW_COLOURS)('is hatched in its own shade in the %s window', (group) => {
    const tokens = shot.themes[group];
    /* The page shows one specimen per colour group at once, so the widget to ask
       is the one standing in this group's section — not simply the first on the
       page, which is always the base theme's. */
    const inGroup = shot.elements.filter((element) => element.theme === group);

    const button = inGroup.find(
      (element) => element.classes.includes('mantine-Button-root') && element.disabled,
    );
    expect(button, 'no unavailable button on the page').toBeDefined();
    // a tab and a dropdown are buttons of the game too, hence the button shade
    expect(hatchOf(button!)).toContain(tokenColour(tokens['--skin-button-hatch'])?.hex);

    const field = inGroup.find(
      (element) => element.classes.includes('mantine-Input-input') && element.disabled,
    );
    expect(field, 'no unavailable field on the page').toBeDefined();
    expect(hatchOf(field!)).toContain(tokenColour(tokens['--skin-hatch'])?.hex);

    // and the plate stays: the pattern is laid over the widget, not instead of it
    const available = inGroup.find(
      (element) => element.classes.includes('mantine-Button-root') && !element.disabled,
    );
    expect(available, 'no available button to compare the plate with').toBeDefined();
    expect(button!.colours['background-color']).toBe(available!.colours['background-color']);
  });
});
