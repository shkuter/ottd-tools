/**
 * Laying the graph out: graphviz (WASM, loaded on first use) places the nodes and routes
 * the edges; the page draws both itself. The `plain` output format is read rather than
 * SVG or JSON because it states exactly what is needed — a centre and a size per node, the
 * control points per edge — in inches with the y axis pointing up, converted here to
 * canvas pixels with y pointing down.
 *
 * A layout is a function of the DOT text and nothing else, and the DOT carries no text of
 * the nodes, so one layout serves every language: `placeNodes` / `placeEdges` join it with
 * the graph of the moment.
 */
import {
  PX_PER_INCH,
  type BuiltGraph,
  type EdgeSpline,
  type Layout,
  type NodePlacement,
  type PlacedEdge,
  type PlacedNode,
} from './model';

/** Layouts by DOT text: the DOT is language-independent, so a language switch hits the cache. */
const cache = new Map<string, Layout>();

/** The layout of this DOT if it has been made already — so a page need not wait, or blink. */
export const cachedLayout = (dot: string): Layout | undefined => cache.get(dot);

export async function layoutGraph(dot: string): Promise<Layout> {
  const cached = cache.get(dot);
  if (cached) return cached;
  const { Graphviz } = await import('@hpcc-js/wasm-graphviz');
  const graphviz = await Graphviz.load();
  const layout = parsePlain(graphviz.layout(dot, 'plain', 'dot'));
  cache.set(dot, layout);
  return layout;
}

/** The nodes of the graph at the places the layout gave them. */
export function placeNodes(graph: BuiltGraph, layout: Layout): PlacedNode[] {
  const at = new Map(layout.nodes.map((place) => [place.id, place]));
  return graph.nodes.map((node) => {
    const place = at.get(node.id);
    if (!place) throw new Error(`the layout has no place for ${node.id}`);
    return { ...node, x: place.x, y: place.y };
  });
}

/** The edges of the graph on the splines the layout drew for them. */
export function placeEdges(graph: BuiltGraph, layout: Layout): PlacedEdge[] {
  const along = new Map(layout.edges.map((edge) => [`${edge.from}->${edge.to}`, edge]));
  return graph.edges.map((edge) => {
    const spline = along.get(`${edge.from}->${edge.to}`);
    if (!spline) throw new Error(`the layout has no spline for ${edge.from} -> ${edge.to}`);
    return { ...edge, ...spline };
  });
}

/** Tokens of a `plain` line: names with special characters come quoted. */
function tokens(line: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g;
  for (const match of line.matchAll(re)) out.push(match[1] !== undefined ? match[1].replace(/\\"/g, '"') : match[2]);
  return out;
}

export function parsePlain(plain: string): Layout {
  let height = 0;
  let width = 0;
  const nodes: NodePlacement[] = [];
  const edges: EdgeSpline[] = [];
  for (const line of plain.split('\n')) {
    const fields = tokens(line);
    if (fields[0] === 'graph') {
      width = Number(fields[2]) * PX_PER_INCH;
      height = Number(fields[3]) * PX_PER_INCH;
    } else if (fields[0] === 'node') {
      // name x y width height …: the centre and the box, both in inches
      const [, id, x, y, w, h] = fields;
      const cx = Number(x) * PX_PER_INCH;
      const cy = height - Number(y) * PX_PER_INCH;
      nodes.push({ id, x: cx - (Number(w) * PX_PER_INCH) / 2, y: cy - (Number(h) * PX_PER_INCH) / 2 });
    } else if (fields[0] === 'edge') {
      const [, from, to, count] = fields;
      const n = Number(count);
      const points: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        points.push([
          Number(fields[4 + i * 2]) * PX_PER_INCH,
          height - Number(fields[5 + i * 2]) * PX_PER_INCH,
        ]);
      }
      edges.push({ from, to, path: splinePath(points), end: endOf(points) });
    }
  }
  return { nodes, edges, width, height };
}

/** graphviz splines are piecewise cubic Béziers: a start point, then triples of controls. */
function splinePath(points: [number, number][]): string {
  const f = (v: number) => v.toFixed(1);
  const [start, ...rest] = points;
  let d = `M${f(start[0])},${f(start[1])}`;
  for (let i = 0; i + 2 < rest.length; i += 3) {
    const [a, b, c] = [rest[i], rest[i + 1], rest[i + 2]];
    d += ` C${f(a[0])},${f(a[1])} ${f(b[0])},${f(b[1])} ${f(c[0])},${f(c[1])}`;
  }
  return d;
}

function endOf(points: [number, number][]) {
  const last = points[points.length - 1];
  const before = points[points.length - 2] ?? last;
  return { x: last[0], y: last[1], angle: Math.atan2(last[1] - before[1], last[0] - before[0]) };
}
