import { createJSONStorage } from 'zustand/middleware';
import { describe, expect, it } from 'vitest';
import { trains } from '../../dataset';
import { vanillaTrains } from '../../vanilla';
import { useConsistStore } from '../consistStore';
import { memoryStorage } from './memoryStorage';

const KEY = 'ottd-tools-consist';
const engine = trains.find((t) => t.kind === 'engine')!;
const wagon = trains.find((t) => t.kind === 'wagon')!;
const vanillaEngine = vanillaTrains.find((t) => t.kind === 'engine')!;
const vanillaWagon = vanillaTrains.find((t) => t.kind === 'wagon')!;

async function rehydrateFrom(json: unknown) {
  // merge() receives the live state, so start each case from the defaults
  useConsistStore.setState({ entries: [], capacityIndex: 2, cargoLabel: 'COAL' });
  const storage = memoryStorage({ [KEY]: JSON.stringify(json) });
  useConsistStore.persist.setOptions({ storage: createJSONStorage(() => storage) });
  await useConsistStore.persist.rehydrate();
  return storage;
}

describe('consistStore persist', () => {
  it('оживляет Train по id из каталога и отбрасывает пропавшие машины', async () => {
    await rehydrateFrom({
      state: { items: [{ id: engine.id, count: 2 }, { id: 'gone_with_the_update', count: 3 }, { id: wagon.id, count: 5 }], capacityIndex: 4, cargoLabel: null },
      version: 0,
    });
    const s = useConsistStore.getState();
    expect(s.entries.map((e) => [e.train.id, e.count])).toEqual([[engine.id, 2], [wagon.id, 5]]);
    expect(s.entries[0].train).toBe(engine);
    expect(s.capacityIndex).toBe(4);
    expect(s.cargoLabel).toBeNull();
  });

  it('пустое хранилище → дефолты', async () => {
    await rehydrateFrom({ state: {}, version: 0 });
    const s = useConsistStore.getState();
    expect(s.entries).toEqual([]);
    expect(s.capacityIndex).toBe(2);
    expect(s.cargoLabel).toBe('COAL');
  });

  it('состав ванильной партии переживает перезагрузку', async () => {
    // мост из партии кладёт записи активного набора, а в партии без Iron Horse это
    // ванильные машины: оживлять их обязан тот же merge, иначе состав пропадёт
    await rehydrateFrom({ state: {}, version: 0 });
    await rehydrateFrom({
      state: { items: [{ id: vanillaEngine.id, count: 1 }, { id: vanillaWagon.id, count: 6 }] },
      version: 0,
    });
    expect(useConsistStore.getState().entries.map((e) => [e.train.id, e.count])).toEqual([
      [vanillaEngine.id, 1],
      [vanillaWagon.id, 6],
    ]);
  });

  it('setEntries кладёт готовые записи, в том числе ванильные', async () => {
    await rehydrateFrom({ state: {}, version: 0 });
    useConsistStore.getState().setEntries([{ train: vanillaEngine, count: 1 }]);
    expect(useConsistStore.getState().entries).toEqual([{ train: vanillaEngine, count: 1 }]);
  });

  it('в storage уходят только id и count', async () => {
    const storage = await rehydrateFrom({ state: {}, version: 0 });
    useConsistStore.getState().add(engine.id);
    useConsistStore.getState().add(engine.id);
    const saved = JSON.parse(storage.dump()[KEY]);
    expect(saved.state.items).toEqual([{ id: engine.id, count: 2 }]);
    expect(saved.state.entries).toBeUndefined();
  });
});
