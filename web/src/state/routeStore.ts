import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PrefillOrigin } from './prefill';

/**
 * The inputs a bridge from the game tab fills in, and the shape the note compares against.
 * The consist lives in its own store, so it travels here as ids and counts — the tab hands
 * both halves to `prefillMatches` together.
 */
export interface RoutePrefill {
  cargoLabel: string;
  distanceTiles: number;
  amount: number;
  manualDays: number | null;
  productionPerMonth: number;
  waitForFullLoad: boolean;
  consist: { id: string; count: number }[];
}

interface RouteState {
  cargoLabel: string;
  distanceTiles: number;
  amount: number;
  /** Travel time in days; null = take it from the consist's speed. */
  manualDays: number | null;
  /**
   * Output of the source industry, units per economy month; 0 = not given.
   * The full-load branch needs it: with no flow there is nothing to wait for and the
   * branches are indistinguishable.
   */
  productionPerMonth: number;
  /** Loading branch: the consist waits to be filled (a full-load order in game). */
  waitForFullLoad: boolean;
  /** Set when a bridge filled these inputs in; null when they were typed by hand. */
  prefillOrigin: PrefillOrigin<RoutePrefill> | null;
  setCargoLabel: (label: string) => void;
  setDistanceTiles: (tiles: number) => void;
  setAmount: (amount: number) => void;
  setManualDays: (days: number | null) => void;
  setProductionPerMonth: (perMonth: number) => void;
  setWaitForFullLoad: (wait: boolean) => void;
  setPrefillOrigin: (origin: PrefillOrigin<RoutePrefill> | null) => void;
}

export const useRouteStore = create<RouteState>()(
  persist(
    (set) => ({
      cargoLabel: 'COAL',
      distanceTiles: 100,
      amount: 100,
      manualDays: null,
      productionPerMonth: 0,
      waitForFullLoad: false,
      prefillOrigin: null,
      setCargoLabel: (cargoLabel) => set({ cargoLabel }),
      setDistanceTiles: (distanceTiles) => set({ distanceTiles }),
      setAmount: (amount) => set({ amount }),
      setManualDays: (manualDays) => set({ manualDays }),
      setProductionPerMonth: (productionPerMonth) => set({ productionPerMonth }),
      setWaitForFullLoad: (waitForFullLoad) => set({ waitForFullLoad }),
      setPrefillOrigin: (prefillOrigin) => set({ prefillOrigin }),
    }),
    { name: 'ottd-tools-route' },
  ),
);
