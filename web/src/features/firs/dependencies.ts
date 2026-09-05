/**
 * Which industries have to be fed before the one the player wants to run, and with what.
 *
 * The walk goes the opposite way to the graph the tab draws: from a target industry up its
 * inputs, to the industries making them, and on. What ends a branch is the receiving rule,
 * not an empty input list: a FIRS coal mine takes engineering supplies and a port takes seven
 * cargoes, so "a producer with no inputs" would stop the walk nowhere. Only an industry that
 * *converts* what it is fed carries the chain further; one living off a supply pool is a leaf
 * whose own deliveries are a production bonus, not a link.
 */
import { industryById } from '../../dataset';
import { supplyRule } from '../../engine/supply';
import type { Economy, Industry } from '../../types';

/** One industry of the chain, with how far up from the target it sits. */
export interface ChainNode {
  industry: Industry;
  /** 0 for the target itself. */
  depth: number;
}

/** One input of one chain industry: what to haul into it, and who in the set makes that. */
export interface ChainLink {
  cargoLabel: string;
  consumer: Industry;
  /** Input ratio of this cargo at the consumer; 0 where the set states none. */
  ratio: number;
  /** Industries of the active economy producing this cargo, target-first order. */
  producers: Industry[];
  /** Depth of the consumer, so a chain with no savegame can still be ordered. */
  depth: number;
}

export interface Chain {
  nodes: ChainNode[];
  links: ChainLink[];
}

/** Whether this industry passes what it is fed on to its output — the one thing that recurs. */
export function carriesTheChain(industry: Industry): boolean {
  return supplyRule(industry) === 'conversion';
}

/** Whether deliveries buy it a production bonus instead of turning into output. */
export function runsOnAPool(industry: Industry): boolean {
  return supplyRule(industry) === 'pool';
}

/**
 * The chain feeding `targetId`, breadth-first from the target.
 *
 * Every industry appears once however many paths lead to it, which is also what keeps a
 * by-product looping back into the chain from walking forever.
 */
export function industryChain(economy: Economy, targetId: string): Chain {
  const target = industryOf(economy, targetId);
  if (!target) return { nodes: [], links: [] };

  const producersOf = producerIndex(economy);
  const nodes: ChainNode[] = [{ industry: target, depth: 0 }];
  const links: ChainLink[] = [];
  const seen = new Set([target.id]);
  const queue: ChainNode[] = [...nodes];

  while (queue.length) {
    const { industry, depth } = queue.shift()!;
    // the target is walked whatever rule it runs on: the player picked it to feed it
    const expands = depth === 0 || carriesTheChain(industry);
    for (const input of industry.economies[economy.id]?.accepts ?? []) {
      const producers = (producersOf.get(input.label) ?? [])
        .map((id) => industryOf(economy, id))
        .filter((found): found is Industry => found !== null);
      links.push({
        cargoLabel: input.label,
        consumer: industry,
        ratio: input.ratio ?? 0,
        producers,
        depth,
      });
      // a leaf's own inputs are tasks all the same — they are what its production bonus
      // costs — but nobody upstream of it joins the chain
      if (!expands) continue;
      for (const producer of producers) {
        if (seen.has(producer.id)) continue;
        seen.add(producer.id);
        const node = { industry: producer, depth: depth + 1 };
        nodes.push(node);
        queue.push(node);
      }
    }
  }
  return { nodes, links };
}

/**
 * Industries of this economy by the cargo they produce, in the economy's own order.
 *
 * Read off the industries themselves rather than off `economy.graph.edges`: the graph is the
 * picture, and it leaves out the cargoes that would tangle it — engineering and farm supplies,
 * passengers, mail (`GRAPH_EXCLUDED_LABELS` in `extract_firs.py`). Those are exactly the
 * supplies a mine or a port runs on, so a chain built from the drawing would claim nobody in
 * the economy makes them.
 */
function producerIndex(economy: Economy): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const id of economy.industry_ids) {
    for (const produced of industryById.get(id)?.economies[economy.id]?.produces ?? []) {
      const made = out.get(produced.label);
      if (made) made.push(id);
      else out.set(produced.label, [id]);
    }
  }
  return out;
}

/** An industry the active economy actually has; anything else is not an input here. */
function industryOf(economy: Economy, id: string): Industry | null {
  const industry = industryById.get(id);
  return industry && industry.economies[economy.id] ? industry : null;
}
