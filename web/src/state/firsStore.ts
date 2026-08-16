import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FirsState {
  economyId: string;
  /** Выбранный узел графа: id индустрии или label груза. */
  selectedNode: string | null;
  setEconomyId: (id: string) => void;
  setSelectedNode: (node: string | null) => void;
}

export const useFirsStore = create<FirsState>()(
  persist(
    (set) => ({
  economyId: 'STEELTOWN',
  selectedNode: null,
  setEconomyId: (economyId) => set({ economyId, selectedNode: null }),
      setSelectedNode: (selectedNode) => set({ selectedNode }),
    }),
    { name: 'ottd-tools-firs', partialize: (s) => ({ economyId: s.economyId }) },
  ),
);
