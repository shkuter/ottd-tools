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
});
