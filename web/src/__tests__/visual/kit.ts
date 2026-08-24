import type { Page } from 'playwright';
import type { WindowColour } from '../../skin';
import type { Harness } from './harness';
import { KIT } from './routes';

/**
 * Driving the interface-elements page: it is the only surface that shows every
 * control in every window colour, and the only one where a dropdown, a tooltip
 * and a notification can be brought on screen in a chosen colour group — they
 * render into a portal under <body>, so only the attribute the page's picker
 * sets reaches them.
 */

export async function openKit(harness: Harness) {
  const page = await harness.goto(KIT.path, KIT.ready);
  page.setDefaultTimeout(8000);
  return page;
}

/** Switches the page — and with it the portal — to one colour group. */
export async function showGroup(page: Page, group: WindowColour) {
  // by the picker's own value, so the switch does not depend on the interface language
  await page
    .locator(`.mantine-SegmentedControl-control:has(> input[value="${group}"]) > label`)
    .click();
  await page.waitForFunction(
    (expected) => document.documentElement.dataset.window === expected,
    group,
  );
}

/** Opens the first dropdown and waits for its options to be on screen. */
export async function openDropdown(page: Page) {
  await page.locator('.mantine-Select-input').first().click();
  await page.waitForSelector('[data-combobox-option]');
}

/** Brings the tooltip plate on screen inside the given colour group. */
export async function showTooltip(page: Page, group: WindowColour) {
  await page.locator(`.kit-window[data-window="${group}"] [data-testid="kit-tooltip"]`).hover();
  await page.waitForSelector('.mantine-Tooltip-tooltip');
}

/** Fires a notification, which the page shows in a portal like the game's window. */
export async function showNotification(page: Page) {
  // by test id, not by the button's wording: that comes from the locale files
  await page.locator('[data-testid="kit-notify"]').first().click();
  await page.waitForSelector('.mantine-Notification-root');
}

/**
 * Each portal plate is brought up on its own, one snapshot each: opening a
 * dropdown and then clicking the notification button closes the dropdown again,
 * and hovering for a tooltip moves the pointer off whatever was open. Trying to
 * have all three on screen at once quietly ends up with fewer than three.
 */
export const PORTALS: ((page: Page, group: WindowColour) => Promise<void>)[] = [
  (page) => openDropdown(page),
  showTooltip,
  (page) => showNotification(page),
];
