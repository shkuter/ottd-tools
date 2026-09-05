/**
 * The chain as a list of haulage tasks: what to bring into which industry, and how much of it
 * over one supply window.
 *
 * Volumes are worked out from the top down. The player says what they want the target to put
 * out; `requiredDelivery()` turns that into what the target has to be fed, and the same step
 * repeats for whoever feeds it. Splitting a total between an industry's inputs is the
 * calculator's own assumption, not the game's: FIRS adds up `incoming_cargo_waiting` over all
 * inputs into one count and only cares that each input is inside the window
 * (`produce_secondary.pynml`). Sharing it out by input ratio is the most predictable choice —
 * and the interface says so, because the player could haul it all as one cargo instead.
 */
import { conversion, requiredDelivery, supplyWindowDays } from '../../engine/supply';
import { engineDaysPerYear } from '../../engine/settings';
import type { GameSettings } from '../../engine/settings';
import type { Economy, Industry, SupplyPoolLevel } from '../../types';
import {
  carriesTheChain,
  industryChain,
  runsOnAPool,
  type Chain,
  type ChainLink,
} from './dependencies';

/** How much to haul, in the terms of the receiving industry's own rule. */
export type TaskVolume =
  /** A converting industry: units to deliver across one window. */
  | { kind: 'delivery'; perWindow: number }
  /** A pool industry: the thresholds themselves are the answer to "how much". */
  | { kind: 'pool'; levels: SupplyPoolLevel[] }
  /**
   * The rule is one the calculator knows, but nothing upstream stated a scale to work from —
   * which happens when the chain is headed by an industry whose own output cannot be sized.
   * Kept apart from `unknown`, which is a statement about the rule itself.
   */
  | { kind: 'unscaled' }
  /** A rule the calculator does not model. Not a zero — nothing is claimed at all. */
  | { kind: 'unknown' };

/** One input of one chain industry, with how much of it to bring. */
export interface SupplyTask extends ChainLink {
  volume: TaskVolume;
}

export interface ChainTasksOptions {
  economy: Economy;
  targetId: string;
  /** Output the player wants from the target, in units per month. */
  targetOutputPerMonth: number;
  game: GameSettings;
  /** Supply window of the set, in ticks (`meta.supply_window_ticks`). */
  windowTicks: number;
}

export interface ChainTasks {
  chain: Chain;
  tasks: SupplyTask[];
}

export function chainTasks(options: ChainTasksOptions): ChainTasks {
  const { economy, targetId, targetOutputPerMonth, game, windowTicks } = options;
  const chain = industryChain(economy, targetId);
  if (chain.nodes.length === 0) return { chain, tasks: [] };

  const perLink = requiredPerLink(chain, economy, perWindow(targetOutputPerMonth, game, windowTicks));
  // Industries FIRS marks as taking no supplies state no inputs, so they yield no tasks on
  // their own — a filter here would be a guard against nothing. The test of that name watches
  // the data instead: should a future FIRS give one an input, it fails and asks for a decision.
  const tasks = chain.links.map((link) => ({
    ...link,
    volume: volumeFor(link.consumer, perLink.get(linkKey(link)) ?? null),
  }));
  return { chain, tasks };
}

/** Units per supply window from units per month: the window is fixed in ticks, the year is not. */
export function perWindow(perMonth: number, game: GameSettings, windowTicks: number): number {
  return (perMonth * 12 * supplyWindowDays(windowTicks)) / engineDaysPerYear(game);
}

/**
 * Cargo the chain is sized in: the target's first product, the one the set lists first and the
 * industry is there to make. One function for the figure and for the label above it — a tab
 * showing the output of one cargo while the chain is sized by another is a lie nobody spots.
 */
export function scaleCargo(economy: Economy, target: Industry | null): string | null {
  return target?.economies[economy.id]?.produces[0]?.label ?? null;
}

/** A task is one input of one industry, so the pair names it — in the list and in React. */
export function linkKey(link: ChainLink): string {
  return `${link.consumer.id} ${link.cargoLabel}`;
}

/**
 * How much each task has to deliver, worked out until the figures stop moving.
 *
 * A single pass down the chain is not enough: an industry can feed several others, and one of
 * them may sit further from the target than it does, so its share would be settled before the
 * last demand on it was known. Passing over the whole chain until nothing changes settles all
 * of them, and the pass limit is what stops a by-product looping back into the chain from
 * driving the figures up for ever.
 */
function requiredPerLink(chain: Chain, economy: Economy, targetPerWindow: number) {
  const target = chain.nodes[0]!.industry;
  const firstProduct = scaleCargo(economy, target);
  let settled = new Map<string, number>();

  for (let pass = 0; pass <= chain.nodes.length; pass += 1) {
    const next = new Map<string, number>();
    for (const node of chain.nodes) {
      // only a node the walk expanded passes demand on. A leaf's own inputs are tasks, but
      // nothing upstream of it belongs to this chain — and letting its fixed pool threshold
      // travel would feed it back into the chain through a by-product, pinning the figures
      // to the threshold instead of to the output the player asked for
      if (node.depth !== 0 && !carriesTheChain(node.industry)) continue;
      const wanted = new Map<string, number>();
      if (node.industry.id === target.id && firstProduct) wanted.set(firstProduct, targetPerWindow);
      for (const link of chain.links) {
        if (!link.producers.some((producer) => producer.id === node.industry.id)) continue;
        const share = settled.get(linkKey(link));
        // every candidate producer is asked for the whole amount of a task: one of them will
        // serve it, and splitting it between sources nobody has chosen yet is a fiction
        if (share !== undefined) {
          wanted.set(link.cargoLabel, (wanted.get(link.cargoLabel) ?? 0) + share);
        }
      }
      spread(node.industry, chain, deliveryFor(node.industry, economy, wanted), next);
    }
    if (same(next, settled)) return next;
    settled = next;
  }
  return settled;
}

/** The industry's total across its own inputs, by ratio where it states them, evenly where not. */
function spread(
  industry: Industry,
  chain: Chain,
  total: number | null,
  out: Map<string, number>,
): void {
  if (total === null) return;
  const links = chain.links.filter((link) => link.consumer.id === industry.id);
  const ratioSum = links.reduce((sum, link) => sum + link.ratio, 0);
  for (const link of links) {
    out.set(linkKey(link), ratioSum > 0 ? (total * link.ratio) / ratioSum : total / links.length);
  }
}

function same(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    const other = b.get(key);
    if (other === undefined || Math.abs(other - value) > 1e-9) return false;
  }
  return true;
}

/**
 * Total an industry has to be fed across the window.
 *
 * A converting industry is sized by what is wanted of it, through the same formula that says
 * what it puts out. A pool industry is not: its deliveries buy a production bonus rather than
 * turning into output, so what it wants is its own second threshold however much the chain
 * asks of it — which only ever comes up when the player made such an industry the target,
 * since anywhere else it is a leaf. An unmodelled rule states nothing at all.
 *
 * With more than one product wanted it is the largest of the requirements: one delivery makes
 * all of an industry's outputs at once, so the smaller ones come along with the largest.
 */
export function deliveryFor(
  industry: Industry,
  economy: Economy,
  wanted: Map<string, number>,
): number | null {
  if (runsOnAPool(industry)) return industry.supply_pool?.level2.threshold ?? null;
  if (!carriesTheChain(industry) || wanted.size === 0) return null;
  const data = industry.economies[economy.id];
  if (!data) return null;
  const share = conversion(data.accepts.map((input) => input.ratio ?? 0));
  let most: number | null = null;
  for (const [label, amount] of wanted) {
    const output = data.produces.find((entry) => entry.label === label);
    const needed = requiredDelivery(amount, share, output?.value ?? 0);
    if (needed !== null) most = Math.max(most ?? 0, needed);
  }
  return most;
}

function volumeFor(consumer: Industry, share: number | null): TaskVolume {
  if (runsOnAPool(consumer) && consumer.supply_pool) {
    return { kind: 'pool', levels: [consumer.supply_pool.level1, consumer.supply_pool.level2] };
  }
  if (!carriesTheChain(consumer)) return { kind: 'unknown' };
  return share === null ? { kind: 'unscaled' } : { kind: 'delivery', perWindow: share };
}
