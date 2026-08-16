import { create } from 'zustand';
import type { ConsistEntry } from '../engine/consist';
import { trainById } from '../dataset';

interface ConsistState {
  entries: ConsistEntry[];
  /** Индекс GRF-параметра вместимости вагонов (0..4, default 2). */
  capacityIndex: number;
  /** Label груза для расчёта вместимости/веса. */
  cargoLabel: string | null;
  add: (trainId: string) => void;
  remove: (trainId: string) => void;
  setCount: (trainId: string, count: number) => void;
  clear: () => void;
  setCapacityIndex: (index: number) => void;
  setCargoLabel: (label: string | null) => void;
}

export const useConsistStore = create<ConsistState>((set) => ({
  entries: [],
  capacityIndex: 2,
  cargoLabel: 'COAL',
  add: (trainId) =>
    set((state) => {
      const existing = state.entries.find((e) => e.train.id === trainId);
      if (existing) {
        return {
          entries: state.entries.map((e) =>
            e.train.id === trainId ? { ...e, count: e.count + 1 } : e,
          ),
        };
      }
      const train = trainById.get(trainId);
      if (!train) return state;
      return { entries: [...state.entries, { train, count: 1 }] };
    }),
  remove: (trainId) =>
    set((state) => ({ entries: state.entries.filter((e) => e.train.id !== trainId) })),
  setCount: (trainId, count) =>
    set((state) => ({
      entries:
        count <= 0
          ? state.entries.filter((e) => e.train.id !== trainId)
          : state.entries.map((e) => (e.train.id === trainId ? { ...e, count } : e)),
    })),
  clear: () => set({ entries: [] }),
  setCapacityIndex: (capacityIndex) => set({ capacityIndex }),
  setCargoLabel: (cargoLabel) => set({ cargoLabel }),
}));
