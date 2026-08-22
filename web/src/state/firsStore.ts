import { create } from 'zustand';

interface FirsState {
  /** Выбранный узел графа: id индустрии или label груза. */
  selectedNode: string | null;
  setSelectedNode: (node: string | null) => void;
}

/**
 * Not persisted: the economy is a game setting now, and the selected node is a click on the
 * graph, meaningless to restore on the next visit.
 */
export const useFirsStore = create<FirsState>()((set) => ({
  selectedNode: null,
  setSelectedNode: (selectedNode) => set({ selectedNode }),
}));
