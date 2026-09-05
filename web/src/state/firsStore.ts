import { create } from 'zustand';

interface FirsState {
  /** Node clicked on the graph: an industry id or a cargo label. */
  selectedNode: string | null;
  setSelectedNode: (node: string | null) => void;
  /**
   * The economy the node and the target were picked in. A pick belongs to its graph: kept
   * across a switch, it would leave the chain walk tracing nodes the new graph has not,
   * dimming the whole picture — so the tab hands in the economy it shows, and a different
   * one drops both. Held here rather than in the tab because the economy is changed on the
   * settings tab, while this one is unmounted.
   */
  economyId: string | null;
  showEconomy: (economyId: string) => void;
  /** Industry whose supply chain the dependency mode works out. */
  chainTargetId: string | null;
  setChainTargetId: (id: string | null) => void;
  /**
   * Output wanted of the target, in units per month. Null while the player has set none, and
   * the scale comes from the imported game instead (`defaultOutputPerMonth`).
   */
  targetOutputPerMonth: number | null;
  setTargetOutputPerMonth: (value: number | null) => void;
}

/**
 * Not persisted: the economy is a game setting now, and the selected node is a click on the
 * graph, meaningless to restore on the next visit.
 */
export const useFirsStore = create<FirsState>()((set) => ({
  selectedNode: null,
  setSelectedNode: (selectedNode) => set({ selectedNode }),
  economyId: null,
  showEconomy: (economyId) =>
    set((s) =>
      s.economyId === economyId
        ? s
        : { economyId, selectedNode: null, chainTargetId: null, targetOutputPerMonth: null },
    ),
  chainTargetId: null,
  // a target from another economy is as meaningless as a node from one: both are dropped when
  // the tab switches, by the same effect
  setChainTargetId: (chainTargetId) => set({ chainTargetId, targetOutputPerMonth: null }),
  targetOutputPerMonth: null,
  setTargetOutputPerMonth: (targetOutputPerMonth) => set({ targetOutputPerMonth }),
}));
