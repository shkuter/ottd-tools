import { describe, expect, it } from 'vitest';
import { cargoByLabel, economyById, industryById } from '../../../../dataset';
import { buildGraph } from '../buildGraph';
import { layoutGraph, parsePlain, placeEdges, placeNodes } from '../layout';
import type { BuiltGraph } from '../model';

const graph: BuiltGraph = {
  nodes: [
    { id: 'I:mine', baseId: 'mine', kind: 'industry', notes: [], width: 72, height: 36 },
    { id: 'C:COAL', baseId: 'COAL', kind: 'cargo', notes: [], width: 72, height: 18 },
  ],
  edges: [{ from: 'I:mine', to: 'C:COAL', cargoLabel: 'COAL' }],
  dot: '',
};

// what `dot -Tplain` writes: inches, y up; the quoted names are what our ids look like
const plain = [
  'graph 1 4 2',
  'node "I:mine" 0.5 1 1 0.5 "" solid box black lightgrey',
  'node "C:COAL" 3 1.5 1 0.25 "" solid box black lightgrey',
  'edge "I:mine" "C:COAL" 4 1 1 1.5 1 2 1.5 2.5 1.5 solid black',
  'stop',
].join('\n');

describe('parsePlain', () => {
  const layout = parsePlain(plain);

  it('converts inches to pixels and flips the y axis', () => {
    expect(layout.width).toBe(288);
    expect(layout.height).toBe(144);
    const mine = layout.nodes.find((n) => n.id === 'I:mine')!;
    // centre (0.5in, 1in from the bottom) → (36, 72) px, minus half the box
    expect([mine.x, mine.y]).toEqual([0, 54]);
    // a placement is a place, not a node: the text of the moment is joined in afterwards
    expect(Object.keys(mine)).toEqual(['id', 'x', 'y']);
    expect(placeNodes(graph, layout).find((n) => n.id === 'I:mine')).toMatchObject({
      x: 0, y: 54, width: 72, kind: 'industry',
    });
  });

  it('turns the control points into one cubic path and keeps the arrival direction', () => {
    const [edge] = layout.edges;
    expect(edge).toMatchObject({ from: 'I:mine', to: 'C:COAL' });
    expect(edge.path).toBe('M72.0,72.0 C108.0,72.0 144.0,36.0 180.0,36.0');
    expect(edge.end).toEqual({ x: 180, y: 36, angle: 0 });
    // the cargo comes from the graph, joined in afterwards
    expect(placeEdges(graph, layout)[0]).toMatchObject({ cargoLabel: 'COAL', path: edge.path });
  });

  it('refuses to join a layout that does not match the graph', () => {
    const other = parsePlain(plain.replaceAll('"C:COAL"', '"C:COKE"'));
    expect(() => placeNodes(graph, other)).toThrow(/no place for C:COAL/);
    expect(() => placeEdges(graph, other)).toThrow(/no spline for I:mine -> C:COAL/);
  });
});

describe('layoutGraph with graphviz', () => {
  it('places every node and routes every edge of Steeltown', async () => {
    const built = buildGraph(
      economyById.get('STEELTOWN')!,
      { industryById, cargoByLabel },
      { industry: (i) => i.name, cargo: (c) => c.name, requires: (c) => c, produces: (c) => c, to: (i) => i },
    );
    const started = performance.now();
    const layout = await layoutGraph(built.dot);
    const took = performance.now() - started;
    expect(layout.nodes.length).toBe(built.nodes.length);
    expect(layout.edges.length).toBe(built.edges.length);
    expect(layout.width).toBeGreaterThan(1000);
    // every node lies inside the drawing
    for (const node of placeNodes(built, layout)) {
      expect(node.x).toBeGreaterThanOrEqual(-1);
      expect(node.x + node.width).toBeLessThanOrEqual(layout.width + 1);
    }
    // the same DOT is not laid out twice — and the same drawing worded in another language
    // is the same DOT, so a language switch gets the very layout it had
    expect(await layoutGraph(built.dot)).toBe(layout);
    const worded = buildGraph(
      economyById.get('STEELTOWN')!,
      { industryById, cargoByLabel },
      { industry: (i) => `Предприятие ${i.name}`, cargo: (c) => `Груз ${c.name}`, requires: (c) => `Требует: ${c}`, produces: (c) => c, to: (i) => `На ${i}` },
    );
    expect(worded.dot).toBe(built.dot);
    expect(await layoutGraph(worded.dot)).toBe(layout);
    console.info(`steeltown: ${built.nodes.length} nodes, ${built.edges.length} edges, layout ${took.toFixed(0)} ms`);
  }, 60_000);
});
