/**
 * Infrastructure upkeep against the game.
 *
 * The eight reference rows come from the infrastructure window of a real game (Londworth
 * Transport, linear growth on, medium difficulty), recorded in the change's
 * research-formulas.md. They are in the currency that game displayed — roubles — so the
 * test converts, which is also what keeps the model honest about the figures being pounds.
 *
 * Counts are pieces of track, not tiles: the game bills a track bit (company_sl.cpp
 * AfterLoadCompanyStats counts `CountBits(GetTrackBits(tile))`), so a double-track tile
 * carries two.
 */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_NETWORK,
  categoryMonthlyCost,
  infrastructureBasePrice,
  intSqrt,
  maintenanceScale,
  networkMaintenance,
  type NetworkCounts,
  type RailtypeMultipliers,
} from '../infrastructure';
import { price } from '../costs';
import { DEFAULT_GAME_SETTINGS, type GameSettings } from '../settings';

/** currency.cpp:52 — the rouble is fifty to the pound; the window showed roubles. */
const ROUBLE = 50;

/** table/railtypes.h. */
const VANILLA: RailtypeMultipliers = [
  { label: 'RAIL', maintenance_multiplier: 8 },
  { label: 'ELRL', maintenance_multiplier: 12 },
];

/**
 * The reference game: linear growth, medium difficulty (the game's default, not the
 * calculator's), and prices carrying that game's inflation — 1926 is the year whose factor
 * (1.1253) yields its base prices, 11 for track and road and 112 for a station tile.
 */
const GAME: GameSettings = {
  ...DEFAULT_GAME_SETTINGS,
  jgrpp: true,
  infrastructureMaintenance: true,
  linearMaintenance: true,
  vehicleCosts: 1,
  inflation: true,
};
const YEAR = 1926;

function network(counts: Partial<NetworkCounts>): NetworkCounts {
  return { ...EMPTY_NETWORK, ...counts };
}

function roubles(counts: Partial<NetworkCounts>, game = GAME, year = YEAR): number {
  return networkMaintenance(network(counts), VANILLA, game, year).yearly * ROUBLE;
}

describe("the reference game's figures", () => {
  it.each([
    ['10,372 pieces of plain track', { rail: { RAIL: 10372 } }, 19_252_800],
    ['10,564 pieces of plain track', { rail: { RAIL: 10564 } }, 19_609_200],
    ['10,803 pieces of electrified track', { rail: { ELRL: 10803 } }, 30_079_200],
    ['1,612 signals', { signals: 1612 }, 20_571_600],
    ['723 signals', { signals: 723 }, 9_226_200],
    ['514 station tiles', { stations: 514 }, 6_206_400],
    ['104 pieces of road', { road: { ROAD: 104 } }, 88_200],
    ['104 pieces of tram track', { tram: { ELRL: 104 } }, 132_600],
  ])('%s', (_name, counts, expected) => {
    expect(roubles(counts as Partial<NetworkCounts>)).toBe(expected);
  });
});

describe('the monthly figure is truncated', () => {
  it('charges 1800 a piece for six pieces, not 1856.25', () => {
    // 11 × 8 × 6 × 72 / 2048 = 18.5625 → 18 a month → 10,800 a year
    expect(roubles({ rail: { RAIL: 6 } })).toBe(10_800);
    // working in fractions and rounding at the end would give 11,137
    expect(roubles({ rail: { RAIL: 6 } })).not.toBe(11_137);
  });

  it('truncates before multiplying by twelve', () => {
    const line = networkMaintenance(network({ rail: { RAIL: 6 } }), VANILLA, GAME, YEAR).lines[0];
    expect(line.monthly).toBe(18);
    expect(line.yearly).toBe(18 * 12);
  });
});

describe('track type multipliers', () => {
  it('charges electrified track more, by its own multiplier', () => {
    expect(roubles({ rail: { RAIL: 10372 } })).toBe(19_252_800);
    expect(roubles({ rail: { ELRL: 10372 } })).toBe(28_879_200);
  });

  it('drifts off one and a half on a small network — each line truncates on its own', () => {
    const plain = networkMaintenance(network({ rail: { RAIL: 5 } }), VANILLA, GAME, YEAR).monthly;
    const wired = networkMaintenance(network({ rail: { ELRL: 5 } }), VANILLA, GAME, YEAR).monthly;
    expect(plain).toBe(15);
    expect(wired).toBe(23);
    expect(wired / plain).not.toBe(1.5);
  });
});

describe("the game's IntSqrt", () => {
  it('rounds to the nearest integer rather than truncating', () => {
    // 101² = 10201, 102² = 10404: the remainder 171 is over 101, so it rounds up
    expect(intSqrt(10372)).toBe(102);
    expect(intSqrt(10201)).toBe(101);
    // 10251 = 101² + 50: the remainder is under 101, so it rounds down
    expect(intSqrt(10251)).toBe(101);
    expect(intSqrt(0)).toBe(0);
    expect(intSqrt(1)).toBe(1);
    expect(intSqrt(2)).toBe(1);
    expect(intSqrt(3)).toBe(2);
  });
});

describe('the vanilla growth branch', () => {
  const vanillaGrowth: GameSettings = { ...GAME, jgrpp: false, linearMaintenance: false };

  it('scales by 1 + IntSqrt(network size)', () => {
    expect(maintenanceScale(10372, 'rail', vanillaGrowth)).toBe(103);
    expect(maintenanceScale(10372, 'rail', GAME)).toBe(72);
  });

  it('costs what the source formula says', () => {
    // rail.h: (_price[PR_INFRASTRUCTURE_RAIL] × multiplier × num × (1 + IntSqrt(total))) >> 11
    const monthly = categoryMonthlyCost('rail', 8, 10372, 10372, vanillaGrowth, YEAR);
    expect(monthly).toBe(Math.floor((11 * 8 * 10372 * 103) / 2 ** 11));
  });

  it('more than doubles the cost when the network doubles', () => {
    const one = categoryMonthlyCost('rail', 8, 1000, 1000, vanillaGrowth, YEAR);
    const two = categoryMonthlyCost('rail', 8, 2000, 2000, vanillaGrowth, YEAR);
    expect(two).toBeGreaterThan(2 * one);
    // under linear growth it is exactly double; the counts are multiples of 32, where the
    // monthly figure divides evenly — otherwise truncation would shift the doubled line by one
    expect(categoryMonthlyCost('rail', 8, 2048, 2048, GAME, YEAR)).toBe(
      2 * categoryMonthlyCost('rail', 8, 1024, 1024, GAME, YEAR),
    );
  });

  it('stays linear to within the truncation on a count with a remainder', () => {
    const one = categoryMonthlyCost('rail', 8, 1000, 1000, GAME, YEAR);
    const two = categoryMonthlyCost('rail', 8, 2000, 2000, GAME, YEAR);
    expect(two - 2 * one).toBe(1);
  });
});

describe('network size is read as the game reads it', () => {
  it('shares one total across every railtype', () => {
    const mixed = networkMaintenance(
      network({ rail: { RAIL: 6000, ELRL: 4372 } }),
      VANILLA,
      { ...GAME, linearMaintenance: false },
      YEAR,
    );
    // both lines scale off the 10,372 pieces together, not off their own 6000 and 4372
    const scale = 1 + intSqrt(10372);
    expect(mixed.lines[0].monthly).toBe(Math.floor((11 * 8 * 6000 * scale) / 2 ** 11));
    expect(mixed.lines[1].monthly).toBe(Math.floor((11 * 12 * 4372 * scale) / 2 ** 11));
  });

  it('leaves out a type the set does not have', () => {
    // counts outlive a change of set: narrow gauge typed in under Iron Horse, then vanilla
    // picked. It gets no line — and it must not enter the network size either, or the
    // vanilla growth branch would quietly raise the price of every other type
    const withStale = networkMaintenance(
      network({ rail: { RAIL: 1000, NAAN: 9000 } }),
      VANILLA,
      { ...GAME, linearMaintenance: false },
      YEAR,
    );
    const clean = networkMaintenance(
      network({ rail: { RAIL: 1000 } }),
      VANILLA,
      { ...GAME, linearMaintenance: false },
      YEAR,
    );
    expect(withStale.lines).toHaveLength(1);
    expect(withStale.yearly).toBe(clean.yearly);
  });

  it('follows the set when the set states other multipliers', () => {
    // the same track, another set's table — the price follows the set with no code change
    const ownSet: RailtypeMultipliers = [{ label: 'RAIL', maintenance_multiplier: 5 }];
    const vanilla = networkMaintenance(network({ rail: { RAIL: 1000 } }), VANILLA, GAME, YEAR);
    const other = networkMaintenance(network({ rail: { RAIL: 1000 } }), ownSet, GAME, YEAR);
    expect(other.yearly).toBeLessThan(vanilla.yearly);
    expect(other.lines[0].monthly).toBe(Math.floor((11 * 5 * 1000 * 72) / 2 ** 11));
  });

  it('bills roads and trams off separate totals', () => {
    // company_gui.cpp: RoadTypeIsRoad(rt) ? road_total : tram_total
    const both = networkMaintenance(
      network({ road: { ROAD: 900 }, tram: { ELRL: 100 } }),
      VANILLA,
      { ...GAME, linearMaintenance: false },
      YEAR,
    );
    const roadLine = both.lines.find((l) => l.category === 'road')!;
    const tramLine = both.lines.find((l) => l.category === 'tram')!;
    expect(roadLine.monthly).toBe(Math.floor((11 * 16 * 900 * (1 + intSqrt(900))) / 2 ** 12));
    expect(tramLine.monthly).toBe(Math.floor((11 * 24 * 100 * (1 + intSqrt(100))) / 2 ** 12));
  });
});

describe('the settings multipliers', () => {
  it('follows the vehicle-costs difficulty, not the construction one', () => {
    const base = roubles({ rail: { RAIL: 10372 } });
    expect(roubles({ rail: { RAIL: 10372 } }, { ...GAME, vehicleCosts: 2 })).not.toBe(base);
    expect(roubles({ rail: { RAIL: 10372 } }, { ...GAME, constructionCost: 2 })).toBe(base);
  });

  it('reads the same price inflation vehicles read', () => {
    const withInflation = roubles({ rail: { RAIL: 10372 } });
    const without = roubles({ rail: { RAIL: 10372 } }, { ...GAME, inflation: false });
    expect(without).toBeLessThan(withInflation);
    // with no inflation the base price is the vanilla base itself
    expect(without).toBe(Math.floor((10 * 8 * 10372 * 72) / 2 ** 11) * 12 * ROUBLE);
    // and it is the model vehicle prices read, not a second one beside it: the settings that
    // steer inflation move both statutes together, in the same direction
    const faster: GameSettings = { ...GAME, inflationInterest: 4 };
    const engine = (game: GameSettings) =>
      price('build_engine', 256, 0, YEAR, game.inflation, 1, game.inflationInterest, true, game.startingYear);
    expect(engine(faster)).toBeGreaterThan(engine(GAME));
    expect(roubles({ rail: { RAIL: 10372 } }, faster)).toBeGreaterThan(withInflation);
    expect(engine({ ...GAME, inflation: false })).toBeLessThan(engine(GAME));
  });

  it('applies the Base Costs multiplier only when the GRF is on', () => {
    const base = roubles({ rail: { RAIL: 10372 } });
    expect(roubles({ rail: { RAIL: 10372 } }, { ...GAME, basecostInfrastructure: 8 })).toBe(base);
    expect(
      roubles({ rail: { RAIL: 10372 } }, { ...GAME, basecostGrf: true, basecostInfrastructure: 8 }),
    ).toBeGreaterThan(base);
  });

  it('never lets the base price fall to zero, as the game never does', () => {
    // economy.cpp RecomputePrices: a zero base price breaks the game's commands, so it is
    // clamped to one. These bases (8…100) reach it: 10 × 6/8 × 1/16 = 0.47
    const cheap: GameSettings = {
      ...GAME,
      inflation: false,
      vehicleCosts: 0,
      basecostGrf: true,
      basecostInfrastructure: 1 / 16,
    };
    expect(infrastructureBasePrice('rail', cheap, YEAR)).toBe(1);
    expect(roubles({ rail: { RAIL: 10372 } }, cheap)).toBeGreaterThan(0);
  });

  it('does not wrap to 32 bits on a large network with a Base Costs multiplier', () => {
    const huged: GameSettings = { ...GAME, basecostGrf: true, basecostInfrastructure: 8192 };
    const huge = networkMaintenance(network({ rail: { RAIL: 60000 } }), VANILLA, huged, YEAR);
    // ≈1.5e9 — past int32, a bitwise shift would wrap. The base price comes from the model
    // itself: the GRF multiplier enters it before rounding, as in economy.cpp RecomputePrices
    const base = infrastructureBasePrice('rail', huged, YEAR);
    expect(huge.monthly).toBe(Math.floor((base * 8 * 60000 * 72) / 2 ** 11));
    // what this catches is the bitwise shift: the product before it is 3.2e12, and `>> 11`
    // in JS truncates that to int32 first, giving an entirely different number
    const product = base * 8 * 60000 * 72;
    expect(product).toBeGreaterThan(2 ** 31);
    expect(huge.monthly).not.toBe(product >> 11);
  });
});

describe('linear growth belongs to the patchpack', () => {
  it('does not apply in a game that is not on JGRPP', () => {
    // the switch survives an import from a JGRPP game; a vanilla game grows upkeep by the
    // square root whatever it holds, and nothing in the interface would show otherwise
    const vanillaGame: GameSettings = { ...GAME, jgrpp: false };
    const asVanilla: GameSettings = { ...GAME, jgrpp: false, linearMaintenance: false };
    expect(roubles({ rail: { RAIL: 10372 } }, vanillaGame)).toBe(
      roubles({ rail: { RAIL: 10372 } }, asVanilla),
    );
    expect(maintenanceScale(10372, 'rail', vanillaGame)).toBe(103);
  });
});

describe('the whole item switched off', () => {
  it('charges nothing whatever the counts', () => {
    const off = networkMaintenance(
      network({ rail: { RAIL: 10372 }, signals: 1612, stations: 514 }),
      VANILLA,
      { ...GAME, infrastructureMaintenance: false },
      YEAR,
    );
    expect(off.yearly).toBe(0);
    expect(off.lines.every((line) => line.yearly === 0)).toBe(true);
  });
});

describe('what the lines are', () => {
  it('totals its lines, and gives an empty category none', () => {
    const result = networkMaintenance(
      network({ rail: { RAIL: 1000, ELRL: 0 }, signals: 100, stations: 20 }),
      VANILLA,
      GAME,
      YEAR,
    );
    expect(result.lines.map((l) => l.category)).toEqual(['rail', 'signal', 'station']);
    expect(result.yearly).toBe(result.lines.reduce((total, line) => total + line.yearly, 0));
  });
});
