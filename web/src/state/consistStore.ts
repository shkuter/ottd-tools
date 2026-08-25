import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConsistEntry } from '../types';
import { trainByAnyId } from '../dataset';

interface ConsistState {
  entries: ConsistEntry[];
  /** Индекс GRF-параметра вместимости вагонов (0..4, default 2). */
  capacityIndex: number;
  /** Label груза для расчёта вместимости/веса. */
  cargoLabel: string | null;
  add: (trainId: string) => void;
  remove: (trainId: string) => void;
  setCount: (trainId: string, count: number) => void;
  /** Replace the whole consist with entries the caller already resolved to catalogue rows. */
  setEntries: (entries: ConsistEntry[]) => void;
  clear: () => void;
  setCapacityIndex: (index: number) => void;
  setCargoLabel: (label: string | null) => void;
}

/** В localStorage храним только id+count; Train-объекты оживляем из каталога. */
interface PersistedConsist {
  items?: { id: string; count: number }[];
  capacityIndex?: number;
  cargoLabel?: string | null;
}

export const useConsistStore = create<ConsistState>()(
  persist(
    (set) => ({
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
          const train = trainByAnyId.get(trainId);
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
      setEntries: (entries) => set({ entries }),
      clear: () => set({ entries: [] }),
      setCapacityIndex: (capacityIndex) => set({ capacityIndex }),
      setCargoLabel: (cargoLabel) => set({ cargoLabel }),
    }),
    {
      name: 'ottd-tools-consist',
      partialize: (state) => ({
        items: state.entries.map((e) => ({ id: e.train.id, count: e.count })),
        capacityIndex: state.capacityIndex,
        cargoLabel: state.cargoLabel,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as PersistedConsist;
        const entries = (p.items ?? [])
          .map(({ id, count }) => {
            const train = trainByAnyId.get(id);
            return train ? { train, count } : null;
          })
          .filter((e): e is ConsistEntry => e !== null);
        return {
          ...current,
          entries,
          capacityIndex: p.capacityIndex ?? current.capacityIndex,
          cargoLabel: p.cargoLabel !== undefined ? p.cargoLabel : current.cargoLabel,
        };
      },
    },
  ),
);
