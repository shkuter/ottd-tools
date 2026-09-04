import type { Locator, Page } from 'playwright';
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

/** Opens the first dropdown of the page — the plain specimen, in the grey window. */
export async function openDropdown(page: Page) {
  await openField(page, page.locator('.mantine-Select-input').first());
}

/*
 * Mantine keeps every dropdown of the page mounted and merely hides the closed ones, so
 * "the open list" is the one that is actually on screen — waiting for
 * [data-combobox-option] would find the options of all sixteen closed lists as well.
 * Playwright's :visible does that in a selector, which is why the checks reach the list
 * through `openList` rather than through querySelector.
 */
export const OPEN_LIST = '.mantine-Select-dropdown:visible';

/** The field of one named specimen — repeated in every colour group, so the first one. */
export function specimenInput(page: Page, testId: string) {
  return page.locator(`[data-testid="${testId}"] .mantine-Select-input`).first();
}

/** Opens one named dropdown of the page — the specimens carry a data-testid each. */
export async function openDropdownIn(page: Page, testId: string) {
  // the specimen is repeated in every colour group; the first one is the grey window, and
  // the metrics below read the first open list for the same reason
  await openField(page, specimenInput(page, testId));
}

/** Opens the list of any field, specimen or not, and waits for it to stop moving. */
export async function openField(page: Page, field: Locator) {
  await field.click();
  await page.waitForSelector(OPEN_LIST);
  await settled(page);
}

/*
 * floating-ui places the list over the next few frames — the width lands first and the
 * position follows it — so a measurement taken the moment the list appears catches it
 * mid-flight. Two frames is what it takes for the placement to stop moving.
 */
async function settled(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** Closes whatever list is open, so the next one can be measured on its own. */
export async function closeDropdown(page: Page) {
  await page.keyboard.press('Escape');
  await page.waitForSelector(OPEN_LIST, { state: 'hidden' });
}

/** Labels of the options currently listed, in the order the list shows them. */
export async function optionLabels(page: Page): Promise<string[]> {
  return openList(page).evaluate((list) =>
    [...list.querySelectorAll('[data-combobox-option]')].map((option) => option.textContent ?? ''),
  );
}

/** The one list that is open, as a handle — Playwright's :visible does the finding. */
export function openList(page: Page) {
  return page.locator(OPEN_LIST).first();
}

/** The options of the open list, for waiting on how many a search left. */
export function openOptions(page: Page) {
  return page.locator(`${OPEN_LIST} [data-combobox-option]`);
}

export interface OptionMetrics {
  readonly height: number;
  readonly hasPicture: boolean;
  readonly pictureLeft: number | null;
  /** where the name itself starts, measured on the text node rather than on its box */
  readonly nameLeft: number | null;
}

export interface DropdownMetrics {
  readonly fieldLeft: number;
  readonly fieldWidth: number;
  readonly dropdownLeft: number;
  readonly dropdownWidth: number;
  readonly dropdownRight: number;
  readonly viewportWidth: number;
  readonly options: readonly OptionMetrics[];
}

/**
 * The geometry of the open list: what the skin cannot be asked for as a colour.
 * Measured in the page, asserted in Node, like everything else here.
 */
export async function dropdownMetrics(page: Page, field: Locator): Promise<DropdownMetrics> {
  return openList(page).evaluate((list, input) => {
    const field = input as HTMLElement;
    const box = list.getBoundingClientRect();
    const fieldBox = field.getBoundingClientRect();
    const options = [...list.querySelectorAll('[data-combobox-option]')].map((option) => {
      const name = option.querySelector('.option-row')?.lastChild;
      let nameLeft: number | null = null;
      if (name && name.nodeType === Node.TEXT_NODE) {
        const range = document.createRange();
        range.selectNodeContents(name);
        nameLeft = range.getBoundingClientRect().left;
      }
      // a picture that failed to load hides itself (TrainImage), so it is the drawn box
      // that counts, not the presence of the tag
      const picture = option.querySelector('img');
      const row = option.getBoundingClientRect();
      return {
        height: row.height,
        hasPicture: !!picture && picture.getBoundingClientRect().width > 0,
        /** how far into its row the picture starts — the field has to match it */
        pictureLeft: picture ? picture.getBoundingClientRect().left - row.left : null,
        nameLeft,
      };
    });
    return {
      fieldLeft: fieldBox.left,
      fieldWidth: fieldBox.width,
      dropdownLeft: box.left,
      dropdownWidth: box.width,
      dropdownRight: box.right,
      viewportWidth: document.documentElement.clientWidth,
      options,
    };
  }, await field.elementHandle());
}

/** The specimens of the tier of one: the list, the frame with nothing in it, the chart. */
export const showcase = {
  list: (page: Page) => page.locator('[data-testid="kit-list"]'),
  emptyList: (page: Page) => page.locator('[data-testid="kit-list-empty"]'),
  chart: (page: Page) => page.locator('[data-testid="kit-chart"] .mantine-LineChart-root'),
};

/** Every picture of the page, and whether each one is actually drawn. */
export async function pictures(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="kit-"] img')].map((image) => ({
      src: (image as HTMLImageElement).src,
      drawn: image.getBoundingClientRect().width > 0,
    })),
  );
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
