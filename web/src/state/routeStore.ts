import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface RouteState {
  economyId: string;
  cargoLabel: string;
  distanceTiles: number;
  amount: number;
  /** Время в пути, дней; null = взять из скорости состава. */
  manualDays: number | null;
  setEconomyId: (id: string) => void;
  setCargoLabel: (label: string) => void;
  setDistanceTiles: (tiles: number) => void;
  setAmount: (amount: number) => void;
  setManualDays: (days: number | null) => void;
}

export const useRouteStore = create<RouteState>()(
  persist(
    (set) => ({
  economyId: 'STEELTOWN',
  cargoLabel: 'COAL',
  distanceTiles: 100,
  amount: 100,
  manualDays: null,
  setEconomyId: (economyId) => set({ economyId }),
  setCargoLabel: (cargoLabel) => set({ cargoLabel }),
  setDistanceTiles: (distanceTiles) => set({ distanceTiles }),
  setAmount: (amount) => set({ amount }),
      setManualDays: (manualDays) => set({ manualDays }),
    }),
    { name: 'ottd-tools-route' },
  ),
);
