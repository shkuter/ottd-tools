import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runStateUpgrades } from '../upgrade';

const SETTINGS = 'ottd-tools-settings';
const OPTIMIZER = 'ottd-tools-optimizer';
const SUPPLY = 'ottd-tools-industry-supply';

/** A localStorage-alike: the upgrade step has no storage of its own, it is handed one. */
function storage(initial: Record<string, unknown> = {}): Storage & { peek: (k: string) => unknown } {
  const map = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
    peek: (k: string) => {
      const raw = map.get(k);
      return raw ? JSON.parse(raw) : null;
    },
  };
}

const trackTypeIn = (s: ReturnType<typeof storage>) =>
  ((s.peek(SETTINGS) as { state?: { calc?: { trackType?: string } } } | null)?.state?.calc
    ?.trackType);

afterEach(() => localStorage.clear());

describe('carrying electrification into the track type', () => {
  it("turns the optimizer tab's switch into electrified track", () => {
    const s = storage({ [OPTIMIZER]: { state: { allowElectric: true }, version: 1 } });
    runStateUpgrades(s);
    expect(trackTypeIn(s)).toBe('ELRL');
  });

  it("does the same for the supply tab's switch", () => {
    const s = storage({ [SUPPLY]: { state: { allowElectric: true }, version: 1 } });
    runStateUpgrades(s);
    expect(trackTypeIn(s)).toBe('ELRL');
  });

  it('gives one track when both tabs had the switch on', () => {
    const s = storage({
      [OPTIMIZER]: { state: { allowElectric: true }, version: 1 },
      [SUPPLY]: { state: { allowElectric: true }, version: 1 },
    });
    runStateUpgrades(s);
    expect(trackTypeIn(s)).toBe('ELRL');
  });

  it('leaves the choice alone when no switch was on', () => {
    const s = storage({
      [OPTIMIZER]: { state: { allowElectric: false }, version: 1 },
      [SETTINGS]: { state: { calc: { trackType: 'RAIL' } }, version: 2 },
    });
    runStateUpgrades(s);
    expect(trackTypeIn(s)).toBe('RAIL');
  });

  it("keeps the user's own choice over the switch", () => {
    // narrow gauge was picked deliberately; electrification does not undo it
    const s = storage({
      [OPTIMIZER]: { state: { allowElectric: true }, version: 1 },
      [SETTINGS]: { state: { calc: { trackType: 'NAAN' } }, version: 3 },
    });
    runStateUpgrades(s);
    expect(trackTypeIn(s)).toBe('NAAN');
  });

  it('survives a tab key that is not JSON at all', () => {
    const s = storage();
    s.setItem(OPTIMIZER, '{ not json');
    expect(() => runStateUpgrades(s)).not.toThrow();
    expect(trackTypeIn(s)).toBeUndefined();
  });

  it('changes nothing on a second run', () => {
    const s = storage({ [OPTIMIZER]: { state: { allowElectric: true }, version: 1 } });
    runStateUpgrades(s);
    // the user picked another track after the upgrade: a second run must not undo it
    s.setItem(SETTINGS, JSON.stringify({ state: { calc: { trackType: 'NAAN' } }, version: 3 }));
    runStateUpgrades(s);
    expect(trackTypeIn(s)).toBe('NAAN');
  });

  it('leaves every other setting where it was', () => {
    const s = storage({
      [OPTIMIZER]: { state: { allowElectric: true }, version: 1 },
      [SETTINGS]: {
        state: { currency: 'EUR', calc: { priceYear: 1975 }, game: { inflation: true } },
        version: 3,
      },
    });
    runStateUpgrades(s);
    const saved = s.peek(SETTINGS) as {
      state: { currency: string; calc: Record<string, unknown>; game: Record<string, unknown> };
      version: number;
    };
    expect(saved.state.calc).toEqual({ priceYear: 1975, trackType: 'ELRL' });
    expect(saved.state.currency).toBe('EUR');
    expect(saved.state.game).toEqual({ inflation: true });
    expect(saved.version).toBe(3);
  });
});

describe('the storage keys', () => {
  // the upgrade module cannot import the stores (importing one hydrates it), so it spells
  // the keys out as strings; this checks them against the real ones, so that a rename cannot
  // quietly switch the upgrade off
  it('match the ones the stores themselves declare', async () => {
    const { useOptimizerStore } = await import('../optimizerStore');
    const { useIndustrySupplyStore } = await import('../industrySupplyStore');
    const { SETTINGS_KEY } = await import('../settingsStore');
    expect(useOptimizerStore.persist.getOptions().name).toBe(OPTIMIZER);
    expect(useIndustrySupplyStore.persist.getOptions().name).toBe(SUPPLY);
    expect(SETTINGS_KEY).toBe(SETTINGS);
  });
});

describe('the order things run in at startup', () => {
  // This is why the step lives outside the stores at all: a tab store's migration drops the
  // switch field when the store hydrates, and hydration happens on importing its module. The
  // carry-over therefore has to happen before any such import, and the only guarantee of
  // that is the order of imports in the entry point — ES modules run their imports before
  // the module body.
  it('has the entry point import the upgrade before anything else', async () => {
    const entry = await readFile(new URL('../../main.tsx', import.meta.url), 'utf8');
    const firstImport = entry.split('\n').find((line) => line.startsWith('import '));
    expect(firstImport).toContain('./state/upgradeOnLoad');
  });

  it('reaches the live store, not just the storage', async () => {
    // the subtlest part: the upgrade module must import no store — importing one hydrates it,
    // and that has to happen after the carry-over. A check through localStorage cannot see
    // this go wrong: the stored value is already right while the one in memory is not, and
    // the first write of the settings puts the old track back.
    localStorage.setItem(
      OPTIMIZER,
      JSON.stringify({ state: { allowElectric: true }, version: 1 }),
    );
    vi.resetModules();
    await import('../upgradeOnLoad');
    const { useSettingsStore } = await import('../settingsStore');
    expect(useSettingsStore.getState().calc.trackType).toBe('ELRL');
  });

  it('writes the settings version the store itself uses', async () => {
    // a settings key written from nothing would, without a version, switch off every branch
    // of the store's own migrate
    localStorage.setItem(OPTIMIZER, JSON.stringify({ state: { allowElectric: true }, version: 1 }));
    vi.resetModules();
    await import('../upgradeOnLoad');
    const { SETTINGS_VERSION } = await import('../settingsStore');
    expect(JSON.parse(localStorage.getItem(SETTINGS)!).version).toBe(SETTINGS_VERSION);
  });

  it('lets a later step reach those who already ran an earlier one', () => {
    // gated by version rather than by "has this ever run": otherwise a second branch would
    // reach nobody
    const s = storage({
      [OPTIMIZER]: { state: { allowElectric: true }, version: 1 },
      'ottd-tools-upgrades': { state: {}, version: 0 },
    });
    runStateUpgrades(s);
    expect(trackTypeIn(s)).toBe('ELRL');
  });

  it('carries the value over by the very act of importing the module', async () => {
    localStorage.setItem(
      OPTIMIZER,
      JSON.stringify({ state: { allowElectric: true, maxTrains: 4 }, version: 1 }),
    );
    vi.resetModules();
    await import('../upgradeOnLoad');

    const settings = JSON.parse(localStorage.getItem(SETTINGS) ?? 'null');
    expect(settings.state.calc.trackType).toBe('ELRL');
    // and the switch field is dropped right here, not by the store's migration, which
    // might not get its turn in time
    const optimizer = JSON.parse(localStorage.getItem(OPTIMIZER) ?? 'null');
    expect(optimizer.state).not.toHaveProperty('allowElectric');
    expect(optimizer.state.maxTrains).toBe(4);
  });
});
