import { describe, expect, it } from 'vitest';
import { vanillaCanCarry, vanillaCargos, vanillaTrains } from '../vanilla';
import { activeTrainsMeta } from '../dataset';
import { trainRunningCostPerYear, trainBuyCost } from '../engine/costs';
import { DEFAULT_GAME_SETTINGS } from '../engine/settings';

const vanillaGame = { ...DEFAULT_GAME_SETTINGS, ironHorse: false, firs: false };
const vanillaMeta = activeTrainsMeta(vanillaGame);
/** Prices below show the bare formula, so difficulty stays at the neutral ×8/8. */
const neutralGame = { ...vanillaGame, constructionCost: 1 as const, vehicleCosts: 1 as const };

const kirby = vanillaTrains.find((t) => t.name === 'Kirby Paul Tank')!;
const sh125 = vanillaTrains.find((t) => t.name.includes('SH \'125\''))!;
const coalWagon = vanillaTrains.find((t) => t.kind === 'wagon' && t.default_cargos.includes('COAL'))!;
const mail = vanillaCargos.find((c) => c.label === 'MAIL')!;
const coal = vanillaCargos.find((c) => c.label === 'COAL')!;
const passengers = vanillaCargos.find((c) => c.label === 'PASS')!;

describe('vanilla train adapter', () => {
  it('Kirby Paul Tank: steam engine, cost 7, running by the steam base, no cargo hold', () => {
    expect(kirby.kind).toBe('engine');
    expect(kirby.cost_factor).toBe(7);
    expect(trainBuyCost(kirby, vanillaMeta, neutralGame)).toBe(10937); // no Iron Horse shift on vanilla
    expect(kirby.running_cost_factor).toBe(50);
    expect(kirby.running_cost_base).toBe('RUNNING_COST_STEAM');
    expect(trainRunningCostPerYear(kirby, vanillaMeta, neutralGame)).toBe(1093); // 5600 × 50 / 256
    expect(kirby.power_by_source).toEqual({ STEAM: 300 });
    expect(kirby.length).toBe(8);
    expect(kirby.capacities).toEqual([0, 0, 0, 0, 0]);
    expect(kirby.default_cargos).toEqual([]);
    expect(kirby.base_track_type).toBe('RAIL');
  });

  it('electric engines report OHLE; monorail and maglev sit on their own tracks', () => {
    const electric = vanillaTrains.filter(
      (t) => t.kind === 'engine' && t.running_cost_base === 'RUNNING_COST_ELECTRIC' && t.base_track_type === 'RAIL',
    );
    expect(electric.map((t) => t.name)).toContain("'AsiaStar'");
    for (const t of electric) expect(Object.keys(t.power_by_source ?? {})).toEqual(['OHLE']);
    expect(vanillaTrains.filter((t) => t.base_track_type === 'MONO').length).toBeGreaterThan(0);
    expect(vanillaTrains.filter((t) => t.base_track_type === 'MAGLEV').length).toBeGreaterThan(0);
    expect(vanillaTrains.filter((t) => t.base_track_type === 'RAIL' && t.speed_mph! > 200)).toEqual([]);
  });

  it('labels are the game\'s CargoLabels; climate-dependent wagons list every cargo', () => {
    expect(passengers).toBeDefined();
    expect(vanillaCargos.find((c) => c.label === 'OIL_')).toBeDefined();
    expect(vanillaCargos.every((c) => c.label.length === 4)).toBe(true);
    const grain = vanillaTrains.find((t) => t.name === 'Grain Hopper')!;
    expect(grain.default_cargos).toEqual(['GRAI', 'WHEA', 'MAIZ']);
  });

  it('SH 125: dual-headed, power and weight doubled', () => {
    expect(sh125.dual_headed).toBe(true);
    // engines.h: RVI(6, M, 20, 200, 4500 hp, 70 t, ...) per head
    expect(sh125.power_hp).toBe(2 * 4500);
    expect(sh125.weight_t).toBe(2 * 70);
  });

  it('wagons: single capacity repeated for all five GRF slots, one default cargo, no refit', () => {
    expect(coalWagon.capacities.every((c) => c === coalWagon.capacities[0])).toBe(true);
    expect(coalWagon.capacities[0]).toBeGreaterThan(0);
    expect(coalWagon.default_cargos).toEqual(['COAL']);
    expect(coalWagon.refit.classes).toEqual([]);
    expect(coalWagon.loading_speed).toBe(5);
  });
});

describe('vanilla cargo adapter', () => {
  it('payment lives under the VANILLA key, units follow freight flag', () => {
    expect(coal.initial_payment_by_economy).toEqual({ VANILLA: 5916 });
    expect(coal.units).toBe('tonnes');
    expect(mail.units).toBe('items');
    expect(mail.transit_periods).toEqual([20, 90]);
  });

  it('vanilla wagons carry only their default cargo', () => {
    expect(vanillaCanCarry(coalWagon, coal)).toBe(true);
    expect(vanillaCanCarry(coalWagon, mail)).toBe(false);
  });
});
