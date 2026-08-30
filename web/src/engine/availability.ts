/**
 * When a vehicle actually stands in the game's buy menu.
 *
 * The calculator works in years while the game works in dates: a NewGRF states the day a
 * vehicle appears (Iron Horse: `date(intro_year, 1 + intro_date_months_offset, 1)`,
 * train/schemas.py introduction_date), so one generation spreads across the months. On top
 * of that the game shifts the date forward by a random 0…511 days (`GB(r, 0, 9)`,
 * engine.cpp StartupOneEngine): the shift is decided by the map's seed and cannot be known
 * in advance. Hence a third answer beside "yes" and "no" — "it depends on your map".
 */
import type { Train, VariantGroupHead } from '../types';
import type { GameSettings } from './settings';

/** Largest random shift of an introduction date, in days (GB(r, 0, 9) = 0…511). */
const INTRO_RANDOM_MAX_DAYS = 511;

/**
 * Months a vehicle waits after its introduction date before it is sold to everyone. Until
 * then only the company the game offers an exclusive preview to can buy it
 * (engine.cpp EnginesMonthlyLoop: `date >= intro_date + 365`).
 */
const INTRO_WAIT_MONTHS = 12;

/**
 * The phases a vehicle's life in the buy menu is made of, in months
 * (engine.cpp StartupOneEngine). Each is rolled out of the map's seed, so the calculator
 * knows only the bounds: below the lower one the vehicle is certainly on sale, above the
 * upper one it is certainly gone, and in between it depends on the map.
 */
const PHASE_1 = { min: 7, max: 38 };
const PHASE_2_SPREAD = 15;
const PHASE_3 = { min: 120, max: 247 };
/** The game subtracts 96 months from the model life and clamps the whole sum at zero. */
const PHASE_2_OFFSET = 96;

export interface IntroAvailability {
  /** Base introduction date from the data: year and month. */
  year: number;
  month: number;
  /** Late edge once the randomisation is accounted for; the base date when there is none. */
  latestYear: number;
  latestMonth: number;
  /** Dates are randomised: the appearance floats between the base date and the late edge. */
  randomised: boolean;
  /** False — the vehicle may not have appeared yet in the chosen year. */
  certain: boolean;
}

/**
 * Is the randomisation of introduction dates in force? Vanilla has it built in and offers no
 * way out (engine.cpp StartupOneEngine); JGRPP exposes it as a setting, on by default.
 */
export function introRandomisationActive(game: GameSettings): boolean {
  return game.jgrpp ? game.vehicleIntroRandomisation : true;
}

/**
 * Does the game shift this date at all? It leaves the first two years of a game untouched so
 * early vehicles are on sale from the start (StartupOneEngine:
 * `base_intro > begin_random_date`, the bound being 1 January of starting_year + 2).
 */
function introRandomised(date: YearMonth, game: GameSettings): boolean {
  if (!introRandomisationActive(game)) return false;
  return Date.UTC(date.year, date.month - 1, 1) > Date.UTC(game.startingYear + 2, 0, 1);
}

/**
 * Latest the game may introduce something dated so, once its random shift is accounted for.
 * Every engine of the pool is rolled, the menu-only head of a series included.
 */
function latestOf(date: YearMonth, game: GameSettings): YearMonth {
  const base = Date.UTC(date.year, date.month - 1, 1);
  const shifted = introRandomised(date, game) ? base + INTRO_RANDOM_MAX_DAYS * 86_400_000 : base;
  const late = new Date(shifted);
  return { year: late.getUTCFullYear(), month: late.getUTCMonth() + 1 };
}

/**
 * A vehicle's appearance relative to the chosen year.
 *
 * `certain` only when the vehicle is on sale from 1 January of that year: the player's month
 * is unknown, so the guarantee is given from the start of the year.
 *
 * Between the introduction date and the sale stands a year of waiting: the game opens a
 * vehicle to every company 365 days later (EnginesMonthlyLoop), and until then only the
 * company handed the exclusive preview can buy it. A vehicle introduced no later than the
 * game began does not wait — those go on sale on the first day (StartupOneEngine).
 */
export function introAvailability(
  train: Train,
  year: number,
  game: GameSettings,
): IntroAvailability {
  const stated = { year: train.intro_year, month: train.intro_month };
  const randomised = introRandomised(stated, game);
  const base = Date.UTC(train.intro_year, train.intro_month - 1, 1);
  const late = latestOf(stated, game);
  const waits = base > Date.UTC(game.startingYear, 0, 1);
  const onSale = Date.UTC(late.year, late.month - 1 + (waits ? INTRO_WAIT_MONTHS : 0), 1);
  return {
    year: train.intro_year,
    month: train.intro_month,
    latestYear: late.year,
    latestMonth: late.month,
    randomised,
    certain: onSale <= Date.UTC(year, 0, 1),
  };
}

/**
 * Whether a vehicle stands in the buy menu of the year being calculated.
 *
 * `uncertain` is not hedging: the game rolls the dates and the selling life out of the
 * map's seed (StartupOneEngine), so for part of a vehicle's life the honest answer is
 * "depends on your map". `reason` says which end of the life the doubt is about.
 */
export type AvailabilityState = 'available' | 'uncertain' | 'unavailable';

/** A month of a year, the precision every date in this module works in. */
interface YearMonth {
  year: number;
  month: number;
}

export interface VehicleAvailability {
  state: AvailabilityState;
  /** `intro` — may not be on sale yet; `retire` — may be withdrawn already. */
  reason: 'intro' | 'retire' | null;
  /**
   * The dates behind the introduction end of the answer, carried along because whoever
   * shows the doubt has to say when the vehicle is due — and asking twice let the two
   * drift apart.
   */
  intro: IntroAvailability;
}

export interface AvailabilityContext {
  game: GameSettings;
  /** Series heads of the active set (`meta.variant_groups`). */
  groups?: Record<string, VariantGroupHead>;
  /**
   * Catalogue ids the imported game actually sells. The game stores its own answer per
   * vehicle, so where it is known it decides — the model below is only for its absence.
   */
  sold?: ReadonlySet<string> | null;
  /** False for a vehicle the active cargo set leaves nothing to carry. */
  carries?: (train: Train) => boolean;
}

/** Months from a year and month to the first of January of `year`. */
function monthsUntil(from: YearMonth, year: number): number {
  return (year - from.year) * 12 - (from.month - 1);
}

/**
 * When the game starts counting a vehicle's age.
 *
 * Ageing runs on the vehicles the game has made available (engine.cpp EnginesMonthlyLoop:
 * `if (e->flags.Test(EngineFlag::Available)) e->age++`), and availability arrives a year
 * after the introduction date (`NewVehicleAvailable`). A vehicle already introduced when
 * the game began is the exception: StartupOneEngine hands it an age counted from its own
 * introduction date, with no year of waiting in between.
 */
function ageStart(intro: YearMonth, game: GameSettings): YearMonth {
  // the game compares dates, not years (`e->intro_date <= CalTime::CurDate()`, and CurDate
  // on the first day is 1 January): a vehicle dated May of the starting year is not there
  // when the game begins, so it waits its year like any other
  if (!startedAfterGameBegan(intro, game)) return intro;
  const shifted = new Date(Date.UTC(intro.year, intro.month - 1 + INTRO_WAIT_MONTHS, 1));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}

/** Was the vehicle introduced after the game had begun, and so had to wait for its sale? */
function startedAfterGameBegan(intro: YearMonth, game: GameSettings): boolean {
  return Date.UTC(intro.year, intro.month - 1, 1) > Date.UTC(game.startingYear, 0, 1);
}

/**
 * The date a series counts its age from.
 *
 * A head the player cannot buy is a menu-only placeholder, and the game marks such a
 * vehicle introduced on the first day of the game (StartupOneEngine, climate branch),
 * so the series ages with the game itself. A head that can be bought ages from its own
 * intro date, as any vehicle does.
 */
function seriesAnchor(
  train: Train,
  intro: IntroAvailability,
  context: AvailabilityContext,
): { oldest: YearMonth; youngest: YearMonth } {
  const head = train.variant_group ? context.groups?.[train.variant_group] : undefined;
  if (!head) {
    // the game shifts the introduction date forward by up to 511 days, so the vehicle is at
    // most as old as its stated date makes it and at least as old as the late edge does
    return {
      oldest: ageStart({ year: intro.year, month: intro.month }, context.game),
      youngest: ageStart({ year: intro.latestYear, month: intro.latestMonth }, context.game),
    };
  }

  const start = { year: context.game.startingYear, month: 1 };
  if (head.intro_year == null) return { oldest: start, youngest: start };
  const headDate = { year: head.intro_year, month: head.intro_month ?? 1 };
  // the head is an engine of the pool like any other, so its own date is rolled too
  const headLatest = latestOf(headDate, context.game);
  if (head.buyable) {
    return {
      oldest: ageStart(headDate, context.game),
      youngest: ageStart(headLatest, context.game),
    };
  }
  if (!startedAfterGameBegan(headDate, context.game)) {
    return { oldest: headDate, youngest: headLatest };
  }

  // A head the player cannot buy is marked introduced on the game's first day, so it ages
  // with the game — but only until the game re-runs its engine startup, which it does on
  // every NewGRF change and which hands the head an age off its own date instead. Both were
  // seen in real savegames of the same set, so the honest answer is the span between them.
  return { oldest: start, youngest: headLatest };
}

/** Lower and upper bound of the vehicle's selling life, in months from its age anchor. */
export function retirementBounds(train: Train): { lower: number; upper: number } | null {
  if (train.model_life == null) return null;
  const life = train.model_life * 12 - PHASE_2_OFFSET;
  const phase2 = { min: Math.max(0, life), max: Math.max(0, life + PHASE_2_SPREAD) };
  // both rules run in the game and whichever comes first withdraws the vehicle: the early
  // retirement a set may state (engine.cpp: `retire_early_max_age`, clamped at zero) and
  // the sum of the three phases. A negative `retire_early` pushes its bound past the third
  // phase, and then the sum is what ends the vehicle's life.
  const early = train.retire_early ?? 0;
  const bound = (phases: { first: number; second: number; third: number }): number => {
    const all = phases.first + phases.second + phases.third;
    if (early === 0) return all;
    return Math.min(Math.max(0, phases.first + phases.second - early * 12), all);
  };
  return {
    lower: bound({ first: PHASE_1.min, second: phase2.min, third: PHASE_3.min }),
    upper: bound({ first: PHASE_1.max, second: phase2.max, third: PHASE_3.max }),
  };
}

export function vehicleAvailability(
  train: Train,
  year: number,
  context: AvailabilityContext,
): VehicleAvailability {
  const intro = introAvailability(train, year, context.game);
  const sold: VehicleAvailability = { state: 'available', reason: null, intro };
  const gone: VehicleAvailability = { state: 'unavailable', reason: null, intro };

  // the imported game answered this already, and its answer beats any formula
  if (context.sold) return context.sold.has(train.id) ? sold : gone;

  if (train.intro_year > year) return gone;

  // a vehicle with nothing to carry is switched off by the game altogether
  // (newgrf.cpp: an empty refit mask clears the climates it is available in)
  if (context.carries && !context.carries(train)) return gone;

  if (!intro.certain) return { state: 'uncertain', reason: 'intro', intro };

  const bounds = context.game.neverExpireVehicles ? null : retirementBounds(train);
  if (bounds) {
    const { oldest, youngest } = seriesAnchor(train, intro, context);
    // gone only when even the youngest reading of its age is past the upper bound
    if (monthsUntil(youngest, year) >= bounds.upper) return gone;
    if (monthsUntil(oldest, year) >= bounds.lower) {
      return { state: 'uncertain', reason: 'retire', intro };
    }
  }
  return sold;
}

/** Does the vehicle stand in the buy menu at all — either for sure or possibly? */
export function standsInBuyMenu(
  train: Train,
  year: number,
  context: AvailabilityContext,
): boolean {
  return vehicleAvailability(train, year, context).state !== 'unavailable';
}
