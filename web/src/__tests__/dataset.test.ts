import { describe, expect, it } from 'vitest';
import { activeCargos, activeTrains, canCarry, canCarryIn, cargoByLabel, trains, trainsMeta } from '../dataset';
import { DEFAULT_GAME_SETTINGS } from '../engine/settings';
import type { Cargo, Train } from '../types';

const coal = cargoByLabel.get('COAL')!;
const pass = cargoByLabel.get('PASS')!;
const hopper = trains.find((t) => t.kind === 'wagon' && t.id.startsWith('coal_hopper_car_type_1_pony'))!;

describe('active dataset', () => {
  it('Iron Horse + FIRS by default; vanilla when both are off', () => {
    expect(activeTrains(DEFAULT_GAME_SETTINGS)).toBe(trains);
    const vanilla = { ...DEFAULT_GAME_SETTINGS, ironHorse: false, firs: false };
    expect(activeTrains(vanilla).every((t) => t.id.startsWith('vanilla_'))).toBe(true);
    expect(activeCargos(vanilla).every((c) => c.initial_payment_by_economy.VANILLA != null)).toBe(true);
  });
});

describe('canCarryIn', () => {
  it('vanilla: default cargo only', () => {
    const vanilla = { ...DEFAULT_GAME_SETTINGS, ironHorse: false, firs: false };
    const wagon = activeTrains(vanilla).find((t) => t.kind === 'wagon' && t.default_cargos.includes('COAL'))!;
    const vCoal = activeCargos(vanilla).find((c) => c.label === 'COAL')!;
    const vMail = activeCargos(vanilla).find((c) => c.label === 'MAIL')!;
    expect(canCarryIn(vanilla, wagon, vCoal)).toBe(true);
    expect(canCarryIn(vanilla, wagon, vMail)).toBe(false);
  });

  it('Iron Horse without FIRS: labels only, no class matching', () => {
    const noFirs = { ...DEFAULT_GAME_SETTINGS, firs: false };
    const vCoal = activeCargos(noFirs).find((c) => c.label === 'COAL')!;
    expect(canCarryIn(noFirs, hopper, vCoal)).toBe(true);
    const vMail = activeCargos(noFirs).find((c) => c.label === 'MAIL')!;
    expect(canCarryIn(noFirs, hopper, vMail)).toBe(false);
    // real CargoLabels: an Iron Horse passenger coach takes vanilla passengers
    const vPass = activeCargos(noFirs).find((c) => c.label === 'PASS')!;
    const coach = trains.find((t) => t.kind === 'wagon' && t.default_cargos.includes('PASS'))!;
    expect(canCarryIn(noFirs, coach, vPass)).toBe(true);
    const vOil = activeCargos(noFirs).find((c) => c.label === 'OIL_')!;
    expect(trains.some((t) => t.kind === 'wagon' && canCarryIn(noFirs, t, vOil))).toBe(true);
  });

  it('full NewGRF refit: hopper takes coal, not passengers', () => {
    expect(canCarryIn(DEFAULT_GAME_SETTINGS, hopper, coal)).toBe(true);
    expect(canCarryIn(DEFAULT_GAME_SETTINGS, hopper, pass)).toBe(false);
  });
});

describe('canCarry (refit classes)', () => {
  const group = Object.keys(trainsMeta.refit_groups)[0];
  const rules = trainsMeta.refit_groups[group];
  const wagon = { refit: { classes: [group], labels_allowed: [], labels_disallowed: ['XXXX'] } } as unknown as Train;
  const mk = (classes: string[], label = 'TEST') => ({ label, classes }) as unknown as Cargo;

  it('allowed class → yes; allowed + disallowed class → no', () => {
    expect(rules.allowed.length).toBeGreaterThan(0);
    expect(canCarry(wagon, mk([rules.allowed[0]]))).toBe(true);
    if (rules.disallowed.length) {
      expect(canCarry(wagon, mk([rules.allowed[0], rules.disallowed[0]]))).toBe(false);
    }
  });

  it('explicit labels win over classes', () => {
    expect(canCarry(wagon, mk([rules.allowed[0]], 'XXXX'))).toBe(false);
    const w2 = { refit: { classes: [], labels_allowed: ['YYYY'], labels_disallowed: [] } } as unknown as Train;
    expect(canCarry(w2, mk([], 'YYYY'))).toBe(true);
    expect(canCarry(w2, mk(rules.allowed, 'ZZZZ'))).toBe(false);
  });
});
