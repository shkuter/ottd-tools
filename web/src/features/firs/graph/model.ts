import type { Cargo, Industry } from '../../../types';

/**
 * A node of the drawn graph. `id` is the layout node — clones of a cargo have one each —
 * while `baseId` is what the rest of the tab talks about: an industry id or a cargo label,
 * the same ids the store, the side card and `chainNodes()` already use. A clone is the
 * same cargo (spec: "Дубль — тот же груз"), so clicking it selects the cargo.
 */
export interface GraphNode {
  id: string;
  baseId: string;
  kind: 'industry' | 'cargo';
  industry?: Industry;
  cargo?: Cargo;
  /** Lines under the name: "Requires …" / "Produces …" on an industry, "To …" on a cargo. */
  notes: string[];
  width: number;
  height: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  /** The cargo travelling along the edge: what colours it. */
  cargoLabel: string;
}

export interface BuiltGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** What the layout engine is given: node sizes, edges, and the tuning of the economy. */
  dot: string;
}

/** Where the layout put a node: the top-left corner in canvas pixels. */
export interface NodePlacement {
  id: string;
  x: number;
  y: number;
}

/** A node of the graph with its place: what the canvas draws. */
export interface PlacedNode extends GraphNode {
  x: number;
  y: number;
}

/** The spline the layout drew for one edge, in canvas pixels. */
export interface EdgeSpline {
  from: string;
  to: string;
  /** SVG path data. */
  path: string;
  /** Where the edge ends, and the direction it arrives in — for the arrowhead. */
  end: { x: number; y: number; angle: number };
}

/** An edge of the graph with its spline: what the canvas draws. */
export interface PlacedEdge extends GraphEdge, EdgeSpline {}

/**
 * The layout of a DOT: places and splines, nothing of the graph's text or cargo. The DOT is
 * the same in every language, so a layout is shared across a language switch and joined
 * with the nodes and edges of the moment.
 */
export interface Layout {
  nodes: NodePlacement[];
  edges: EdgeSpline[];
  width: number;
  height: number;
}

/** DOT sizes are inches at 72 points per inch; the canvas is pixels, one per point. */
export const PX_PER_INCH = 72;

export const industryNodeId = (industryId: string) => `I:${industryId}`;
export const cargoNodeId = (label: string) => `C:${label}`;
/** A cargo drawn again beside one consumer (accept clone). */
export const acceptCloneId = (label: string, industryId: string) => `C:${label}@${industryId}`;
/** A cargo drawn again beside one producer (produce clone). */
export const produceCloneId = (industryId: string, label: string) => `I:${industryId}@${label}`;

/** The DOM id of a node's card: what the canvas points aria-activedescendant at. */
export const nodeElementId = (nodeId: string) => `graph-node-${nodeId.replace(/[^\w-]/g, '_')}`;

/** A cargo drawn beside one industry rather than the common cargo node. */
export const isClone = (nodeId: string) => nodeId.includes('@');

/**
 * The industry id or cargo label a layout node stands for. Neither FIRS ids nor cargo
 * labels contain `@` or `:`, so the clone suffix is unambiguous.
 */
export function baseNodeId(nodeId: string): string {
  const [head, tail] = nodeId.split('@');
  const [kind, name] = head.split(':');
  if (tail === undefined) return name;
  // C:<label>@<industry> is the cargo; I:<industry>@<label> is the cargo too
  return kind === 'C' ? name : tail;
}
