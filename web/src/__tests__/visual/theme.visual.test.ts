import { describe, expect, it } from 'vitest';
import { WINDOW_COLOURS } from '../../skin';
import { harnessFixture } from './harness';
import { snapshot } from './collect';
import { fromToken, painted } from './colours';
import { byClass, byData, firstByClass, textWithin } from './query';
import { openDropdown, openKit, showGroup, showNotification, showTooltip } from './kit';

/**
 * A dropdown, a tooltip and a notification are rendered into a portal under
 * <body>, so a theme set on the page never reaches them — only the attribute on
 * <html> does. That is exactly the kind of rule that looks right in the
 * stylesheet and lands nowhere, so it is checked on the plate itself: the
 * surface and the lettering of each must be the colours of the group the shell
 * is currently painted in.
 */

const harness = harnessFixture();

describe('a portal element', () => {
  it.each(WINDOW_COLOURS)('is painted in the colours of the %s window', async (group) => {
    const page = await openKit(harness());
    await showGroup(page, group);

    await openDropdown(page);
    const withDropdown = await page.evaluate(snapshot);
    // the attribute the portal reads its theme through
    expect(withDropdown.window).toBe(group);
    const tokens = withDropdown.themes[group];

    const dropdown = firstByClass(withDropdown, 'mantine-Select-dropdown');
    expect(dropdown.theme, 'the dropdown sits outside the window it belongs to').toBe(group);
    expect(painted(dropdown.colours['background-color'], 'the dropdown')).toBe(
      fromToken(tokens, '--skin-list-bg'),
    );

    /* Which class an option carries depends on the component that opened the
       list; data-combobox-option is on every one of them. The lettering itself
       sits in a child node with no class, so it is found through the path. */
    expect(
      byData(withDropdown, 'combobox-option').length,
      'no options on screen with the dropdown open',
    ).toBeGreaterThan(0);
    // not the chosen one: that is a black plate with white lettering, checked on its own
    const lettering = textWithin(withDropdown, 'mantine-Select-option').find(
      (element) => !element.path.includes('[checked]'),
    );
    expect(lettering, 'no unselected option lettering on screen').toBeDefined();
    expect(painted(lettering!.colours.color, 'an option')).toBe(
      fromToken(tokens, '--skin-list-text'),
    );

    /* The tooltip is the game's own plate — pale yellow in a black frame in every
       window (misc_gui.cpp:657) — so what is checked is that it takes the colour
       from the tokens rather than from whatever Mantine defaults to.
       Every plate on screen is asked, not the first one found: the specimen in
       the first section keeps its tooltip open at all times, so from the second
       group onwards there are two of them. */
    await showTooltip(page, group);
    const tooltips = byClass(await page.evaluate(snapshot), 'mantine-Tooltip-tooltip');
    expect(tooltips, 'no tooltip on screen').not.toHaveLength(0);
    for (const tooltip of tooltips) {
      expect(painted(tooltip.colours['background-color'], 'the tooltip')).toBe(
        fromToken(tokens, '--skin-tooltip-bg'),
      );
      expect(painted(tooltip.colours.color, 'the tooltip lettering')).toBe(
        fromToken(tokens, '--skin-tooltip-text'),
      );
    }

    await showNotification(page);
    const withNotification = await page.evaluate(snapshot);
    const notification = firstByClass(withNotification, 'mantine-Notification-root');
    expect(painted(notification.colours['background-color'], 'the notification')).toBe(
      fromToken(tokens, '--skin-window'),
    );
    // its wording sits in a child node, like the option's does
    const message = textWithin(withNotification, 'mantine-Notification-root')[0];
    expect(message, 'the notification shows no text').toBeDefined();
    expect(painted(message.colours.color, 'the notification text')).toBe(
      fromToken(tokens, '--skin-text'),
    );
  });
});
