/**
 * Infrastructure upkeep: what a company pays every month to own its network, whether or
 * not anything runs on it (rail.h RailMaintenanceCost, station_func.h, water.h, road_func.h;
 * JGRPP routes all of them through maintenance_func.h GetMaintenanceCostScale).
 *
 * The game computes a whole number of pounds per month and the infrastructure window shows
 * that figure times twelve, so the truncation happens before the year is formed. It is
 * visible: six tiles of plain track cost 1800 a tile a year where ten thousand cost 1856.25.
 */

import { basePriceAfterMultipliers, priceInflation, type BasePriceKey } from './costs';
import {
  basecostInfrastructureFactor,
  difficultyPriceFactor,
  linearMaintenanceApplies,
  type GameSettings,
} from './settings';

/** Categories the game bills separately, each with its own scaling and shift. */
export type MaintenanceCategory = 'rail' | 'signal' | 'road' | 'tram' | 'station' | 'canal';

/**
 * Fixed scale JGRPP uses instead of the square root when linear growth is on. Each is
 * "roughly equivalent to the polynomial cost" at some size the patchpack picked
 * (rail.cpp, road_cmd.cpp, station.cpp, water_cmd.cpp).
 */
const LINEAR_SCALE: Record<MaintenanceCategory, number> = {
  rail: 72,
  signal: 33,
  road: 33,
  tram: 33,
  station: 23,
  canal: 11,
};

/** Fractional bits the game shifts off each category's product. */
const SHIFT: Record<MaintenanceCategory, number> = {
  rail: 11,
  signal: 8,
  road: 12,
  tram: 12,
  station: 7,
  canal: 6,
};

/** Which base price each category is billed from. */
const BASE_PRICE: Record<MaintenanceCategory, BasePriceKey> = {
  rail: 'infrastructure_rail',
  signal: 'infrastructure_rail',
  road: 'infrastructure_road',
  tram: 'infrastructure_road',
  station: 'infrastructure_station',
  canal: 'infrastructure_water',
};

/**
 * Multiplier the game's own road types carry (table/roadtypes.h). Roads are here so the
 * total can be checked against the game's window; the calculator models no road transport,
 * so no road set redefines these and they stay a table of the game's two types.
 */
export const ROAD_MAINTENANCE_MULTIPLIERS = { ROAD: 16, ELRL: 24 } as const;

/** The road type labels the game defines (road_type.h); a set of its own would add to these. */
export type RoadTypeLabel = keyof typeof ROAD_MAINTENANCE_MULTIPLIERS;

/** Signals cost fifteen of the rail base price each (rail.h SignalMaintenanceCost). */
const SIGNAL_MULTIPLIER = 15;

/**
 * The game's integer square root (core/math_func.cpp): the last step rounds to the
 * *nearest* integer rather than truncating, and the growth branch rests on it entirely.
 */
export function intSqrt(num: number): number {
  let res = 0;
  let bit = 1 << 30;
  let rest = Math.trunc(num);
  while (bit > rest) bit >>= 2;
  while (bit !== 0) {
    if (rest >= res + bit) {
      rest -= res + bit;
      res = (res >> 1) + bit;
    } else {
      res >>= 1;
    }
    bit >>= 2;
  }
  if (rest > res) res++;
  return res;
}

/**
 * How the cost grows with the size of the network (JGRPP maintenance_func.h): a fixed
 * scale when linear growth is on, the vanilla square root otherwise.
 */
export function maintenanceScale(
  totalCount: number,
  category: MaintenanceCategory,
  game: GameSettings,
): number {
  return linearMaintenanceApplies(game) ? LINEAR_SCALE[category] : 1 + intSqrt(totalCount);
}

/**
 * Base price of a category after the difficulty, inflation and Base Costs multipliers —
 * the same chain vehicle prices go through (economy.cpp RecomputePrices).
 */
export function infrastructureBasePrice(
  category: MaintenanceCategory,
  game: GameSettings,
  year: number,
): number {
  const price = basePriceAfterMultipliers(
    BASE_PRICE[category],
    difficultyPriceFactor(game.vehicleCosts),
    priceInflation(game, year),
    basecostInfrastructureFactor(game),
  );
  // The game will not let a base price reach zero — a zero cost is how its commands tell
  // "nothing happened" from "done" (economy.cpp RecomputePrices). Vehicle prices never get
  // near it; these bases are 8 to 100 and reach it at a Base Costs multiplier of 1/16.
  return price === 0 ? 1 : price;
}

/**
 * Monthly cost of one category, whole pounds, truncated as the game truncates.
 *
 * `count` is what this line owns, `totalCount` the size of the network the scale is read
 * from — for a railtype that is every piece of track of every type, for signals and stations
 * their own count. The shift is a division, not `>>`: the product passes 2^31 on a real
 * network (a Base Costs multiplier alone reaches 8192x) and a bitwise shift would wrap.
 */
export function categoryMonthlyCost(
  category: MaintenanceCategory,
  typeMultiplier: number,
  count: number,
  totalCount: number,
  game: GameSettings,
  year: number,
): number {
  if (!game.infrastructureMaintenance || count <= 0) return 0;
  const product =
    infrastructureBasePrice(category, game, year) *
    typeMultiplier *
    count *
    maintenanceScale(totalCount, category, game);
  return Math.floor(product / 2 ** SHIFT[category]);
}

/** A network as the player describes it: how much of each thing is owned. */
export interface NetworkCounts {
  /** Pieces of track per railtype label — track bits, as the game bills them. */
  rail: Record<string, number>;
  signals: number;
  stations: number;
  /** Pieces of road per road type label; the type has to be one the game defines. */
  road: Partial<Record<RoadTypeLabel, number>>;
  /** Pieces of tram track per type; billed off its own total, not the road one. */
  tram: Partial<Record<RoadTypeLabel, number>>;
  canals: number;
}

export const EMPTY_NETWORK: NetworkCounts = {
  rail: {},
  signals: 0,
  stations: 0,
  road: {},
  tram: {},
  canals: 0,
};

/** One billed line, as the game's infrastructure window lists them. */
export interface MaintenanceLine {
  category: MaintenanceCategory;
  /** Railtype or road type label; absent for the categories that have only one line. */
  label?: string;
  count: number;
  monthly: number;
  yearly: number;
}

export interface NetworkMaintenance {
  lines: MaintenanceLine[];
  monthly: number;
  yearly: number;
}

/** The multiplier of a railtype, as its set states it. */
export type RailtypeMultipliers = { label: string; maintenance_multiplier: number }[];

function sum(counts: Partial<Record<string, number>>): number {
  return Object.values(counts).reduce((total: number, n) => total + (n && n > 0 ? n : 0), 0);
}

/**
 * Size of the rail network the scale is read from: the pieces of the types this set has.
 *
 * Counts keyed by a label the set does not define are ignored rather than added in — they
 * are what an earlier set left in the inputs, and the game counts only what a company owns
 * on the types it can lay. Left in, they would raise `1 + IntSqrt(total)` for every line.
 */
function railTotalOf(counts: NetworkCounts, railtypes: RailtypeMultipliers): number {
  return railtypes.reduce((total, rt) => total + Math.max(0, counts.rail[rt.label] ?? 0), 0);
}

/**
 * Yearly upkeep of a whole network, line by line.
 *
 * Road and tram tiles are billed off separate totals, the way the game does it
 * (company_gui.cpp: `RoadTypeIsRoad(rt) ? road_total : tram_total`), while every railtype
 * shares one rail total.
 */
export function networkMaintenance(
  counts: NetworkCounts,
  railtypes: RailtypeMultipliers,
  game: GameSettings,
  year: number,
): NetworkMaintenance {
  const lines: MaintenanceLine[] = [];
  const add = (
    category: MaintenanceCategory,
    multiplier: number,
    count: number,
    totalCount: number,
    label?: string,
  ) => {
    if (count <= 0) return;
    const monthly = categoryMonthlyCost(category, multiplier, count, totalCount, game, year);
    lines.push({ category, label, count, monthly, yearly: monthly * 12 });
  };

  const railTotal = railTotalOf(counts, railtypes);
  for (const rt of railtypes) {
    add('rail', rt.maintenance_multiplier, counts.rail[rt.label] ?? 0, railTotal, rt.label);
  }
  add('signal', SIGNAL_MULTIPLIER, counts.signals, counts.signals);
  add('station', 1, counts.stations, counts.stations);

  const roadTotal = sum(counts.road);
  const tramTotal = sum(counts.tram);
  for (const [label, count] of Object.entries(counts.road) as [RoadTypeLabel, number][]) {
    add('road', ROAD_MAINTENANCE_MULTIPLIERS[label], count, roadTotal, label);
  }
  for (const [label, count] of Object.entries(counts.tram) as [RoadTypeLabel, number][]) {
    add('tram', ROAD_MAINTENANCE_MULTIPLIERS[label], count, tramTotal, label);
  }
  add('canal', 1, counts.canals, counts.canals);

  const monthly = lines.reduce((total, line) => total + line.monthly, 0);
  return { lines, monthly, yearly: monthly * 12 };
}
