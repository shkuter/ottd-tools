/**
 * The catalogue's two computed figures.
 *
 * Vehicles are picked out of the real roster by the property under test rather than by id, so
 * a data update moves the numbers without breaking the assertions. What each case asserts is
 * a relation to the cells the row already prints — the whole point of both columns is that the
 * player can check them by eye.
 */
import { describe, expect, it } from 'vitest';
import { capacityPerTile, capacityTimesSpeed } from '../metrics';
import { activeRailtype, activeTrains, trainCapacity } from '../../../dataset';
import { topSpeedOn } from '../../../engine/tracktypes';
import { displaySpeed, UNITS_PER_TILE } from '../../../engine/units';
import { DEFAULT_CALC_SETTINGS, DEFAULT_GAME_SETTINGS } from '../../../engine/settings';

// Iron Horse, because the figures under test need a roster that states wagon speeds, several
// lengths and a capacity parameter; the vanilla set — the default — is used where the point is
// a roster that states none of that.
const game = { ...DEFAULT_GAME_SETTINGS, trainSet: 'iron_horse' as const };
const calc = DEFAULT_CALC_SETTINGS;
const rail = activeRailtype(game, calc.trackType);
const roster = activeTrains(game);
const carries = (train: (typeof roster)[number]) => trainCapacity(train, calc.capacityIndex) > 0;

describe('capacity per tile', () => {
  it('doubles the capacity of a half-tile vehicle', () => {
    const vehicle = roster.find((t) => t.length === UNITS_PER_TILE / 2 && carries(t))!;
    expect(vehicle).toBeDefined();
    expect(capacityPerTile(vehicle, calc)).toBe(trainCapacity(vehicle, calc.capacityIndex) * 2);
  });

  it('leaves the capacity of a full-tile vehicle alone', () => {
    const vehicle = roster.find((t) => t.length === UNITS_PER_TILE && carries(t))!;
    expect(vehicle).toBeDefined();
    expect(capacityPerTile(vehicle, calc)).toBe(trainCapacity(vehicle, calc.capacityIndex));
  });

  it('counts both halves of a dual-headed vehicle', () => {
    // the game builds the rear half as a second vehicle of the same type, so the pair is twice
    // as long as the data state — and it carries twice as much, which the figure must not double
    const vanilla = DEFAULT_GAME_SETTINGS;
    const dmu = activeTrains(vanilla).find((t) => t.dual_headed && trainCapacity(t, calc.capacityIndex) > 0)!;
    expect(dmu).toBeDefined();
    // two halves of half a tile each are one tile of platform, so the figure is the hold of both
    expect(dmu.length).toBe(UNITS_PER_TILE / 2);
    expect(capacityPerTile(dmu, calc)).toBe(dmu.capacities[calc.capacityIndex] * 2);
  });

  it('counts both halves of a dual-headed vehicle of this set too', () => {
    const pair = roster.find((t) => t.dual_headed && trainCapacity(t, calc.capacityIndex) > 0)!;
    expect(pair).toBeDefined();
    expect(pair.length).toBe(UNITS_PER_TILE / 2);
    // the hold of both halves over the tile both halves take up
    expect(capacityPerTile(pair, calc)).toBe(pair.capacities[calc.capacityIndex] * 2);
  });

  it('has no figure for a vehicle that carries nothing', () => {
    const vehicle = roster.find((t) => !carries(t))!;
    expect(vehicle).toBeDefined();
    expect(capacityPerTile(vehicle, calc)).toBeNull();
  });

  it('follows the capacity column when the capacity parameter changes', () => {
    const vehicle = roster.find(
      (t) => t.length === UNITS_PER_TILE / 2 && t.capacities[0] !== t.capacities[4],
    )!;
    expect(vehicle).toBeDefined();
    for (const capacityIndex of [0, 4]) {
      // still a half-tile vehicle, so still twice whatever the capacity column now shows
      expect(capacityPerTile(vehicle, { ...calc, capacityIndex })).toBe(
        trainCapacity(vehicle, capacityIndex) * 2,
      );
    }
  });
});

/**
 * One vehicle with its figures written out, the way the extractor's own reference values are:
 * Mail Van of Iron Horse 4.29.0 — capacity 16 at the default parameter, 8 units long, 96 in the
 * game's internal speed unit. A data update moves these numbers, and moving them is a decision
 * to take deliberately rather than a test to relax.
 */
describe('a vehicle with its numbers written out', () => {
  const mailVan = roster.find((t) => t.id === 'mail_car_combos_pony_gen_1C')!;

  it('reads 32 per tile, 1536 in km/h and 960 in mph', () => {
    expect(mailVan).toBeDefined();
    expect(capacityPerTile(mailVan, calc)).toBe(32);
    expect(capacityTimesSpeed(mailVan, rail, game, calc, 'metric')).toBe(1536);
    expect(capacityTimesSpeed(mailVan, rail, game, calc, 'imperial')).toBe(960);
  });
});

describe('capacity times speed', () => {
  const wagon = roster.find((t) => t.kind === 'wagon' && carries(t) && t.speed_mph != null)!;

  it('is the product of the two cells beside it, in both units', () => {
    for (const unit of ['metric', 'imperial'] as const) {
      const shown = displaySpeed(topSpeedOn(wagon, rail)!, unit);
      expect(capacityTimesSpeed(wagon, rail, game, calc, unit)).toBe(
        trainCapacity(wagon, calc.capacityIndex) * shown,
      );
    }
  });

  it('takes the high speed line figure of a vehicle built for it', () => {
    const lgvTrack = activeRailtype(game, 'LGVE');
    const highSpeed = roster.find(
      (t) => t.lgv_capable && carries(t) && t.speed_lgv_mph && t.speed_lgv_mph > t.speed_mph!,
    )!;
    expect(highSpeed).toBeDefined();
    const onLgv = capacityTimesSpeed(highSpeed, lgvTrack, game, calc, 'metric')!;
    const onPlain = capacityTimesSpeed(highSpeed, rail, game, calc, 'metric')!;
    expect(onLgv).toBeGreaterThan(onPlain);
    expect(onLgv).toBe(
      trainCapacity(highSpeed, calc.capacityIndex) *
        displaySpeed(topSpeedOn(highSpeed, lgvTrack)!, 'metric'),
    );
  });

  it('counts both halves of a dual-headed vehicle here too', () => {
    const pair = roster.find(
      (t) => t.dual_headed && trainCapacity(t, calc.capacityIndex) > 0 && t.speed_mph != null,
    )!;
    expect(pair).toBeDefined();
    expect(capacityTimesSpeed(pair, rail, game, calc, 'metric')).toBe(
      pair.capacities[calc.capacityIndex] * 2 * displaySpeed(topSpeedOn(pair, rail)!, 'metric'),
    );
  });

  it('has no figure for a wagon that states no speed of its own', () => {
    const vanilla = DEFAULT_GAME_SETTINGS;
    const vanillaRail = activeRailtype(vanilla, DEFAULT_CALC_SETTINGS.trackType);
    const wagons = activeTrains(vanilla).filter(
      (t) => t.kind === 'wagon' && trainCapacity(t, calc.capacityIndex) > 0,
    );
    expect(wagons.length).toBeGreaterThan(0);
    for (const t of wagons) {
      expect(capacityTimesSpeed(t, vanillaRail, vanilla, calc, 'metric')).toBeNull();
    }
  });

  it('has no figure for a wagon when wagon speed limits are off', () => {
    const off = { ...game, wagonSpeedLimits: false };
    expect(capacityTimesSpeed(wagon, rail, off, calc, 'metric')).toBeNull();
  });

  it('still answers for an engine that carries cargo when they are off', () => {
    const off = { ...game, wagonSpeedLimits: false };
    const railcar = roster.find((t) => t.kind === 'engine' && carries(t) && t.speed_mph != null)!;
    expect(railcar).toBeDefined();
    expect(capacityTimesSpeed(railcar, rail, off, calc, 'metric')).toBeGreaterThan(0);
  });
});
