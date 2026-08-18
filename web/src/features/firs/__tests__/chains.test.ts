import { describe, expect, it } from 'vitest';
import type { Economy } from '../../../types';
import { chainNodes } from '../chains';

const eco = {
  graph: {
    edges: [
      { from: 'coal_mine', to: 'COAL', kind: 'produces' },
      { from: 'COAL', to: 'steel_mill', kind: 'accepts' },
      { from: 'steel_mill', to: 'STEL', kind: 'produces' },
      { from: 'farm', to: 'GRAI', kind: 'produces' },
    ],
  },
} as unknown as Economy;

describe('chainNodes', () => {
  it('reaches downstream and upstream of the start node', () => {
    expect([...chainNodes(eco, 'COAL')].sort()).toEqual(['COAL', 'coal_mine', 'steel_mill', 'STEL'].sort());
  });

  it('a separate chain stays out', () => {
    expect(chainNodes(eco, 'COAL').has('farm')).toBe(false);
    expect([...chainNodes(eco, 'farm')].sort()).toEqual(['GRAI', 'farm']);
  });

  it('unknown node yields only itself', () => {
    expect([...chainNodes(eco, 'nope')]).toEqual(['nope']);
  });
});
