import { describe, expect, it } from 'vitest';
import { economyById, industryById } from '../../../dataset';
import { carriesTheChain, industryChain } from '../dependencies';

const steeltown = economyById.get('STEELTOWN')!;
const ids = (chain: ReturnType<typeof industryChain>) => chain.nodes.map((n) => n.industry.id);

describe('industryChain', () => {
  it('walks up from the target through the industries that convert', () => {
    const chain = industryChain(steeltown, 'blast_furnace');
    // its own inputs, and the coke oven making one of them
    expect(chain.links.filter((l) => l.consumer.id === 'blast_furnace').map((l) => l.cargoLabel))
      .toEqual(['IORE', 'COKE', 'LIME']);
    expect(ids(chain)).toContain('coke_oven');
    // the coal the coke oven itself runs on is a task of the chain
    expect(chain.links.some((l) => l.consumer.id === 'coke_oven' && l.cargoLabel === 'COAL'))
      .toBe(true);
  });

  it('stops at a pool industry, whose own deliveries stay tasks', () => {
    const chain = industryChain(steeltown, 'blast_furnace');
    // the coal mine takes engineering supplies, so "no inputs" would not have stopped here
    expect(carriesTheChain(chainIndustry(chain, 'coke_oven'))).toBe(true);
    expect(carriesTheChain(chainIndustry(chain, 'coal_mine'))).toBe(false);
    // its own supplies are a task — that is what its production bonus costs
    expect(chain.links.some((l) => l.consumer.id === 'coal_mine' && l.cargoLabel === 'ENSP'))
      .toBe(true);
    // but the factories making those supplies are not part of this chain
    expect(ids(chain)).not.toContain('metal_works');
  });

  it('leaves a port the walk met a leaf of the chain', () => {
    // a soap works is what the port makes for a forge, so the port turns up as a producer
    const chain = industryChain(steeltown, 'steel_forge_and_foundry');
    expect(ids(chain)).toContain('port');
    // its seven inputs are tasks
    expect(chain.links.filter((l) => l.consumer.id === 'port').length).toBe(7);
    // and the walk stops there: what feeds the port is somebody else's chain
    const fedToPort = new Set(
      chain.links.filter((l) => l.consumer.id === 'port').flatMap((l) => l.producers.map((p) => p.id)),
    );
    const beyond = [...fedToPort].filter((id) => ids(chain).includes(id) && id !== 'port');
    // anything beyond the port only counts if the chain reached it some other way
    expect(beyond.every((id) => chain.nodes.find((n) => n.industry.id === id)!.depth <= 3)).toBe(true);
  });

  it('walks the target itself whatever rule it runs on', () => {
    // the player picked the port to feed it, so its own inputs are the chain
    const port = industryChain(steeltown, 'port');
    expect(port.links.filter((l) => l.consumer.id === 'port')).toHaveLength(7);
    expect(ids(port).length).toBeGreaterThan(1);
  });

  it('knows the producers of supplies the drawn graph leaves out', () => {
    // the graph drops ENSP/FMSP/PASS/MAIL so the picture stays readable, but those are what a
    // mine runs on: a chain built from the drawing would claim nobody makes them
    const chain = industryChain(steeltown, 'blast_furnace');
    const supplies = chain.links.find((l) => l.cargoLabel === 'ENSP')!;
    expect(supplies.producers.map((p) => p.id)).toContain('metal_works');
    expect(steeltown.graph.edges.some((e) => e.to === 'ENSP')).toBe(false);
    // and no task of any chain is left claiming its cargo has no producer at all
    for (const id of steeltown.industry_ids) {
      for (const link of industryChain(steeltown, id).links) {
        expect(link.producers.length, `${link.cargoLabel} to ${link.consumer.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps what feeds a leaf out of the chain', () => {
    const chain = industryChain(steeltown, 'blast_furnace');
    const walked = new Set(ids(chain));
    for (const node of chain.nodes) {
      if (carriesTheChain(node.industry) || node.depth === 0) continue;
      // this one is a leaf: the industries making its inputs belong to somebody else's chain
      for (const link of chain.links.filter((l) => l.consumer.id === node.industry.id)) {
        for (const producer of link.producers) {
          if (walked.has(producer.id)) {
            // unless the chain reached it another way, through an industry that converts
            const other = chain.links.some(
              (l) => l.producers.includes(producer) && carriesTheChain(l.consumer),
            );
            expect(other, `${producer.id} joined the chain only through a leaf`).toBe(true);
          }
        }
      }
    }
  });

  it('names every industry once, however many paths reach it', () => {
    for (const id of steeltown.industry_ids) {
      const chain = industryChain(steeltown, id);
      expect(new Set(ids(chain)).size).toBe(chain.nodes.length);
    }
  });

  it('knows nothing of an industry the economy does not have', () => {
    expect(industryChain(steeltown, 'nonexistent_industry')).toEqual({ nodes: [], links: [] });
    // a brewery is in the catalogue, just not in this economy — the walk has to tell the two
    // apart, or a chain would be built out of industries the game does not generate
    expect(industryById.has('brewery')).toBe(true);
    expect(steeltown.industry_ids).not.toContain('brewery');
    expect(industryChain(steeltown, 'brewery')).toEqual({ nodes: [], links: [] });
  });

  it('takes no industry of another economy for a producer', () => {
    const inChain = new Set(
      steeltown.industry_ids.flatMap((id) =>
        industryChain(steeltown, id).links.flatMap((link) => link.producers.map((p) => p.id)),
      ),
    );
    for (const id of inChain) expect(steeltown.industry_ids).toContain(id);
  });
});

function chainIndustry(chain: ReturnType<typeof industryChain>, id: string) {
  return chain.nodes.find((n) => n.industry.id === id)!.industry;
}
