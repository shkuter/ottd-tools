import { describe, expect, it } from 'vitest';
import { WINDOW_COLOURS } from '../../skin';
import { harnessFixture } from './harness';
import { snapshot } from './collect';
import { named } from '../../skin';
import { fromToken, normaliseColour, tokenColours } from './colours';
import { openKit, showGroup } from './kit';

/**
 * The game keeps its palette readable with a black shadow under the text rather
 * than with contrast, and the shadow follows the colour, not the role: every
 * colour is shaded except the two the game draws flat — TC_BLACK and the dimmed
 * one (TC_GREY | TC_NO_SHADE). So on a light window the body text has no shadow,
 * and on a dark one, where it is light, it does.
 *
 * The expectation is read off the theme carrier: which colour counts as dimmed
 * is a property of the window colour group, not a constant of this file.
 */

const harness = harnessFixture();

/** TC_BLACK: the one colour of the palette that belongs to no gradient. */
const BLACK = fromToken(named, 'tcBlack');

describe('text shadow', () => {
  it.each(WINDOW_COLOURS)('is on every colour but black and dimmed in the %s window', async (group) => {
    const page = await openKit(harness());
    await showGroup(page, group);
    const shot = await page.evaluate(snapshot);

    const wrong: string[] = [];
    for (const element of shot.elements) {
      if (element.ownText === '' || !element.colours.color) continue;
      const colour = normaliseColour(element.colours.color);
      if (!colour) continue;

      const tokens = shot.themes[element.theme];
      // the two the game draws flat, plus black: which colour counts as dimmed
      // is a property of this window colour group
      const flat = new Set([
        BLACK,
        fromToken(tokens, '--skin-muted'),
        fromToken(tokens, '--skin-disabled'),
      ]);
      const shaded = element.textShadow !== 'none';
      const shouldBeFlat = flat.has(colour.hex);

      if (shouldBeFlat && shaded) {
        wrong.push(
          `${colour.hex} is drawn flat by the game, yet carries ${element.textShadow}` +
            `\n    ${element.path} (${element.ownText})`,
        );
      }
      if (!shouldBeFlat && !shaded) {
        wrong.push(
          `${colour.hex} has no shadow, and the game shades every colour but black and dimmed` +
            `\n    ${element.path} (${element.ownText})`,
        );
      }
      if (shaded) {
        const cast = tokenColours(element.textShadow).map((c) => c.hex);
        if (!cast.includes(BLACK)) {
          wrong.push(
            `the shadow under ${colour.hex} is ${cast.join(', ')}, and the game casts black` +
              `\n    ${element.path} (${element.ownText})`,
          );
        }
      }
    }

    expect(wrong, `${wrong.length} text(s) shaded against the game:\n  ${wrong.join('\n  ')}`)
      .toHaveLength(0);
  });
});
