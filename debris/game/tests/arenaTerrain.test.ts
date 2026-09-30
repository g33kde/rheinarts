import { describe, expect, it } from 'vitest';
import {
  generateTerrain,
  isClearOfEdges,
  type KeepOut,
  type TerrainConfig,
} from '../src/systems/ArenaTerrain';

const W = 1920;
const H = 1200;

const CONFIG: TerrainConfig = {
  minCount: 3,
  maxCount: 5,
  minRadius: 40,
  maxRadius: 90,
  edgeMarginPx: 140,
  keepOutPaddingPx: 120,
  minSeparationPx: 160,
};

/** Deterministic stand-in for Math.random so a layout is reproducible in a test. */
function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('generateTerrain', () => {
  it('generates within the configured count range', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const wrecks = generateTerrain(W, H, [], CONFIG, seededRng(seed));
      expect(wrecks.length).toBeGreaterThanOrEqual(1);
      expect(wrecks.length).toBeLessThanOrEqual(CONFIG.maxCount);
    }
  });

  it('keeps every wreck clear of the arena edges, so wrap never meets terrain', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      for (const wreck of generateTerrain(W, H, [], CONFIG, seededRng(seed))) {
        expect(isClearOfEdges(wreck, W, H, CONFIG.edgeMarginPx)).toBe(true);
      }
    }
  });

  it('respects keep-out zones like spawn points and the station', () => {
    const keepOuts: KeepOut[] = [
      { position: { x: W / 2, y: H / 2 }, radius: 100 }, // space station
      { position: { x: 200, y: 200 }, radius: 60 }, // a spawn corner
    ];
    for (let seed = 1; seed <= 25; seed += 1) {
      for (const wreck of generateTerrain(W, H, keepOuts, CONFIG, seededRng(seed))) {
        for (const zone of keepOuts) {
          const gap = Math.hypot(wreck.position.x - zone.position.x, wreck.position.y - zone.position.y);
          expect(gap).toBeGreaterThanOrEqual(wreck.radius + zone.radius + CONFIG.keepOutPaddingPx);
        }
      }
    }
  });

  it('never lets two wrecks fuse into a pocket', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const wrecks = generateTerrain(W, H, [], CONFIG, seededRng(seed));
      for (let i = 0; i < wrecks.length; i += 1) {
        for (let j = i + 1; j < wrecks.length; j += 1) {
          const a = wrecks[i]!;
          const b = wrecks[j]!;
          const gap = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
          expect(gap).toBeGreaterThanOrEqual(a.radius + b.radius + CONFIG.minSeparationPx);
        }
      }
    }
  });

  it('gives up gracefully rather than hanging when nothing can fit', () => {
    // one enormous keep-out covering the whole usable arena
    const impossible: KeepOut[] = [{ position: { x: W / 2, y: H / 2 }, radius: 5000 }];
    expect(generateTerrain(W, H, impossible, CONFIG, seededRng(7))).toEqual([]);
  });

  it('is reproducible for a given seed', () => {
    const a = generateTerrain(W, H, [], CONFIG, seededRng(99));
    const b = generateTerrain(W, H, [], CONFIG, seededRng(99));
    expect(a).toEqual(b);
  });

  it('respects the configured radius range', () => {
    for (const wreck of generateTerrain(W, H, [], CONFIG, seededRng(3))) {
      expect(wreck.radius).toBeGreaterThanOrEqual(CONFIG.minRadius);
      expect(wreck.radius).toBeLessThanOrEqual(CONFIG.maxRadius);
    }
  });
});

describe('isClearOfEdges', () => {
  it('rejects a wreck straddling an edge', () => {
    const straddling = { position: { x: 10, y: 600 }, radius: 50, shapeSeed: 0 };
    expect(isClearOfEdges(straddling, W, H, 140)).toBe(false);
  });

  it('accepts one comfortably inside', () => {
    const inside = { position: { x: W / 2, y: H / 2 }, radius: 50, shapeSeed: 0 };
    expect(isClearOfEdges(inside, W, H, 140)).toBe(true);
  });
});
