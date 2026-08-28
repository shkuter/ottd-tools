import trainsJson from './data/trains.json';
import cargosJson from './data/cargos.json';
import industriesJson from './data/industries.json';
import economiesJson from './data/economies.json';
import metaJson from './data/meta.json';
import type {
  Cargo, Economy, IndustriesMeta, Industry, Railtype, Train, TrainsMeta,
} from './types';
import { vanillaCanCarry, vanillaCargos, vanillaRailtypes, vanillaTrains } from './vanilla';
import { DEFAULT_FIRS_ECONOMY, type GameSettings } from './engine/settings';
import type { SupplyTarget } from './engine/supply';

export const trains = (trainsJson as { items: unknown }).items as Train[];
export const trainsMeta = (trainsJson as { meta: unknown }).meta as TrainsMeta;
export const cargos = (cargosJson as { items: unknown }).items as Cargo[];
export const industries = (industriesJson as { items: unknown }).items as Industry[];
export const industriesMeta = (industriesJson as { meta: unknown }).meta as IndustriesMeta;
export const economies = (economiesJson as { items: unknown }).items as Economy[];
export const datasetMeta = metaJson as {
  generated_at: string;
  iron_horse: string;
  firs: string;
  firs_ru: string;
  openttd: string;
};

export const trainById = new Map(trains.map((t) => [t.id, t]));
/**
 * Any catalogue row by id, whichever set defined it. For readers that hold an id but not the
 * settings that say which set is active — the consist store rehydrating what it saved, or a
 * game imported from a save played without Iron Horse.
 */
export const trainByAnyId = new Map<string, Train>(
  [...vanillaTrains, ...trains].map((t) => [t.id, t]),
);
export const cargoByLabel = new Map(cargos.map((c) => [c.label, c]));
export const industryById = new Map(industries.map((i) => [i.id, i]));
export const economyById = new Map(economies.map((e) => [e.id, e]));

/** Активный набор машин: Iron Horse или ванильные поезда. */
export function activeTrains(game: GameSettings): Train[] {
  return game.ironHorse ? trains : vanillaTrains;
}

/**
 * Track types a route can be built with, in the order the game's build menu lists them.
 * Which set is active decides them: Iron Horse ships narrow gauge, metro and high speed
 * track; without it the game's own four are all there is.
 */
export function activeRailtypes(game: GameSettings): Railtype[] {
  return game.ironHorse ? trainsMeta.railtypes : vanillaRailtypes;
}

/**
 * Track types a route can be built on, which is what the choice offers. A set may define a
 * type the game keeps out of its build menu — Iron Horse hides plain LGV, which exists so
 * high speed vehicles stay compatible with ordinary track — and a track nobody can lay is
 * not a route anyone can cost. It stays in `activeRailtypes`, where the relations need it.
 */
export function selectableRailtypes(game: GameSettings): Railtype[] {
  return activeRailtypes(game).filter((rt) => !rt.hidden);
}

/** The chosen track type, or the plain rail every set has when the choice is a stranger. */
export function activeRailtype(game: GameSettings, label: string): Railtype {
  const railtypes = activeRailtypes(game);
  return (
    railtypes.find((rt) => rt.label === label)
    ?? railtypes.find((rt) => rt.label === 'RAIL')
    ?? railtypes[0]
  );
}

/**
 * Стоит ли эта машина в списке покупки при текущих настройках. Состав хранится по id и
 * переживает смену набора, а машина чужого набора в расчёте — это её характеристики с
 * чужими basecost-шифтами (`activeTrainsMeta`), то есть неверные деньги. Такие записи
 * отбрасываются при чтении — так же, как экономика поступает с грузом, которого в ней нет
 * (ADR-0002).
 */
export function inActiveSet(train: Pick<Train, 'id'>, game: GameSettings): boolean {
  return (game.ironHorse ? trainById : vanillaTrainById).has(train.id);
}

const vanillaTrainById = new Map(vanillaTrains.map((t) => [t.id, t]));

/** Состав, каким его считает текущая партия: без машин, которых в её наборе нет. */
export function activeEntries<E extends { train: Pick<Train, 'id'> }>(
  entries: readonly E[],
  game: GameSettings,
): E[] {
  return entries.filter((entry) => inActiveSet(entry.train, game));
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

/** One index per economy: the consumer lookup runs inside the `useMemo` of the optimizer. */
const consumersByEconomy = new Map<string, Map<string, Industry[]>>();

/**
 * Which industries of an economy accept a cargo, by cargo label.
 *
 * Derived rather than stored: the answer already sits in every industry's `accepts`, and a
 * second copy in the data could disagree with it without anyone noticing. Cached per economy
 * because a game runs one, and rebuilt for none of them beyond that.
 */
function consumersOfEconomy(economy: Economy): Map<string, Industry[]> {
  const cached = consumersByEconomy.get(economy.id);
  if (cached) return cached;
  const index = new Map<string, Industry[]>();
  for (const industry of industries) {
    const inEconomy = industry.economies[economy.id];
    if (!inEconomy) continue;
    for (const accepted of inEconomy.accepts) {
      const consumers = index.get(accepted.label);
      if (consumers) consumers.push(industry);
      else index.set(accepted.label, [industry]);
    }
  }
  consumersByEconomy.set(economy.id, index);
  return index;
}

/**
 * Industries of the active economy that accept this cargo, in data order. Empty when nobody
 * takes it — a cargo can be produced and never consumed — and empty with FIRS off, where
 * there are no industries to speak of.
 *
 * The array is shared between callers, so none of them may mutate it.
 */
export function cargoConsumers(game: GameSettings, cargoLabel: string): Industry[] {
  if (!game.firs) return [];
  return consumersOfEconomy(activeEconomy(game)).get(cargoLabel) ?? [];
}

/**
 * Industry a route delivers to: the chosen one while the active economy still has it, else
 * the first consumer of the cargo. Null when nobody takes the cargo at all.
 *
 * Resolved on every read rather than written back to the store, the way the economy itself
 * falls back (ADR-0002): switching economies then cannot leave a consumer from another set
 * standing, and no migration is needed for what is already in localStorage.
 */
function resolveDestination(
  game: GameSettings,
  cargoLabel: string,
  chosenId: string,
): Industry | null {
  const consumers = cargoConsumers(game, cargoLabel);
  if (consumers.length === 0) return null;
  return consumers.find((industry) => industry.id === chosenId) ?? consumers[0];
}

/**
 * The supply target for a route, as the engine wants it: the receiving industry, the window
 * from the dataset, and the input ratios around the hauled cargo.
 *
 * The other inputs come along because the conversion is a sum over all of them — the engine
 * takes them as fed by somebody else and the interface says so.
 */
export function supplyTargetFor(
  game: GameSettings,
  cargoLabel: string,
  chosenId: string,
): SupplyTarget | null {
  const industry = resolveDestination(game, cargoLabel, chosenId);
  if (!industry) return null;
  const accepts = industry.economies[activeEconomy(game).id]?.accepts ?? [];
  const hauled = accepts.find((entry) => entry.label === cargoLabel);
  return {
    industry,
    windowTicks: industriesMeta.supply_window_ticks,
    cargoRatio: hauled?.ratio ?? null,
    otherRatios: accepts
      .filter((entry) => entry.label !== cargoLabel)
      .map((entry) => entry.ratio ?? 0),
  };
}

/**
 * Industries the active economy has, in data order. Empty with FIRS off, where there are no
 * industries at all — which is also when the supply tab has nothing to answer about.
 *
 * Read through `activeEconomy` like everything else, so an industry belonging to another
 * economy is simply not in the list rather than something callers must filter out.
 */
export function activeIndustries(game: GameSettings): Industry[] {
  if (!game.firs) return [];
  const economyId = activeEconomy(game).id;
  return industries.filter((industry) => industry.economies[economyId]);
}

/**
 * Inputs of one industry in the active economy: the cargo and the input ratio the conversion
 * sums over. Empty when the economy has no such industry — the same fallback the economy
 * itself takes (ADR-0002), so a chosen industry the economy lost leaves nothing to compute.
 */
export function industrySupplyInputs(
  game: GameSettings,
  industryId: string,
): { cargoLabel: string; ratio: number }[] {
  if (!game.firs) return [];
  const industry = industryById.get(industryId);
  const accepts = industry?.economies[activeEconomy(game).id]?.accepts ?? [];
  return accepts.map((entry) => ({ cargoLabel: entry.label, ratio: entry.ratio ?? 0 }));
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
