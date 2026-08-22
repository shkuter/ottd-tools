import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface RouteState {
  economyId: string;
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
  setEconomyId: (id: string) => void;
  setCargoLabel: (label: string) => void;
  setDistanceTiles: (tiles: number) => void;
  setAmount: (amount: number) => void;
  setManualDays: (days: number | null) => void;
  setProductionPerMonth: (perMonth: number) => void;
  setWaitForFullLoad: (wait: boolean) => void;
}

export const useRouteStore = create<RouteState>()(
  persist(
    (set) => ({
  economyId: 'STEELTOWN',
  cargoLabel: 'COAL',
  distanceTiles: 100,
  amount: 100,
  manualDays: null,
  productionPerMonth: 0,
  waitForFullLoad: false,
  setEconomyId: (economyId) => set({ economyId }),
  setCargoLabel: (cargoLabel) => set({ cargoLabel }),
  setDistanceTiles: (distanceTiles) => set({ distanceTiles }),
  setAmount: (amount) => set({ amount }),
      setManualDays: (manualDays) => set({ manualDays }),
      setProductionPerMonth: (productionPerMonth) => set({ productionPerMonth }),
      setWaitForFullLoad: (waitForFullLoad) => set({ waitForFullLoad }),
    }),
    { name: 'ottd-tools-route' },
  ),
);
