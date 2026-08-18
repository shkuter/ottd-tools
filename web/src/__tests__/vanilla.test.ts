import { describe, expect, it } from 'vitest';
import { vanillaCanCarry, vanillaCargos, vanillaTrains } from '../vanilla';

const kirby = vanillaTrains.find((t) => t.name === 'Kirby Paul Tank')!;
const sh125 = vanillaTrains.find((t) => t.name.includes('SH \'125\''))!;
const coalWagon = vanillaTrains.find((t) => t.kind === 'wagon' && t.default_cargos.includes('COAL'))!;
const mail = vanillaCargos.find((c) => c.label === 'MAIL')!;
const coal = vanillaCargos.find((c) => c.label === 'COAL')!;

describe('vanilla train adapter', () => {
  it('Kirby Paul Tank: engine, cost 7, standard length, no cargo hold', () => {
    expect(kirby.kind).toBe('engine');
    expect(kirby.cost_factor).toBe(7);
    expect(kirby.running_cost_factor).toBe(50);
    expect(kirby.length).toBe(8);
    expect(kirby.capacities).toEqual([0, 0, 0, 0, 0]);
    expect(kirby.base_track_type).toBe('RAIL');
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
