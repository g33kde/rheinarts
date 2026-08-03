import type { BiomeTheme } from '../config/GameConfig';

/**
 * Cycles through the biome list by how many mazes have been cleared this
 * session (docs/progression.md's mazesCleared), so descending through
 * repeated runs reads as moving through different biomes rather than the
 * same environment every time - there's no multi-floor system yet (see
 * docs/gameplay.md), so this is the simplest thing that makes "three
 * biomes" visible without one.
 */
export function biomeIndexForClearCount(mazesCleared: number, biomeCount: number): number {
  return mazesCleared % biomeCount;
}

export function selectBiome(mazesCleared: number, biomes: readonly BiomeTheme[]): BiomeTheme {
  return biomes[biomeIndexForClearCount(mazesCleared, biomes.length)]!;
}
