/**
 * What an imported game says about the chain: which of its industries stand on the map, which
 * of them are already fed, where to haul each cargo from, and how far that is.
 *
 * None of this lives in the snapshot. The answers depend on the active economy and on the
 * target the player just picked, which is not something the parse of a savegame can know.
 */
import { plotDistance, type Snapshot, type SnapshotIndustry } from '../../savegame/snapshot';
import type { SupplyTask } from './tasks';

/** Where a task stands in the imported game. */
export type TaskState =
  /** The consumer is on the map and this cargo already reaches it. */
  | 'supplied'
  /** The consumer is on the map, and nothing hauls this cargo to it. */
  | 'idle'
  /** No industry of this type in the game at all. */
  | 'absent';

/** Legs are ordered by class first: the cheap ones are those that stay inside a town. */
export type LegClass = 'same-town' | 'other-town' | 'unknown-town';

/** Cheapest class first; the order of this list is the order of the tasks. */
const CLASS_ORDER: LegClass[] = ['same-town', 'other-town', 'unknown-town'];

export interface TaskSource {
  /** The industry of the game this cargo would come from. */
  industry: SnapshotIndustry;
  /** Catalogue id of that industry — it came out of the catalogue index, so it always has one. */
  catalogueId: string;
  /** Consumer instance the leg was measured to. */
  consumer: SnapshotIndustry;
  tiles: number;
  legClass: LegClass;
  /** How many industries of the game could have served this task. */
  candidates: number;
  /** Output of the source over its last finished month; null where the save states none. */
  outputPerMonth: number | null;
}

/** A task with everything the imported game adds to it. */
export interface GameTask extends SupplyTask {
  /** Null without an imported game: nothing is known then, which is not the same as absent. */
  state: TaskState | null;
  /** Null without a game, without plots, or with no producer of this cargo on the map. */
  source: TaskSource | null;
  /**
   * Industries of the game that could serve this task, plots or no plots. It tells the two
   * silences apart: nothing of the kind on the map, or a save that stated no map size to
   * measure by — the second is not the player's problem to fix by building anything.
   */
  sourcesOnMap: number;
}

/**
 * The chain's tasks against an imported game. Without a snapshot every task keeps its data-set
 * answer alone: no state, no source, no leg.
 */
export function tasksInGame(tasks: readonly SupplyTask[], snapshot: Snapshot | null): GameTask[] {
  if (!snapshot) {
    return tasks.map((task) => ({ ...task, state: null, source: null, sourcesOnMap: 0 }));
  }
  const byCatalogue = industriesByCatalogue(snapshot);
  const fed = suppliedPairs(snapshot);

  return tasks.map((task) => {
    const consumers = byCatalogue.get(task.consumer.id) ?? [];
    const producers = task.producers.flatMap((p) => byCatalogue.get(p.id) ?? []);
    return {
      ...task,
      state: stateOf(consumers, task.cargoLabel, fed),
      source: nearestSource(producers, consumers, task.cargoLabel),
      sourcesOnMap: producers.length,
    };
  });
}

function stateOf(
  consumers: readonly SnapshotIndustry[],
  cargoLabel: string,
  fed: ReadonlySet<string>,
): TaskState {
  if (consumers.length === 0) return 'absent';
  return consumers.some((c) => fed.has(pairKey(c.id, cargoLabel))) ? 'supplied' : 'idle';
}

/**
 * The pair of source and consumer with the shortest leg. Null where no producer stands on the
 * map, or where the save stated no plots to measure by.
 *
 * Shortest, not cheapest: the row says "nearest of N", and picking by leg class instead would
 * make that a lie. Class still decides the order of the list — but that is a statement about
 * which task to build first, not about which of two mines the cargo comes from.
 */
function nearestSource(
  producers: readonly SnapshotIndustry[],
  consumers: readonly SnapshotIndustry[],
  cargoLabel: string,
): TaskSource | null {
  let best: TaskSource | null = null;
  for (const industry of producers) {
    if (industry.plot === null) continue;
    for (const consumer of consumers) {
      if (consumer.plot === null) continue;
      const candidate: TaskSource = {
        industry,
        catalogueId: industry.catalogueId!,
        consumer,
        tiles: plotDistance(industry.plot, consumer.plot),
        legClass: legClassOf(industry, consumer),
        candidates: producers.length,
        outputPerMonth: outputOf(industry, cargoLabel),
      };
      if (best === null || candidate.tiles < best.tiles) best = candidate;
    }
  }
  return best;
}

function legClassOf(source: SnapshotIndustry, consumer: SnapshotIndustry): LegClass {
  if (source.townId === null || consumer.townId === null) return 'unknown-town';
  return source.townId === consumer.townId ? 'same-town' : 'other-town';
}

function outputOf(industry: SnapshotIndustry, cargoLabel: string): number | null {
  return industry.produced.find((p) => p.label === cargoLabel)?.lastMonthProduction ?? null;
}

function industriesByCatalogue(snapshot: Snapshot): Map<string, SnapshotIndustry[]> {
  const out = new Map<string, SnapshotIndustry[]>();
  for (const industry of snapshot.industries) {
    if (industry.catalogueId === null) continue;
    const same = out.get(industry.catalogueId);
    if (same) same.push(industry);
    else out.set(industry.catalogueId, [industry]);
  }
  return out;
}

/**
 * Industry-and-cargo pairs the game already hauls: a route whose trains have capacity for the
 * cargo, stopping at a station whose catchment holds the industry.
 *
 * Capacity, not what is loaded right now: a train standing empty does not undo the route it
 * runs. The verdict is an approximation on purpose — it says the cargo reaches the industry,
 * never that the deliveries keep it inside the supply window.
 */
function suppliedPairs(snapshot: Snapshot): Set<string> {
  const trainsById = new Map(snapshot.trains.map((train) => [train.id, train]));
  const stationsById = new Map(snapshot.stations.map((station) => [station.id, station]));
  const out = new Set<string>();

  for (const route of snapshot.routes) {
    const hauled = new Set<string>();
    for (const trainId of route.trainIds) {
      for (const load of trainsById.get(trainId)?.cargo ?? []) {
        if (load.label !== null && load.capacity > 0) hauled.add(load.label);
      }
    }
    if (hauled.size === 0) continue;
    for (const stop of route.stops) {
      if (stop.stationId === null) continue;
      for (const industryId of stationsById.get(stop.stationId)?.supplierIds ?? []) {
        for (const label of hauled) out.add(pairKey(industryId, label));
      }
    }
  }
  return out;
}

function pairKey(industryId: number, cargoLabel: string): string {
  return `${industryId} ${cargoLabel}`;
}

/**
 * The list in the order the player should work it: what is not done yet, cheapest leg first.
 *
 * Two keys make up "cheapest": the class of the leg, then its length. Tasks with no leg at all
 * come after those that have one rather than mixing in among them — a task nothing is known
 * about is not a cheap task. Everything already supplied sinks to the bottom whatever its leg,
 * because a plan of work starts with what is still to do.
 *
 * Without a game none of that is known, and the order falls back on the chain itself: the
 * industries nearest the target first.
 */
export function orderTasks(tasks: readonly GameTask[]): GameTask[] {
  return [...tasks].sort((a, b) => {
    if ((a.state === 'supplied') !== (b.state === 'supplied')) return a.state === 'supplied' ? 1 : -1;
    if (a.source === null || b.source === null) {
      if (a.source !== b.source) return a.source === null ? 1 : -1;
      return a.depth - b.depth;
    }
    // class decides before length: a long haul inside one town is cheaper to build than a
    // short one between two
    const byClass = CLASS_ORDER.indexOf(a.source.legClass) - CLASS_ORDER.indexOf(b.source.legClass);
    return byClass === 0 ? a.source.tiles - b.source.tiles : byClass;
  });
}

/**
 * Scale the chain is worked out at, in units per month, when the player has not set one.
 *
 * A secondary industry has no nominal output — what it makes is whatever it is fed — so the
 * scale has to come from somewhere. An imported game answers it: what the target actually put
 * out last month. Without one there is no anchor at all, and a round number the player edits
 * beats a figure invented to look derived.
 */
export const FALLBACK_OUTPUT_PER_MONTH = 100;

export function defaultOutputPerMonth(
  targetId: string,
  cargoLabel: string | null,
  snapshot: Snapshot | null,
): number {
  if (!snapshot || cargoLabel === null) return FALLBACK_OUTPUT_PER_MONTH;
  // the same cargo the scale is measured in, not the largest of the industry's products: one
  // number meaning two things is how a chain ends up sized for a cargo nobody asked about
  const outputs = snapshot.industries
    .filter((industry) => industry.catalogueId === targetId)
    .flatMap((industry) => industry.produced)
    .filter((produced) => produced.label === cargoLabel)
    .map((produced) => produced.lastMonthProduction)
    .filter((value): value is number => value !== null && value > 0);
  return outputs.length === 0 ? FALLBACK_OUTPUT_PER_MONTH : Math.max(...outputs);
}
