import type { WindowColour } from './skin';

/**
 * The tabs, each with the colour group of the game window it stands in for
 * (the groups themselves are WINDOW_COLOURS in skin.ts). A tab without one is
 * the vehicle-purchase window, grey — which is what the shell is painted in, so
 * nothing has to be said for it.
 *
 * Kept apart from the shell because the rendered-page checks walk the same
 * table: a tab added in one place and forgotten in the other would simply go
 * unchecked (see visual/routes.ts, which fails loudly instead).
 */
export interface Tab {
  readonly path: string;
  /** i18n key of the label */
  readonly label: string;
  readonly windowColour?: WindowColour;
}

export const TABS: readonly Tab[] = [
  { path: '/optimizer', label: 'nav.optimizer' },
  { path: '/consist', label: 'nav.consist' },
  { path: '/income', label: 'nav.income' },
  // what the network costs to own, and what to trim: grey like the game's own company
  // infrastructure window (company_gui.cpp, _nested_company_infrastructure_widgets)
  { path: '/network', label: 'nav.network' },
  // the two tabs that answer about industries take the colours of the game's
  // industry windows: the list of them is dark green, one of them is brown
  { path: '/supply', label: 'nav.supply', windowColour: 'dark-green' },
  { path: '/firs', label: 'nav.firs', windowColour: 'brown' },
  // the imported game; the shell titles it with the savegame's file name and only offers
  // it once a snapshot exists. Grey like the game's own train list window
  { path: '/game', label: 'nav.game' },
  { path: '/settings', label: 'nav.settings', windowColour: 'mauve' },
];
