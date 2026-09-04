/**
 * Where the checks look. `ready` is the tab's own root, waited for after the
 * shell: the catalogue, the income chart and the supply sweep arrive in their own
 * chunk, and a snapshot taken before they land measures an empty page.
 */
import { TABS } from '../../tabs';
import type { WindowColour } from '../../skin';

export interface Route {
  readonly path: string;
  readonly ready: string;
  /**
   * Window colour group the shell paints this tab in (see tabs in App.tsx).
   * Empty where the tab keeps the base theme: that one lives in :root, so the
   * shell sets no attribute at all — the absence is the expected state.
   */
  readonly window: WindowColour | '';
  /** classes of the containers allowed to scroll sideways on this tab */
  readonly scrollsX?: readonly string[];
}

/**
 * What the checks need on top of what the shell knows about a tab: the root to
 * wait for (a lazily loaded tab arrives after the shell) and the containers
 * allowed to scroll sideways.
 */
const PER_TAB: Record<string, { ready: string; scrollsX?: readonly string[] }> = {
  // the catalogue is wider than its column, which the spec allows
  '/optimizer': { ready: '.page-optimizer', scrollsX: ['table-wrap'] },
  '/consist': { ready: '.page-consist', scrollsX: ['table-wrap'] },
  '/income': { ready: '.page-route' },
  '/network': { ready: '.page-network' },
  '/supply': { ready: '.page-industry-supply' },
  // and so is the chain graph
  '/firs': { ready: '.page-firs', scrollsX: ['graph-container'] },
  '/settings': { ready: '.page-settings' },
  // seeded with a snapshot by the harness, or the tab would not exist to look at
  '/game': { ready: '.page-game', scrollsX: ['table-wrap'] },
};

/**
 * Every tab the shell has, in the order it has them. Built from the shell's own
 * table rather than copied beside it: a tab added there and not here fails right
 * away instead of quietly going unchecked.
 */
export const ROUTES: readonly Route[] = TABS.map((tab) => {
  const extra = PER_TAB[tab.path];
  if (!extra) {
    throw new Error(
      `visual/routes.ts knows nothing about the ${tab.path} tab — add its root selector ` +
        'and any container allowed to scroll sideways to PER_TAB',
    );
  }
  return { path: tab.path, window: tab.windowColour ?? '', ...extra };
});

/**
 * The page the skin is worked on: every control, in every colour group. Its
 * table keeps a scroll area of its own — the scrollbar is one of the elements it
 * exists to show — so it is not part of the layout checks.
 */
export const KIT: Route = { path: '/kit', ready: '.page-kit', window: 'grey' };
