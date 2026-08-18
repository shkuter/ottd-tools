import trainsJson from './data/trains.json';
import cargosJson from './data/cargos.json';
import industriesJson from './data/industries.json';
import economiesJson from './data/economies.json';
import metaJson from './data/meta.json';
import type { Cargo, Economy, Industry, Train, TrainsMeta } from './types';
import { vanillaCanCarry, vanillaCargos, vanillaTrains } from './vanilla';
import type { GameSettings } from './engine/settings';

export const trains = (trainsJson as { items: unknown }).items as Train[];
export const trainsMeta = (trainsJson as { meta: unknown }).meta as TrainsMeta;
export const cargos = (cargosJson as { items: unknown }).items as Cargo[];
export const industries = (industriesJson as { items: unknown }).items as Industry[];
export const economies = (economiesJson as { items: unknown }).items as Economy[];
export const datasetMeta = metaJson as {
  generated_at: string;
  iron_horse: string;
  firs: string;
};

export const trainById = new Map(trains.map((t) => [t.id, t]));
export const cargoByLabel = new Map(cargos.map((c) => [c.label, c]));
export const industryById = new Map(industries.map((i) => [i.id, i]));
export const economyById = new Map(economies.map((e) => [e.id, e]));

/** Активный набор машин: Iron Horse или ванильные поезда. */
export function activeTrains(game: GameSettings): Train[] {
  return game.ironHorse ? trains : vanillaTrains;
}

/** Активный набор грузов: FIRS или ванильные грузы. */
export function activeCargos(game: GameSettings): Cargo[] {
  return game.firs ? cargos : vanillaCargos;
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

/** Грузы данной экономики (в порядке cargo_labels экономики). */
export function cargosOfEconomy(economy: Economy): Cargo[] {
  return economy.cargo_labels
    .map((label) => cargoByLabel.get(label))
    .filter((c): c is Cargo => Boolean(c));
}

/** Payment-rate key for vanilla cargos: they carry a single rate instead of one per economy. */
export const VANILLA_ECONOMY_ID = 'VANILLA';

/**
 * Economy whose payment rate applies to a cargo: the first FIRS economy that lists it, or
 * the vanilla key when FIRS is off. `preferred` wins when the cargo exists there (the route
 * tab lets the user pick an economy explicitly).
 */
export function economyIdForCargo(
  game: GameSettings,
  cargo: Cargo,
  preferred?: string | null,
): string | null {
  if (!game.firs) return VANILLA_ECONOMY_ID;
  if (preferred && cargo.initial_payment_by_economy[preferred] != null) return preferred;
  return economies.find((e) => cargo.initial_payment_by_economy[e.id] != null)?.id ?? null;
}
