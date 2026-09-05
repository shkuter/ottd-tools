/**
 * The chain graph of an economy, drawn the way FIRS draws its own cargo-flow chart.
 *
 * The readability comes from the economy's own tuning (ADR-0007), not from a rule of ours:
 * cargos listed there are cloned beside each producer or consumer, "wormhole" industries
 * get no edges and are named in the cargo badge instead, and the supply cargos — which
 * would tie half the graph together — are written into the industry card as lines. The
 * DOT carries node sizes and no labels, so it is the same in every language and the
 * layout can be cached across a language switch.
 */
import type { Cargo, Economy, Industry } from '../../../types';
import {
  PX_PER_INCH,
  acceptCloneId,
  cargoNodeId,
  industryNodeId,
  produceCloneId,
  type BuiltGraph,
  type GraphEdge,
  type GraphNode,
} from './model';
import { CARGO_WIDTH, INDUSTRY_WIDTH, cargoHeight, industryHeight } from './sizes';

export interface GraphNames {
  industry: (industry: Industry) => string;
  cargo: (cargo: Cargo) => string;
  /** The note lines, already worded: "Requires Welding Consumables", "To Wharf". */
  requires: (cargoName: string) => string;
  produces: (cargoName: string) => string;
  to: (industryName: string) => string;
}

export interface GraphSources {
  industryById: ReadonlyMap<string, Industry>;
  cargoByLabel: ReadonlyMap<string, Cargo>;
}

const inches = (px: number) => (px / PX_PER_INCH).toFixed(4);
const quote = (id: string) => `"${id.replace(/"/g, '\\"')}"`;

export function buildGraph(economy: Economy, data: GraphSources, names: GraphNames): BuiltGraph {
  const { graph } = economy;
  const { tuning } = graph;
  const excluded = new Set(graph.excluded_labels);
  const supply = new Set(graph.supply_labels);
  const town = new Set(
    economy.industry_ids.filter((id) => data.industryById.get(id)?.town_industry),
  );
  // the extractor lists the town industries among the wormholes already, as FIRS's chart
  // has it; they are wormholes by construction here too, so an edge can never lead to an
  // industry that is not drawn
  const wormhole = new Set([...tuning.wormhole_industries, ...town]);
  const cloneAccept = new Set(tuning.clone_accept);
  const cloneProduce = new Set(tuning.clone_produce);

  const industryNotes = new Map<string, string[]>();
  const cargoNotes = new Map<string, string[]>();
  const noteOf = (map: Map<string, string[]>, key: string) => {
    if (!map.has(key)) map.set(key, []);
    return map.get(key)!;
  };
  const cargoName = (label: string) => {
    const cargo = data.cargoByLabel.get(label);
    return cargo ? names.cargo(cargo) : label;
  };

  const edges: GraphEdge[] = [];
  const clones: GraphNode[] = [];
  // what is drawn: the industries of the economy, less the town ones
  const drawnIndustries: Industry[] = [];

  for (const id of economy.industry_ids) {
    const industry = data.industryById.get(id);
    const eco = industry?.economies[economy.id];
    if (!industry || !eco) continue;
    const industryId = industryNodeId(id);
    const drawn = !town.has(id);
    if (drawn) drawnIndustries.push(industry);

    for (const { label } of eco.accepts) {
      if (supply.has(label)) {
        if (drawn) noteOf(industryNotes, id).push(names.requires(cargoName(label)));
        continue;
      }
      if (excluded.has(label)) continue;
      // a wormhole (or a town industry, which is not drawn at all) is named in the badge
      // instead of being reached by an edge — as FIRS keeps its chart from becoming a web;
      // the industry's own card still says what it takes
      if (wormhole.has(id)) {
        noteOf(cargoNotes, label).push(names.to(names.industry(industry)));
        if (drawn) noteOf(industryNotes, id).push(names.requires(cargoName(label)));
        continue;
      }
      const cargoId = cargoNodeId(label);
      if (cloneAccept.has(label)) {
        const cloneId = acceptCloneId(label, id);
        clones.push(cargoClone(cloneId, label, data.cargoByLabel));
        edges.push({ from: cargoId, to: cloneId, cargoLabel: label });
        edges.push({ from: cloneId, to: industryId, cargoLabel: label });
      } else {
        edges.push({ from: cargoId, to: industryId, cargoLabel: label });
      }
    }

    if (!drawn) continue;
    for (const { label } of eco.produces) {
      if (supply.has(label)) {
        noteOf(industryNotes, id).push(names.produces(cargoName(label)));
        continue;
      }
      if (excluded.has(label)) continue;
      const cargoId = cargoNodeId(label);
      if (cloneProduce.has(label)) {
        const cloneId = produceCloneId(id, label);
        clones.push(cargoClone(cloneId, label, data.cargoByLabel));
        edges.push({ from: industryId, to: cloneId, cargoLabel: label });
        edges.push({ from: cloneId, to: cargoId, cargoLabel: label });
      } else {
        edges.push({ from: industryId, to: cargoId, cargoLabel: label });
      }
    }
  }

  const nodes: GraphNode[] = [
    ...drawnIndustries.map((industry): GraphNode => {
      const notes = industryNotes.get(industry.id) ?? [];
      return {
        id: industryNodeId(industry.id),
        baseId: industry.id,
        kind: 'industry',
        industry,
        notes,
        width: INDUSTRY_WIDTH,
        height: industryHeight(notes.length),
      };
    }),
    // every cargo of the economy but the excluded ones, as FIRS draws them — with or
    // without edges
    ...economy.cargo_labels
      .filter((label) => !excluded.has(label))
      .map((label): GraphNode => {
        const notes = cargoNotes.get(label) ?? [];
        return {
          id: cargoNodeId(label),
          baseId: label,
          kind: 'cargo',
          cargo: data.cargoByLabel.get(label),
          notes,
          width: CARGO_WIDTH,
          height: cargoHeight(notes.length),
        };
      }),
    ...clones,
  ];

  return { nodes, edges, dot: toDot(economy, nodes, edges) };
}

function cargoClone(id: string, label: string, cargoByLabel: ReadonlyMap<string, Cargo>): GraphNode {
  return {
    id,
    baseId: label,
    kind: 'cargo',
    cargo: cargoByLabel.get(label),
    notes: [],
    width: CARGO_WIDTH,
    height: cargoHeight(0),
  };
}

/**
 * The DOT for the layout engine. Nodes carry their size and no label; the tuning of the
 * economy goes in as ranks, clusters (drawn without a frame — only their grouping is
 * wanted) and node groups, with references to nodes the graph does not draw dropped.
 */
function toDot(economy: Economy, nodes: GraphNode[], edges: GraphEdge[]): string {
  const known = new Set(nodes.map((node) => node.id));
  const only = (refs: string[]) => refs.filter((ref) => known.has(ref));
  const { tuning } = economy.graph;
  const lines = [
    'digraph chain {',
    '  graph [rankdir=LR, newrank=true, ranksep=0.5, nodesep=0.25];',
    '  node [shape=box, fixedsize=true, label=""];',
    '  edge [arrowhead=none];',
  ];
  for (const node of nodes) {
    lines.push(`  ${quote(node.id)} [width=${inches(node.width)}, height=${inches(node.height)}];`);
  }
  tuning.edge_groups.forEach((group, i) => {
    for (const ref of only(group)) lines.push(`  ${quote(ref)} [group=g${i}];`);
  });
  for (const edge of edges) lines.push(`  ${quote(edge.from)} -> ${quote(edge.to)};`);
  for (const { rank, nodes: refs } of tuning.ranks) {
    const members = only(refs);
    if (members.length) lines.push(`  { rank=${rank}; ${members.map(quote).join('; ')}; }`);
  }
  tuning.clusters.forEach((cluster, i) => {
    const members = only(cluster.nodes);
    if (!members.length) return;
    const rank = cluster.rank ? ` rank=${cluster.rank};` : '';
    lines.push(`  subgraph cluster_${i} { peripheries=0;${rank} ${members.map(quote).join('; ')}; }`);
  });
  lines.push('}');
  return lines.join('\n');
}
