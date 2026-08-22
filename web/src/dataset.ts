import trainsJson from './data/trains.json';
import cargosJson from './data/cargos.json';
import industriesJson from './data/industries.json';
import economiesJson from './data/economies.json';
import metaJson from './data/meta.json';
import type { Cargo, Economy, Industry, Train, TrainsMeta } from './types';
import { vanillaCanCarry, vanillaCargos, vanillaTrains } from './vanilla';
import { DEFAULT_FIRS_ECONOMY, type GameSettings } from './engine/settings';

export const trains = (trainsJson as { items: unknown }).items as Train[];
export const trainsMeta = (trainsJson as { meta: unknown }).meta as TrainsMeta;
export const cargos = (cargosJson as { items: unknown }).items as Cargo[];
export const industries = (industriesJson as { items: unknown }).items as Industry[];
export const economies = (economiesJson as { items: unknown }).items as Economy[];
export const datasetMeta = metaJson as {
  generated_at: string;
  iron_horse: string;
  firs: string;
  firs_ru: string;
  openttd: string;
};

export const trainById = new Map(trains.map((t) => [t.id, t]));
export const cargoByLabel = new Map(cargos.map((c) => [c.label, c]));
export const industryById = new Map(industries.map((i) => [i.id, i]));
export const economyById = new Map(economies.map((e) => [e.id, e]));

/** Активный набор машин: Iron Horse или ванильные поезда. */
export function activeTrains(game: GameSettings): Train[] {
  return game.ironHorse ? trains : vanillaTrains;
}

/**
 * Catalogue metadata for the active train set. Iron Horse's basecost shifts are local to
 * its own vehicles (the GRF defines them), so the vanilla catalogue gets zero shifts —
 * only the game's difficulty and Base Costs GRF multipliers apply there.
 */
export function activeTrainsMeta(game: GameSettings): TrainsMeta {
  return game.ironHorse ? trainsMeta : vanillaTrainsMeta;
}

const vanillaTrainsMeta: TrainsMeta = {
  ...trainsMeta,
  basecost_shifts: { build_engine: 0, build_wagon: 0, running_steam: 0, running_diesel: 0 },
};

/**
 * Cargos a calculation may use: the ones the chosen FIRS economy has, or the vanilla set
 * when FIRS is off. A cargo outside it has no payment rate to compute with, so it is
 * offered nowhere. The global `cargos` index stays complete — it describes the dataset,
 * not the game being calculated.
 */
export function activeCargos(game: GameSettings): Cargo[] {
  if (!game.firs) return vanillaCargos;
  return cargosOfEconomy(activeEconomy(game));
}

/**
 * The economy in force. An id the data no longer has — a FIRS release renaming one — falls
 * back to the default here as well as in the settings store: the store only fixes what comes
 * out of localStorage, while `applySettings` (a savegame import) and `setGame` write past it.
 * Reading always has to land on a real economy, or the calculator would offer no cargos.
 */
export function activeEconomy(game: GameSettings): Economy {
  return economyById.get(game.firsEconomy) ?? economyById.get(DEFAULT_FIRS_ECONOMY)!;
}

/** Индекс активных грузов по метке. */
export function activeCargoByLabel(game: GameSettings): Map<string, Cargo> {
  return new Map(activeCargos(game).map((c) => [c.label, c]));
}

/** Проверка перевозки с учётом того, какие наборы включены. */
export function canCarryIn(game: GameSettings, train: Train, cargo: Cargo): boolean {
  // ванильные машины рефита не имеют; у Iron Horse — полная NewGRF-логика,
  // но ванильные грузы не несут cargo classes, поэтому сверяем по метке
  if (!game.ironHorse) return vanillaCanCarry(train, cargo);
  if (!game.firs) {
    return (
      train.default_cargos.includes(cargo.label) ||
      train.refit.labels_allowed.includes(cargo.label)
    );
  }
  return canCarry(train, cargo);
}

/** Может ли вагон/машина возить данный груз (полная NewGRF-логика refit). */
export function canCarry(train: Train, cargo: Cargo): boolean {
  const { refit } = train;
  if (refit.labels_disallowed.includes(cargo.label)) return false;
  if (refit.labels_allowed.includes(cargo.label)) return true;
  const allowed = new Set<string>();
  const disallowed = new Set<string>();
  for (const group of refit.classes) {
    const rules = trainsMeta.refit_groups[group];
    if (!rules) continue;
    rules.allowed.forEach((c) => allowed.add(c));
    rules.disallowed.forEach((c) => disallowed.add(c));
  }
  if (allowed.size === 0) return false;
  const hasAllowed = cargo.classes.some((c) => allowed.has(c));
  const hasDisallowed = cargo.classes.some((c) => disallowed.has(c));
  return hasAllowed && !hasDisallowed;
}

/** One list per economy: `activeCargos` runs inside the `useMemo` of several tabs. */
const cargosByEconomy = new Map<string, Cargo[]>();

/**
 * Cargos of one economy, in the order the economy lists them. The array is shared between
 * callers, so none of them may mutate it — `sortCargos` copies before sorting.
 */
function cargosOfEconomy(economy: Economy): Cargo[] {
  const cached = cargosByEconomy.get(economy.id);
  if (cached) return cached;
  const list = economy.cargo_labels
    .map((label) => cargoByLabel.get(label))
    .filter((c): c is Cargo => Boolean(c));
  cargosByEconomy.set(economy.id, list);
  return list;
}

/** Payment-rate key for vanilla cargos: they carry a single rate instead of one per economy. */
export const VANILLA_ECONOMY_ID = 'VANILLA';

/**
 * Economy whose payment rate applies: the one the game runs, or the vanilla key when FIRS
 * is off. It takes no cargo — `activeCargos` only offers cargos this economy has, so
 * "a cargo from another economy" is not a state that exists. Reads through `activeEconomy`,
 * so an id the data lost falls back with the cargo list instead of pricing everything at
 * zero — the rate is looked up by id, and an unknown one has no entry.
 */
export function economyIdForPayment(game: GameSettings): string {
  return game.firs ? activeEconomy(game).id : VANILLA_ECONOMY_ID;
}
