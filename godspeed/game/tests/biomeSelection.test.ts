import { describe, expect, it } from 'vitest';
import { biomeIndexForClearCount, selectBiome } from '../src/systems/BiomeSelection';

describe('biomeIndexForClearCount', () => {
  it('starts at index 0 with no clears', () => {
    expect(biomeIndexForClearCount(0, 3)).toBe(0);
  });

  it('cycles through indices as clears accumulate', () => {
    expect(biomeIndexForClearCount(1, 3)).toBe(1);
    expect(biomeIndexForClearCount(2, 3)).toBe(2);
    expect(biomeIndexForClearCount(3, 3)).toBe(0);
    expect(biomeIndexForClearCount(4, 3)).toBe(1);
  });
});

describe('selectBiome', () => {
  const biomes = [
    { name: 'A', background: 0x000001, wall: 0x000011 },
    { name: 'B', background: 0x000002, wall: 0x000022 },
    { name: 'C', background: 0x000003, wall: 0x000033 },
  ];

  it('picks the biome matching the cycle position', () => {
    expect(selectBiome(0, biomes)).toEqual(biomes[0]);
    expect(selectBiome(1, biomes)).toEqual(biomes[1]);
    expect(selectBiome(3, biomes)).toEqual(biomes[0]);
  });
});
