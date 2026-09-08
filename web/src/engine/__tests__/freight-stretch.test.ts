/**
 * The braking stretch of the freight multiplier: with it on, the game lengthens the distance a
 * train brakes over by half the addition per loaded freight vehicle
 * (`train_cmd.cpp: UpdateAcceleration`, `length += ((cached_veh_length * adjust) + 1) / 2`).
 *
 * The case is about the data reaching that formula rather than about the formula itself. The
 * calculation walks a vehicle's sections and reads each one's capacity by the GRF parameter slot
 * the settings name; a set that fills only the first slot goes silent everywhere but there, and
 * the stretch disappears for its whole roster without anything looking wrong.
 */
import { describe, expect, it } from 'vitest';
import { activeCargos, activeRailtype, activeTrains } from '../../dataset';
import { consistPhysics } from '../consist';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../settings';

const SLOTS = [0, 1, 2, 3, 4];

describe('the freight multiplier stretches the braking length', () => {
  for (const trainSet of ['vanilla', 'iron_horse'] as const) {
    it(`reads the same figure in every capacity slot in ${trainSet}`, () => {
      const game = {
        ...DEFAULT_GAME_SETTINGS,
        trainSet,
        firs: false,
        freightTrains: 2,
        accelerationModel: 'realistic' as const,
      };
      const roster = activeTrains(game);
      const track = activeRailtype(game, DEFAULT_CALC_SETTINGS.trackType);
      const coal = activeCargos(game).find((c) => c.label === 'COAL')!;
      expect(coal.is_freight).toBe(true);
      const engine = roster.find((t) => t.kind === 'engine' && t.power_hp > 0)!;
      const wagon = roster.find(
        (t) => t.kind === 'wagon' && t.default_cargos.includes('COAL') && t.units.length > 0,
      )!;
      const entries = [
        { train: engine, count: 1 },
        { train: wagon, count: 9 },
      ];
      const lengths = SLOTS.map(
        (slot) => consistPhysics(entries, coal, slot, game, track).physics,
      );
      // every slot answers the same, because the vehicle carries the same in all of them
      const stretched = lengths.map((p) => p.brakingLengthUnits);
      expect(new Set(stretched).size).toBe(1);
      // and the answer is longer than the train itself: nine loaded wagons were stretched
      const plain = consistPhysics(
        entries, coal, DEFAULT_CALC_SETTINGS.capacityIndex, { ...game, freightTrains: 1 }, track,
      ).physics;
      expect(stretched[0]).toBeGreaterThan(plain.brakingLengthUnits);
    });
  }
});
