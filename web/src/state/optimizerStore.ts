import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OptimizerState {
  year: number;
  cargoLabel: string;
  distanceTiles: number;
  stationTiles: number;
  /** Industry output per economy month, 0 = do not limit the load. */
  productionPerMonth: number;
  allowElectric: boolean;
  setYear: (year: number) => void;
  setCargoLabel: (label: string) => void;
  setDistanceTiles: (tiles: number) => void;
  setStationTiles: (tiles: number) => void;
  setProductionPerMonth: (amount: number) => void;
  setAllowElectric: (allow: boolean) => void;
}

export const useOptimizerStore = create<OptimizerState>()(
  persist(
    (set) => ({
      year: 1938,
      cargoLabel: 'FEAL',
      distanceTiles: 300,
      stationTiles: 5,
      productionPerMonth: 0,
      allowElectric: false,
      setYear: (year) => set({ year }),
      setCargoLabel: (cargoLabel) => set({ cargoLabel }),
      setDistanceTiles: (distanceTiles) => set({ distanceTiles }),
      setStationTiles: (stationTiles) => set({ stationTiles }),
      setProductionPerMonth: (productionPerMonth) => set({ productionPerMonth }),
      setAllowElectric: (allowElectric) => set({ allowElectric }),
    }),
    { name: 'ottd-tools-optimizer' },
  ),
);
