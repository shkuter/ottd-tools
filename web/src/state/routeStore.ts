import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PrefillOrigin } from './prefill';

/**
 * How much of a network a company owns, as the infrastructure window counts it: pieces of
 * track per railtype (a tile carries one per track on it), signals by the head, station
 * tiles. Typed in by hand — the question "is it worth
 * electrifying this line" is asked before the line exists. A savegame states none of this:
 * the game recomputes the counts by walking the map on load (sl/company_sl.cpp
 * AfterLoadCompanyStats), so reading them back is a change of its own.
 */
export interface NetworkInputs {
  railPieces: Record<string, number>;
  signals: number;
  stations: number;
}

export const EMPTY_NETWORK_INPUTS: NetworkInputs = { railPieces: {}, signals: 0, stations: 0 };

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
  /** The network whose upkeep this tab prices; see NetworkInputs. */
  network: NetworkInputs;
  /** Set when a bridge filled these inputs in; null when they were typed by hand. */
  prefillOrigin: PrefillOrigin<RoutePrefill> | null;
  setCargoLabel: (label: string) => void;
  setDistanceTiles: (tiles: number) => void;
  setAmount: (amount: number) => void;
  setManualDays: (days: number | null) => void;
  setProductionPerMonth: (perMonth: number) => void;
  setWaitForFullLoad: (wait: boolean) => void;
  setNetwork: (network: NetworkInputs) => void;
  setRailPieces: (label: string, pieces: number) => void;
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
      network: EMPTY_NETWORK_INPUTS,
      prefillOrigin: null,
      setCargoLabel: (cargoLabel) => set({ cargoLabel }),
      setDistanceTiles: (distanceTiles) => set({ distanceTiles }),
      setAmount: (amount) => set({ amount }),
      setManualDays: (manualDays) => set({ manualDays }),
      setProductionPerMonth: (productionPerMonth) => set({ productionPerMonth }),
      setWaitForFullLoad: (waitForFullLoad) => set({ waitForFullLoad }),
      setNetwork: (network) => set({ network }),
      setRailPieces: (label, pieces) =>
        set((s) => ({ network: { ...s.network, railPieces: { ...s.network.railPieces, [label]: pieces } } })),
      setPrefillOrigin: (prefillOrigin) => set({ prefillOrigin }),
    }),
    {
      name: 'ottd-tools-route',
      // persist merges the saved state into the live one field by field, so a state saved
      // before the network existed keeps the default — but a state saved with only part of
      // it (a later field added to NetworkInputs) would replace the whole object and lose
      // the rest, which is what this fills back in
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<RouteState>;
        return { ...current, ...saved, network: { ...EMPTY_NETWORK_INPUTS, ...(saved.network ?? {}) } };
      },
    },
  ),
);
