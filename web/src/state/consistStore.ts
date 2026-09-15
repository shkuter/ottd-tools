import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConsistEntry } from '../types';
import { trainByAnyId } from '../dataset';

interface ConsistState {
  entries: ConsistEntry[];
  /** Индекс GRF-параметра вместимости вагонов (0..4, default 2). */
  capacityIndex: number;
  add: (trainId: string) => void;
  remove: (trainId: string) => void;
  setCount: (trainId: string, count: number) => void;
  /** Replace the whole consist with entries the caller already resolved to catalogue rows. */
  setEntries: (entries: ConsistEntry[]) => void;
  clear: () => void;
  setCapacityIndex: (index: number) => void;
}

/**
 * Only id and count go to localStorage; the Train objects are brought back from the catalogue.
 *
 * There is no cargo here: the consist and the trip share one, and the route store keeps it. A
 * `cargoLabel` saved by earlier versions is carried over by `upgrade.ts`; the merge below
 * simply does not read it.
 */
interface PersistedConsist {
  items?: { id: string; count: number }[];
  capacityIndex?: number;
}

export const useConsistStore = create<ConsistState>()(
  persist(
    (set) => ({
      entries: [],
      capacityIndex: 2,
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
    }),
    {
      name: 'ottd-tools-consist',
      partialize: (state) => ({
        items: state.entries.map((e) => ({ id: e.train.id, count: e.count })),
        capacityIndex: state.capacityIndex,
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
        };
      },
    },
  ),
);
