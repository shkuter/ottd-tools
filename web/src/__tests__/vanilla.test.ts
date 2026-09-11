import { describe, expect, it } from 'vitest';
import { vanillaCanCarry, vanillaCargos, vanillaTrains } from '../vanilla';
import { activeTrainsMeta } from '../dataset';
import { vehicleWeightT } from '../engine/vehicle';
import { trainRunningCostPerYear, trainBuyCost } from '../engine/costs';
import { DEFAULT_GAME_SETTINGS } from '../engine/settings';

const vanillaGame = { ...DEFAULT_GAME_SETTINGS, trainSet: 'vanilla' as const, firs: false };
const vanillaMeta = activeTrainsMeta(vanillaGame);
/** Prices below show the bare formula, so difficulty stays at the neutral ×8/8. */
const neutralGame = { ...vanillaGame, constructionCost: 1 as const, vehicleCosts: 1 as const };

// by id: the name is a display string and follows the game's locale
const kirby = vanillaTrains.find((t) => t.id === 'vanilla_0')!;
const sh125 = vanillaTrains.find((t) => t.name.includes('SH \'125\''))!;
const coalWagon = vanillaTrains.find((t) => t.kind === 'wagon' && t.default_cargos.includes('COAL'))!;
const mail = vanillaCargos.find((c) => c.label === 'MAIL')!;
const coal = vanillaCargos.find((c) => c.label === 'COAL')!;
const passengers = vanillaCargos.find((c) => c.label === 'PASS')!;

describe('vanilla train adapter', () => {
  it('states the capacity of one vehicle, leaving the pair to trainCapacity', () => {
    // the game's table gives 38 for the DMU and the game builds two of them; the adapter used to
    // double it here, which made the field mean one thing in vanilla and another in Iron Horse
    const dmu = vanillaTrains.find((t) => t.name.includes('Manley-Morel'))!;
    expect(dmu.dual_headed).toBe(true);
    expect(dmu.capacities).toEqual([38, 38, 38, 38, 38]);
    expect(dmu.units[0].capacities).toEqual([38, 38, 38, 38, 38]);
  });

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
    // the name comes from the game's locale whole, traction suffix and all
    expect(electric.map((t) => t.name)).toContain("'AsiaStar' (Electric)");
    for (const t of electric) expect(Object.keys(t.power_by_source ?? {})).toEqual(['OHLE']);
    expect(vanillaTrains.filter((t) => t.base_track_type === 'MONO').length).toBeGreaterThan(0);
    expect(vanillaTrains.filter((t) => t.base_track_type === 'MAGLEV').length).toBeGreaterThan(0);
    expect(vanillaTrains.filter((t) => t.base_track_type === 'RAIL' && t.speed_mph! > 200)).toEqual([]);
  });

  it('labels are the game\'s CargoLabels; climate-dependent wagons list every cargo', () => {
    expect(passengers).toBeDefined();
    expect(vanillaCargos.find((c) => c.label === 'OIL_')).toBeDefined();
    expect(vanillaCargos.every((c) => c.label.length === 4)).toBe(true);
    const grain = vanillaTrains.find((t) => t.id === 'vanilla_33')!;
    expect(grain.default_cargos).toEqual(['GRAI', 'WHEA', 'MAIZ']);
  });

  it('SH 125: dual-headed, properties as the game states them', () => {
    expect(sh125.dual_headed).toBe(true);
    // engines.h: RVI(6, M, 20, 200, 4500 hp, 70 t, ...). engine_type.h says what those mean for
    // a multiheaded engine: power is the sum of both halves, weight is what one half has. The
    // adapter states them as the table does; doubling the weight is the engine's job, and it
    // does it for either set — see vehicleWeightT.
    expect(sh125.power_hp).toBe(4500);
    expect(sh125.weight_t).toBe(70);
    expect(vehicleWeightT(sh125)).toBe(140);
  });

  it('states the capacity in every slot of the section too', () => {
    // the base game has no capacity parameter, so its figure holds whichever slot the setting
    // names — and a calculation that indexes the section by that setting must not read a hole
    expect(coalWagon.units).toHaveLength(1);
    expect(coalWagon.units[0].capacities).toEqual(coalWagon.capacities);
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
