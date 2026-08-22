import { describe, expect, it } from 'vitest';
import { pickActiveCargo } from '../useActiveCargo';
import { activeCargos } from '../../dataset';
import { DEFAULT_GAME_SETTINGS } from '../../engine/settings';

const steeltown = activeCargos({ ...DEFAULT_GAME_SETTINGS, firsEconomy: 'STEELTOWN' });
const temperate = activeCargos({ ...DEFAULT_GAME_SETTINGS, firsEconomy: 'BASIC_TEMPERATE' });

describe('pickActiveCargo', () => {
  it('keeps a choice the active set still holds', () => {
    const coal = temperate.find((c) => c.label === 'COAL')!;
    expect(pickActiveCargo(temperate, 'COAL')).toBe(coal);
  });

  it('falls back to the first cargo when the economy no longer has the choice', () => {
    // FEAL is a Steeltown cargo; Temperate Basic has no such thing
    const dropped = steeltown.find((c) => c.label === 'FEAL')!;
    expect(dropped).toBeDefined();
    expect(temperate.some((c) => c.label === 'FEAL')).toBe(false);
    expect(pickActiveCargo(temperate, 'FEAL')).toBe(temperate[0]);
  });

  it('gives null when there is nothing to offer', () => {
    expect(pickActiveCargo([], 'COAL')).toBeNull();
  });
});
