import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EMPTY_NETWORK, type NetworkCounts } from '../engine/infrastructure';
import type { PrefillOrigin } from './prefill';

/**
 * How much of a network a company owns, as the infrastructure window counts it: pieces of
 * track per railtype (a tile carries one per track on it), signals by the head, station
 * tiles. Typed in by hand — the question "is it worth electrifying this line" is asked
 * before the line exists — or carried over from an imported game, whose map the import
 * walks the way the game walks it on load (sl/company_sl.cpp AfterLoadCompanyStats),
 * because a savegame stores no counters of its own.
 */
export interface NetworkInputs {
  railPieces: Record<string, number>;
  signals: number;
  stations: number;
}

export const EMPTY_NETWORK_INPUTS: NetworkInputs = { railPieces: {}, signals: 0, stations: 0 };

/**
 * The corridor the tab prices below the upkeep: which track it would be converted to, how
 * long it is in **track pieces** (a tile carries one per track on it), how many trains share
 * it, and the engine that replaces the consist's leading vehicles. An empty target or no
 * engine means "not asked yet" — the block computes nothing.
 */
export interface CorridorFields {
  target: string;
  pieces: number;
  trains: number;
  engineId: string | null;
}

export const EMPTY_CORRIDOR: CorridorFields = { target: '', pieces: 0, trains: 1, engineId: null };

/**
 * What the signal block asks for beyond the network it shares with the upkeep panel: the
 * worst descent along the line, in height levels. The game lengthens a braking distance for
 * a descent and never shortens it for a climb, so one number is all it takes.
 */
export interface SignalFields {
  descentLevels: number;
}

export const EMPTY_SIGNALS: SignalFields = { descentLevels: 0 };

/**
 * The counts as the engine bills them. Only the rail side is asked for: roads, trams and
 * canals are priced so the total can be checked against the game's own window, but a rail
 * calculator does not ask the player to keep count of them.
 */
export function networkCounts(network: NetworkInputs): NetworkCounts {
  return {
    ...EMPTY_NETWORK,
    rail: network.railPieces,
    signals: network.signals,
    stations: network.stations,
  };
}

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
  /** Filled by the bridge from a company card; the rest of the tab is untouched by it. */
  network: NetworkInputs;
}

/** The half of the tab a company card fills in: the counts, and nothing else. */
export type NetworkPrefill = Pick<RoutePrefill, 'network'>;

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
  /** What the signal density block asks for; see SignalFields. */
  signals: SignalFields;
  /** The corridor upgrade the tab prices below the upkeep; see CorridorFields. */
  corridor: CorridorFields;
  /** Set when a bridge filled the route's own inputs in; null when they were typed by hand. */
  prefillOrigin: PrefillOrigin<RoutePrefill> | null;
  /**
   * The same, for the network counts. A slot of its own because the two halves of this tab
   * are filled by different cards of the game tab — a route and a company — and neither may
   * erase the other's note by arriving second. It speaks for the counts alone, so the note
   * beside them compares those and not a consist the company card never mentioned.
   */
  networkOrigin: PrefillOrigin<NetworkPrefill> | null;
  setCargoLabel: (label: string) => void;
  setDistanceTiles: (tiles: number) => void;
  setAmount: (amount: number) => void;
  setManualDays: (days: number | null) => void;
  setProductionPerMonth: (perMonth: number) => void;
  setWaitForFullLoad: (wait: boolean) => void;
  setNetwork: (network: NetworkInputs) => void;
  setCorridor: (corridor: Partial<CorridorFields>) => void;
  setSignals: (signals: Partial<SignalFields>) => void;
  setRailPieces: (label: string, pieces: number) => void;
  setPrefillOrigin: (origin: PrefillOrigin<RoutePrefill> | null) => void;
  setNetworkOrigin: (origin: PrefillOrigin<NetworkPrefill> | null) => void;
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
      corridor: EMPTY_CORRIDOR,
      signals: EMPTY_SIGNALS,
      prefillOrigin: null,
      networkOrigin: null,
      setCargoLabel: (cargoLabel) => set({ cargoLabel }),
      setDistanceTiles: (distanceTiles) => set({ distanceTiles }),
      setAmount: (amount) => set({ amount }),
      setManualDays: (manualDays) => set({ manualDays }),
      setProductionPerMonth: (productionPerMonth) => set({ productionPerMonth }),
      setWaitForFullLoad: (waitForFullLoad) => set({ waitForFullLoad }),
      setNetwork: (network) => set({ network }),
      setCorridor: (corridor) => set((s) => ({ corridor: { ...s.corridor, ...corridor } })),
      setSignals: (signals) => set((s) => ({ signals: { ...s.signals, ...signals } })),
      setRailPieces: (label, pieces) =>
        set((s) => ({ network: { ...s.network, railPieces: { ...s.network.railPieces, [label]: pieces } } })),
      setPrefillOrigin: (prefillOrigin) => set({ prefillOrigin }),
      setNetworkOrigin: (networkOrigin) => set({ networkOrigin }),
    }),
    {
      name: 'ottd-tools-route',
      // persist merges the saved state into the live one field by field, so a state saved
      // before the network existed keeps the default — but a state saved with only part of
      // it (a later field added to NetworkInputs) would replace the whole object and lose
      // the rest, which is what this fills back in
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<RouteState>;
        return {
          ...current,
          ...saved,
          network: { ...EMPTY_NETWORK_INPUTS, ...(saved.network ?? {}) },
          corridor: { ...EMPTY_CORRIDOR, ...(saved.corridor ?? {}) },
          signals: { ...EMPTY_SIGNALS, ...(saved.signals ?? {}) },
        };
      },
    },
  ),
);
