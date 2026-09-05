import { describe, expect, it } from 'vitest';
import { useFirsStore } from '../firsStore';

describe('firsStore', () => {
  it('drops a hand-set scale when the target changes', () => {
    const { setChainTargetId, setTargetOutputPerMonth } = useFirsStore.getState();
    setChainTargetId('coke_oven');
    setTargetOutputPerMonth(500);
    expect(useFirsStore.getState().targetOutputPerMonth).toBe(500);
    setChainTargetId('blast_furnace');
    // the scale belonged to the industry it was typed for
    expect(useFirsStore.getState().targetOutputPerMonth).toBeNull();
  });

  it('drops the pick and the target with the economy they were made in', () => {
    const store = useFirsStore.getState();
    store.showEconomy('STEELTOWN');
    store.setSelectedNode('wharf');
    store.setChainTargetId('wharf');
    // the same economy shown again — coming back to the tab — keeps the pick
    store.showEconomy('STEELTOWN');
    expect(useFirsStore.getState().selectedNode).toBe('wharf');
    expect(useFirsStore.getState().chainTargetId).toBe('wharf');
    // another economy is another graph, the wharf may not even be in it
    store.showEconomy('BASIC_TEMPERATE');
    expect(useFirsStore.getState().selectedNode).toBeNull();
    expect(useFirsStore.getState().chainTargetId).toBeNull();
    expect(useFirsStore.getState().economyId).toBe('BASIC_TEMPERATE');
  });
});
