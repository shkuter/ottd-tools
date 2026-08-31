import { describe, expect, it } from 'vitest';
import {
  activeCargos,
  activeEntries,
  activeRailtype,
  activeRailtypes,
  activeTrains,
  inActiveSet,
  trainCapacity,
  canCarry,
  canCarryIn,
  cargoByLabel,
  cargoConsumers,
  economies,
  economyIdForPayment,
  industries,
  trains,
  trainsMeta,
  VANILLA_ECONOMY_ID,
} from '../dataset';
import { DEFAULT_FIRS_ECONOMY, DEFAULT_GAME_SETTINGS } from '../engine/settings';
import type { Cargo, Train } from '../types';

const coal = cargoByLabel.get('COAL')!;
const pass = cargoByLabel.get('PASS')!;
const hopper = trains.find((t) => t.kind === 'wagon' && t.id.startsWith('coal_hopper_car_type_1_pony'))!;

describe('active dataset', () => {
  it('vanilla by default; Iron Horse + FIRS once the sets are switched on', () => {
    // the game loads no NewGRF by itself, so a calculator told nothing about the game is vanilla
    expect(activeTrains(DEFAULT_GAME_SETTINGS).every((t) => t.id.startsWith('vanilla_'))).toBe(true);
    expect(
      activeCargos(DEFAULT_GAME_SETTINGS).every((c) => c.initial_payment_by_economy.VANILLA != null),
    ).toBe(true);

    const sets = { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' as const, firs: true };
    expect(activeTrains(sets)).toBe(trains);
    expect(activeCargos(sets).every((c) => c.initial_payment_by_economy.VANILLA != null)).toBe(false);
  });

  it('a saved label the set hides falls back to buildable track, not to the hidden match', () => {
    // спека track-types «Откат выбора на путь, который можно построить»: LGVN у Iron Horse
    // существует ради совместимости, но скрыт из меню строительства — расчёт не должен
    // идти по нему
    const ih = { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' as const };
    expect(activeRailtypes(ih).find((rt) => rt.label === 'LGVN')!.hidden).toBe(true);
    const fallback = activeRailtype(ih, 'LGVN');
    expect(fallback.hidden).toBe(false);
    expect(fallback.label).not.toBe('LGVN');
    // первый выбираемый путь набора — как велит спека
    expect(fallback.label).toBe(activeRailtypes(ih).filter((rt) => !rt.hidden)[0].label);
  });

  it('a label of another set falls back the same way', () => {
    const vanilla = { ...DEFAULT_GAME_SETTINGS, trainSet: 'vanilla' as const };
    // LGVE — лейбл Iron Horse, у ванили его нет вовсе
    expect(activeRailtypes(vanilla).some((rt) => rt.label === 'LGVE')).toBe(false);
    expect(activeRailtype(vanilla, 'LGVE').hidden).toBe(false);
  });

  it('a consist entry from another set is dropped from the reading, not from the save', () => {
    // спека train-sets: состав хранится независимо от набора; чужая машина
    // отбрасывается при чтении и возвращается вместе со своим набором
    const ih = trains[0];
    const vanilla = { ...DEFAULT_GAME_SETTINGS, trainSet: 'vanilla' as const };
    expect(inActiveSet(ih, vanilla)).toBe(false);
    expect(inActiveSet(ih, { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' as const })).toBe(true);
    const own = activeTrains(vanilla)[0];
    expect(inActiveSet(own, vanilla)).toBe(true);
    expect(activeEntries([{ train: ih }, { train: own }], vanilla)).toEqual([{ train: own }]);
  });

  it('capacity follows the capacity parameter, and survives a stranger index', () => {
    // параметр вместимости — настройка самого набора, и его значение переживает смену
    // набора: индекс, которого у машины нет, не должен ронять расчёт в NaN
    const wagon = trains.find((t) => t.kind === 'wagon' && t.capacities.some((c) => c > 0))!;
    expect(trainCapacity(wagon, 2)).toBe(wagon.capacities[2]);
    expect(trainCapacity(wagon, 99)).toBe(0);
  });

  it('active cargos are exactly the ones the chosen economy has', () => {
    for (const economy of economies) {
      const game = { ...DEFAULT_GAME_SETTINGS, firs: true, firsEconomy: economy.id };
      expect(activeCargos(game).map((c) => c.label), economy.id).toEqual(economy.cargo_labels);
      expect(activeCargos(game).length, economy.id).toBeGreaterThan(0);
    }
    // economies differ by what they hold: Steeltown's set is wider than Temperate Basic's
    const steeltown = activeCargos({ ...DEFAULT_GAME_SETTINGS, firs: true, firsEconomy: 'STEELTOWN' });
    const temperate = activeCargos({ ...DEFAULT_GAME_SETTINGS, firs: true, firsEconomy: 'BASIC_TEMPERATE' });
    expect(steeltown.length).toBeGreaterThan(temperate.length);
    // the dataset index stays complete: a label resolves whatever economy is in force
    const outsideTemperate = steeltown.find((c) => !temperate.includes(c))!;
    expect(cargoByLabel.get(outsideTemperate.label)).toBe(outsideTemperate);
  });
});

describe('a cargo two economies share', () => {
  it('pays the same in both: an economy decides the set, not the rate', () => {
    const shared = economies
      .flatMap((e) => e.cargo_labels)
      .filter((label, i, all) => all.indexOf(label) !== i);
    expect(shared.length).toBeGreaterThan(0);
    for (const label of new Set(shared)) {
      const cargo = cargoByLabel.get(label)!;
      const rates = economies
        .filter((e) => e.cargo_labels.includes(label))
        .map((e) => [
          cargo.initial_payment_by_economy[e.id],
          cargo.price_factor_by_economy[e.id],
        ]);
      // both the payment and the price factor are identical across the economies that list it
      expect(new Set(rates.map((r) => JSON.stringify(r))).size, label).toBe(1);
    }
  });
});

describe('economyIdForPayment', () => {
  it('the economy in the settings, or the vanilla key with FIRS off', () => {
    const firs = { ...DEFAULT_GAME_SETTINGS, firs: true };
    expect(economyIdForPayment(firs)).toBe('STEELTOWN');
    expect(economyIdForPayment({ ...firs, firsEconomy: 'BASIC_ARCTIC' })).toBe('BASIC_ARCTIC');
    // FIRS is off by default, so the default settings already price from the vanilla key
    expect(economyIdForPayment(DEFAULT_GAME_SETTINGS)).toBe(VANILLA_ECONOMY_ID);
  });

  it('an id the data lost is priced by the default economy, not at zero', () => {
    const lost = { ...DEFAULT_GAME_SETTINGS, firs: true, firsEconomy: 'NO_SUCH_ECONOMY' };
    // the rate is looked up by economy id, so a stray id here would price everything at zero
    expect(economyIdForPayment(lost)).toBe(DEFAULT_FIRS_ECONOMY);
    expect(activeCargos(lost).length).toBeGreaterThan(0);
    const fallbackCoal = activeCargos(lost).find((c) => c.label === 'COAL')!;
    expect(
      fallbackCoal.initial_payment_by_economy[economyIdForPayment(lost)],
    ).toBeGreaterThan(0);
  });
});

describe('canCarryIn', () => {
  it('vanilla: default cargo only', () => {
    const vanilla = { ...DEFAULT_GAME_SETTINGS, trainSet: 'vanilla' as const, firs: false };
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

describe('cargoConsumers', () => {
  const steeltown = { ...DEFAULT_GAME_SETTINGS, firs: true, firsEconomy: DEFAULT_FIRS_ECONOMY };

  it('matches the accepts stated in the data, for every cargo of the economy', () => {
    const expected = new Map<string, string[]>();
    for (const industry of industries) {
      const inEconomy = industry.economies[steeltown.firsEconomy];
      if (!inEconomy) continue;
      for (const accepted of inEconomy.accepts) {
        expected.set(accepted.label, [...(expected.get(accepted.label) ?? []), industry.id]);
      }
    }
    expect(expected.size).toBeGreaterThan(0);
    for (const [label, ids] of expected) {
      expect(cargoConsumers(steeltown, label).map((i) => i.id)).toEqual(ids);
    }
  });

  it('a cargo nobody accepts gives an empty list', () => {
    expect(cargoConsumers(steeltown, 'NO SUCH CARGO')).toEqual([]);
  });

  it('with FIRS off there are no consumers at all', () => {
    const vanilla = { ...steeltown, firs: false };
    expect(cargoConsumers(vanilla, 'COAL')).toEqual([]);
  });

  it('the index is not rebuilt: a second call returns the same array', () => {
    const first = cargoConsumers(steeltown, 'COAL');
    expect(cargoConsumers(steeltown, 'COAL')).toBe(first);
  });
});

describe('active railtypes', () => {
  const ironHorseGame = { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' as const };

  it("without Iron Horse the choice is the game's own four", () => {
    expect(activeRailtypes(DEFAULT_GAME_SETTINGS).map((rt) => rt.label)).toEqual([
      'RAIL',
      'ELRL',
      'MONO',
      'MGLV',
    ]);
  });

  it('Iron Horse adds narrow gauge, metro and high speed track', () => {
    // and monorail and maglev are gone with it: the set replaces the buy menu and ships
    // neither of them
    expect(activeRailtypes(ironHorseGame).map((rt) => rt.label)).toEqual([
      'RAIL',
      'ELRL',
      'LGVN',
      'LGVE',
      'NAAN',
      'MTRO',
    ]);
  });

  it('a label the active set does not have falls back to plain rail', () => {
    // switching sets leaves the stored choice pointing at a type that is gone
    expect(activeRailtype(ironHorseGame, 'MGLV').label).toBe('RAIL');
    expect(activeRailtype(DEFAULT_GAME_SETTINGS, 'NAAN').label).toBe('RAIL');
    expect(activeRailtype(ironHorseGame, 'NAAN').label).toBe('NAAN');
  });
});
