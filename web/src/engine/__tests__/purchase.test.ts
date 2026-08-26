import { describe, expect, it } from 'vitest';
import { trains } from '../../dataset';
import { vanillaTrains } from '../../vanilla';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../settings';
import { purchaseEntries, purchaseKey, purchaseRepresentatives } from '../purchase';

const CAPACITY_INDEX = DEFAULT_CALC_SETTINGS.capacityIndex;
// файл считает по машинам Iron Horse, а наборы по умолчанию выключены — включаем их явно
const GAME = { ...DEFAULT_GAME_SETTINGS, ironHorse: true, firs: true };
/** Единственный режим, где расчёт читает грузы по умолчанию (`canCarryIn`). */
const NO_FIRS = { ...GAME, firs: false };

describe('purchase entries', () => {
  it('collapses a family of visual variants into one entry', () => {
    const coilCarriers = trains.filter((t) => t.name === 'Coil Carrier');
    expect(coilCarriers.length).toBeGreaterThan(4);
    const entries = purchaseEntries(coilCarriers, CAPACITY_INDEX, GAME);
    // one entry per generation, not one per sprite
    expect(entries.length).toBeLessThan(coilCarriers.length);
    for (const entry of entries) {
      expect(new Set(entry.members.map((t) => t.id)).size).toBe(entry.members.length);
    }
    expect(entries.flatMap((e) => e.members)).toHaveLength(coilCarriers.length);
  });

  it('keeps every engine: sprite families exist only among wagons', () => {
    const engines = trains.filter((t) => t.kind === 'engine');
    expect(purchaseRepresentatives(engines, CAPACITY_INDEX, GAME)).toHaveLength(engines.length);
  });

  it('leaves the vanilla catalogue untouched', () => {
    expect(purchaseRepresentatives(vanillaTrains, CAPACITY_INDEX, GAME)).toHaveLength(
      vanillaTrains.length,
    );
  });

  it('keeps vehicles that differ only in weight apart', () => {
    const metro = trains.filter(
      (t) => t.id === 'surface_passenger_car_metro_pony_gen_1C' || t.id === 'tube_passenger_car_metro_pony_gen_1C',
    );
    expect(metro).toHaveLength(2);
    expect(metro[0].weight_t).not.toBe(metro[1].weight_t);
    expect(purchaseEntries(metro, CAPACITY_INDEX, GAME)).toHaveLength(2);
  });

  it('splits on default cargo only where the calculation reads it', () => {
    // General Flat Wagon: drop_side carries CSTI/IRON/ZINC, flat_car carries ALUM — the same
    // purchase entry in the game, and the same entry here as long as refit decides what fits
    const flats = trains.filter(
      (t) => t.name === 'General Flat Wagon' && t.id.endsWith('_pony_gen_1A') && t.base_track_type === 'RAIL',
    );
    expect(flats.length).toBeGreaterThan(2);
    const withFirs = purchaseEntries(flats, CAPACITY_INDEX, GAME);
    const withoutFirs = purchaseEntries(flats, CAPACITY_INDEX, NO_FIRS);
    expect(withFirs).toHaveLength(1);
    expect(withoutFirs.length).toBeGreaterThan(1);
  });

  it('shows the non-randomised member, ties settled by identifier', () => {
    for (const entry of purchaseEntries(trains, CAPACITY_INDEX, GAME)) {
      if (entry.members.some((t) => !t.randomised)) {
        expect(entry.train.randomised).toBe(false);
        const plain = entry.members.filter((t) => !t.randomised).map((t) => t.id);
        expect(entry.train.id).toBe([...plain].sort()[0]);
      } else {
        // whole families of randomised wagons are entries of their own in the game too
        expect(entry.members).toHaveLength(1);
      }
    }
  });

  it('picks the same representative however the input is ordered', () => {
    const shuffled = [...trains].reverse();
    const straight = purchaseRepresentatives(trains, CAPACITY_INDEX, GAME).map((t) => t.id).sort();
    const reversed = purchaseRepresentatives(shuffled, CAPACITY_INDEX, GAME).map((t) => t.id).sort();
    expect(reversed).toEqual(straight);
  });

  /**
   * The whole point of showing one member for the whole entry: the numbers behind that member
   * stand for the numbers of every other one. It holds for the current dataset, but it is a
   * property of the data — a future NewGRF release could split an entry the way Metro Coach
   * surface/tube once split it, and this test is how we find out.
   */
  it('entries are homogeneous in everything the calculator reads', () => {
    const profile = (t: (typeof trains)[number], game: typeof GAME) =>
      JSON.stringify([
        t.capacities,
        t.weight_t,
        t.length,
        t.power_hp,
        t.te_coefficient,
        t.speed_mph,
        t.speed_internal,
        t.speed_lgv_internal,
        t.cost_factor,
        t.running_cost_base,
        t.running_cost_factor,
        t.loading_speed,
        t.model_life,
        t.vehicle_life,
        t.dual_headed,
        t.units,
        t.refit.classes,
        t.refit.labels_allowed,
        t.refit.labels_disallowed,
        // грузы по умолчанию читает только режим без FIRS — там они и в ключе
        game.firs ? null : t.default_cargos,
      ]);
    for (const game of [GAME, NO_FIRS]) {
      for (let index = 0; index < 5; index += 1) {
        for (const entry of purchaseEntries(trains, index, game)) {
          const profiles = new Set(entry.members.map((t) => profile(t, game)));
          expect(
            profiles.size,
            `${entry.train.name}: ${entry.members.map((t) => t.id).join(', ')}`,
          ).toBe(1);
        }
      }
    }
  });

  it('keys the entry by what the player can tell apart', () => {
    const [train] = trains;
    expect(purchaseKey(train, CAPACITY_INDEX, GAME)).toContain(train.name);
    expect(purchaseKey(train, CAPACITY_INDEX, GAME)).toContain(String(train.weight_t));
  });
});
