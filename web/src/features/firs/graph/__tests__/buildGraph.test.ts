import { describe, expect, it } from 'vitest';
import { cargoByLabel, economyById, industryById } from '../../../../dataset';
import { buildGraph, type GraphNames } from '../buildGraph';
import { acceptCloneId, baseNodeId, cargoNodeId, industryNodeId, produceCloneId } from '../model';

const english: GraphNames = {
  industry: (industry) => industry.name,
  cargo: (cargo) => cargo.name,
  requires: (cargo) => `Requires ${cargo}`,
  produces: (cargo) => `Produces ${cargo}`,
  to: (industry) => `To ${industry}`,
};
const russianish: GraphNames = {
  ...english,
  industry: (industry) => `Предприятие ${industry.name} с очень длинным именем`,
  cargo: (cargo) => `Груз ${cargo.name}`,
};
const data = { industryById, cargoByLabel };
const steeltown = economyById.get('STEELTOWN')!;

describe('buildGraph on Steeltown, as FIRS draws it', () => {
  const graph = buildGraph(steeltown, data, english);
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));

  it('keeps the supply cargos off the graph and writes them into the industry card', () => {
    expect(byId.has(cargoNodeId('WELD'))).toBe(false);
    expect(byId.has(cargoNodeId('FMSP'))).toBe(false);
    expect(graph.edges.some((e) => e.cargoLabel === 'WELD')).toBe(false);
    expect(byId.get(industryNodeId('plate_mill'))!.notes).toContain('Requires Welding Consumables');
    expect(byId.get(industryNodeId('port'))!.notes).toContain('Produces Engineering Supplies');
  });

  it('clones slag beside every furnace that makes it, joined to the common node', () => {
    const clone = produceCloneId('basic_oxygen_furnace', 'SLAG');
    expect(byId.get(clone)?.baseId).toBe('SLAG');
    expect(graph.edges).toContainEqual({ from: industryNodeId('basic_oxygen_furnace'), to: clone, cargoLabel: 'SLAG' });
    expect(graph.edges).toContainEqual({ from: clone, to: cargoNodeId('SLAG'), cargoLabel: 'SLAG' });
    // and acid beside each consumer
    const acid = acceptCloneId('ACID', 'strip_mill');
    expect(graph.edges).toContainEqual({ from: cargoNodeId('ACID'), to: acid, cargoLabel: 'ACID' });
    expect(graph.edges).toContainEqual({ from: acid, to: industryNodeId('strip_mill'), cargoLabel: 'ACID' });
  });

  it('names a wormhole in the cargo badge instead of drawing an edge to it', () => {
    const cement = byId.get(cargoNodeId('CMNT'))!;
    expect(cement.notes).toContain('To Wharf');
    expect(graph.edges.some((e) => e.to === industryNodeId('wharf'))).toBe(false);
    // the wharf's own card still says what it takes, as FIRS's chart writes it
    expect(byId.get(industryNodeId('wharf'))!.notes).toContain('Requires Cement');
    // a town industry is not a node at all, but is named the same way
    expect(byId.has(industryNodeId('hardware_store'))).toBe(false);
    expect(graph.nodes.some((node) => node.notes.includes('To Hardware Store'))).toBe(true);
  });

  it('lays the tuning into the DOT', () => {
    expect(graph.dot).toContain('{ rank=source; "I:quarry"; "I:coal_mine"; "I:iron_ore_mine"; }');
    expect(graph.dot).toContain('subgraph cluster_');
    expect(graph.dot).toContain('"I:basic_oxygen_furnace" [group=g0];');
    // no label in the DOT: the page draws the nodes, the engine only sizes them
    expect(graph.dot).not.toMatch(/label="[^"]+"/);
  });

  it('builds the same DOT in every language — only the notes change', () => {
    const other = buildGraph(steeltown, data, russianish);
    expect(other.dot).toBe(graph.dot);
    expect(other.nodes.map((n) => [n.id, n.width, n.height])).toEqual(
      graph.nodes.map((n) => [n.id, n.width, n.height]),
    );
  });
});

describe('an economy without clones', () => {
  const temperate = economyById.get('BASIC_TEMPERATE')!;
  const graph = buildGraph(temperate, data, english);

  it('draws every cargo once and no clone', () => {
    expect(graph.nodes.every((node) => !node.id.includes('@'))).toBe(true);
    expect(graph.nodes.filter((n) => n.kind === 'cargo').length).toBe(
      graph.nodes.filter((n) => n.kind === 'cargo' && n.baseId === baseNodeId(n.id)).length,
    );
  });

  it('names only the town industries in the badges', () => {
    const towns = temperate.industry_ids.filter((id) => industryById.get(id)?.town_industry);
    expect(towns.length).toBeGreaterThan(0);
    const named = new Set(
      graph.nodes.flatMap((node) => node.notes.filter((note) => note.startsWith('To ')).map((note) => note.slice(3))),
    );
    expect([...named].sort()).toEqual(towns.map((id) => industryById.get(id)!.name).sort());
  });
});

describe('a town industry the tuning forgot to list', () => {
  it('is a wormhole all the same: no edge leads to an industry that is not drawn', () => {
    const economy = {
      ...steeltown,
      graph: {
        ...steeltown.graph,
        tuning: { ...steeltown.graph.tuning, wormhole_industries: [] },
      },
    };
    const graph = buildGraph(economy, data, english);
    const drawn = new Set(graph.nodes.map((node) => node.id));
    for (const edge of graph.edges) {
      expect(drawn.has(edge.from), edge.from).toBe(true);
      expect(drawn.has(edge.to), edge.to).toBe(true);
    }
    expect(graph.nodes.some((node) => node.notes.includes('To Hardware Store'))).toBe(true);
  });
});

describe('a clone is the same cargo', () => {
  it('maps every clone onto an id the chain walk knows', () => {
    const graph = buildGraph(steeltown, data, english);
    const known = new Set(steeltown.graph.edges.flatMap((e) => [e.from, e.to]));
    const clones = graph.nodes.filter((node) => node.id.includes('@'));
    expect(clones.length).toBeGreaterThan(0);
    for (const clone of clones) {
      expect(clone.kind).toBe('cargo');
      expect(known.has(clone.baseId), clone.id).toBe(true);
      expect(baseNodeId(clone.id)).toBe(clone.baseId);
    }
  });
});

describe('baseNodeId', () => {
  it('reads the industry or cargo behind any layout node', () => {
    expect(baseNodeId('I:coal_mine')).toBe('coal_mine');
    expect(baseNodeId('C:COAL')).toBe('COAL');
    expect(baseNodeId('C:ACID@strip_mill')).toBe('ACID');
    expect(baseNodeId('I:basic_oxygen_furnace@SLAG')).toBe('SLAG');
  });
});
