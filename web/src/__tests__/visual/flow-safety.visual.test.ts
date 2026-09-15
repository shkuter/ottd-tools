import { describe, expect, it } from 'vitest';
import { harnessFixture } from './harness';
import { snapshot } from './collect';
import { fromToken, painted } from './colours';
import { describeFindings, offPalette } from './findings';

/**
 * The two controls this part of the interface added that nothing else on the page looks like:
 * a button that destroys something, and a notification with a button in it. Both are skinned by
 * rules whose weight against the plain button rule decides whether they land at all — the
 * danger button used to lose to it without a trace in the stylesheet — so they are checked on
 * the page, as painted.
 */

const harness = harnessFixture();

describe('the danger button', () => {
  it('is lettered in the loss colour, not like every other button', async () => {
    const page = await harness().goto('/settings', '.page-settings');
    const read = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.mantine-Button-root.btn-danger')].map((button) => {
          const style = getComputedStyle(button);
          return {
            color: style.color,
            tokens: {
              '--skin-loss': style.getPropertyValue('--skin-loss').trim(),
              '--skin-button-text': style.getPropertyValue('--skin-button-text').trim(),
            },
          };
        }),
      );

    const [onPage] = await read();
    expect(onPage, 'no danger button on the settings tab').toBeDefined();
    // the check would pass for nothing if the two tokens were the same colour
    expect(fromToken(onPage.tokens, '--skin-loss')).not.toBe(
      fromToken(onPage.tokens, '--skin-button-text'),
    );
    expect(painted(onPage.color, 'the reset button')).toBe(fromToken(onPage.tokens, '--skin-loss'));

    // and the one confirming in the window, which is where the reset really happens
    await page.locator('.page-settings .btn-danger').click();
    await page.waitForSelector('.mantine-Modal-content .btn-danger');
    const inWindow = (await read()).at(-1)!;
    expect(painted(inWindow.color, 'the confirming button')).toBe(
      fromToken(inWindow.tokens, '--skin-loss'),
    );
    await page.keyboard.press('Escape');
  });
});

describe('the notification that offers a consist back', () => {
  it('is a window of the game with a button plate in it, in palette colours only', async () => {
    const page = await harness().goto('/consist', '.page-consist');
    await page.locator('.page-consist .btn-add').first().click();
    await page.locator('.consist-side .btn-clear').click();
    await page.waitForSelector('.mantine-Notification-root .mantine-Button-root');

    const shown = await page.evaluate(() => {
      const root = document.querySelector('.mantine-Notification-root')!;
      const button = root.querySelector('.mantine-Button-root')!;
      const rootStyle = getComputedStyle(root);
      const buttonStyle = getComputedStyle(button);
      return {
        background: rootStyle.backgroundColor,
        border: { style: rootStyle.borderTopStyle, width: parseFloat(rootStyle.borderTopWidth) },
        buttonBackground: buttonStyle.backgroundColor,
        buttonBorder: {
          style: buttonStyle.borderTopStyle,
          width: parseFloat(buttonStyle.borderTopWidth),
        },
        tokens: {
          '--skin-window': rootStyle.getPropertyValue('--skin-window').trim(),
          '--skin-button': buttonStyle.getPropertyValue('--skin-button').trim(),
        },
      };
    });

    expect(painted(shown.background, 'the notification')).toBe(fromToken(shown.tokens, '--skin-window'));
    expect(shown.border.style, 'the notification has no window frame').toBe('solid');
    expect(shown.border.width).toBeGreaterThan(0);
    expect(painted(shown.buttonBackground, 'the restore button')).toBe(
      fromToken(shown.tokens, '--skin-button'),
    );
    expect(shown.buttonBorder.style, 'the restore button is not a raised plate').toBe('solid');
    expect(shown.buttonBorder.width).toBeGreaterThan(0);

    const findings = offPalette(await page.evaluate(snapshot));
    expect(findings, describeFindings(findings)).toHaveLength(0);
  });
});
