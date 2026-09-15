import type { Page } from 'playwright';

/**
 * Holding a side panel on screen the way scrolling does. A sticky panel is held only while the
 * grid it stands in still reaches below it: scrolled past the end of that grid it leaves with
 * the page, as any sticky element does, and a check scrolling an arbitrary distance would
 * measure a panel that is no longer held. So the page is scrolled just far enough for the panel
 * to stop at its `top`, within the room its grid leaves. Shared by the checks of the held panels;
 * kept out of the test files, whose tests would run again in every file importing them.
 */

export interface HeldPanel {
  error?: string;
  top: number;
  bottom: number;
  height: number;
  /** the `top` the panel is held at, resolved */
  heldAt: number;
  window: number;
  scrollHeight: number;
  clientHeight: number;
  position: string;
  launcherBottom: number;
  scrolled: number;
}

export function holdPanel(page: Page, selector: string): Promise<HeldPanel> {
  return page.evaluate(async (panelSelector) => {
    const frames = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const panel = document.querySelector<HTMLElement>(panelSelector)!;
    window.scrollTo(0, 0);
    await frames();
    const style = getComputedStyle(panel);
    const heldAt = parseFloat(style.top);
    const box = panel.getBoundingClientRect();
    const grid = panel.parentElement!.getBoundingClientRect();
    const room = grid.bottom - box.bottom;
    const empty = {
      top: 0, bottom: 0, height: 0, heldAt, window: window.innerHeight, scrollHeight: 0, clientHeight: 0,
      position: style.position, launcherBottom: 0, scrolled: 0,
    };
    if (room < 20) return { ...empty, error: `the grid leaves the panel ${room}px to be held in` };
    window.scrollTo(0, box.top - heldAt + Math.min(200, room - 10));
    await frames();
    const held = panel.getBoundingClientRect();
    return {
      top: held.top,
      bottom: held.bottom,
      height: held.height,
      heldAt,
      window: window.innerHeight,
      scrollHeight: panel.scrollHeight,
      clientHeight: panel.clientHeight,
      position: style.position,
      launcherBottom: document.querySelector('.savegame-launcher')!.getBoundingClientRect().bottom,
      scrolled: window.scrollY,
    };
  }, selector);
}
