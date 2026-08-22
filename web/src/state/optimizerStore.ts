import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { OptimizeGoal } from '../engine/optimize';

interface OptimizerState {
  year: number;
  cargoLabel: string;
  distanceTiles: number;
  stationTiles: number;
  /** Industry output per economy month, 0 = do not limit the load. */
  productionPerMonth: number;
  /** What the search ranks by; 'transported' needs a production flow to mean anything. */
  goal: OptimizeGoal;
  /** Upper bound on trains per route, used by the transported goal. */
  maxTrains: number;
  /**
   * Industry the cargo is hauled to, for the supply column and the supply goal. Empty when
   * none was chosen; an id the active economy has no industry for is replaced on read, the
   * way the economy itself falls back (ADR-0002), so switching economies cannot leave a
   * consumer from another set standing.
   */
  destinationId: string;
  allowElectric: boolean;
  /**
   * Машины, исключённые из перебора: те, что в выбранном году могут ещё не
   * появиться в игре (engine/availability.ts) и не нужны игроку в выдаче.
   */
  excludedIds: string[];
  setYear: (year: number) => void;
  setCargoLabel: (label: string) => void;
  setDistanceTiles: (tiles: number) => void;
  setStationTiles: (tiles: number) => void;
  setProductionPerMonth: (amount: number) => void;
  setGoal: (goal: OptimizeGoal) => void;
  setMaxTrains: (trains: number) => void;
  setDestinationId: (id: string) => void;
  setAllowElectric: (allow: boolean) => void;
  /** Выключить/вернуть пункт списка покупки целиком: у него бывает несколько моделей. */
  toggleExcluded: (ids: string[]) => void;
  clearExcluded: () => void;
}

export const useOptimizerStore = create<OptimizerState>()(
  persist(
    (set) => ({
      year: 1938,
      cargoLabel: 'FEAL',
      distanceTiles: 300,
      stationTiles: 5,
      productionPerMonth: 0,
      goal: 'profit',
      maxTrains: 4,
      destinationId: '',
      allowElectric: false,
      excludedIds: [],
      setYear: (year) => set({ year }),
      setCargoLabel: (cargoLabel) => set({ cargoLabel }),
      setDistanceTiles: (distanceTiles) => set({ distanceTiles }),
      setStationTiles: (stationTiles) => set({ stationTiles }),
      setProductionPerMonth: (productionPerMonth) => set({ productionPerMonth }),
      setGoal: (goal) => set({ goal }),
      setMaxTrains: (maxTrains) => set({ maxTrains }),
      setDestinationId: (destinationId) => set({ destinationId }),
      setAllowElectric: (allowElectric) => set({ allowElectric }),
      toggleExcluded: (ids) =>
        set((s) => ({
          excludedIds: ids.every((id) => s.excludedIds.includes(id))
            ? s.excludedIds.filter((x) => !ids.includes(x))
            : [...s.excludedIds, ...ids.filter((id) => !s.excludedIds.includes(id))],
        })),
      clearExcluded: () => set({ excludedIds: [] }),
    }),
    { name: 'ottd-tools-optimizer' },
  ),
);
