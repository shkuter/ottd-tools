import type { Economy } from '../../types';

/** Nodes reachable from `start` in both directions of the cargo graph, `start` included. */
export function chainNodes(economy: Economy, start: string): Set<string> {
  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  for (const edge of economy.graph.edges) {
    forward.set(edge.from, [...(forward.get(edge.from) ?? []), edge.to]);
    backward.set(edge.to, [...(backward.get(edge.to) ?? []), edge.from]);
  }
  const result = new Set<string>([start]);
  for (const adjacency of [forward, backward]) {
    const queue = [start];
    while (queue.length) {
      const node = queue.pop()!;
      for (const next of adjacency.get(node) ?? []) {
        if (!result.has(next)) {
          result.add(next);
          queue.push(next);
        }
      }
    }
  }
  return result;
}
