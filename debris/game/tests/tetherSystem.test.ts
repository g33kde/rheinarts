import { describe, expect, it } from 'vitest';
import {
  computeTetherForce,
  distanceBetween,
  shouldAttach,
  shouldBreak,
  tetherTension,
  type TetherConfig,
} from '../src/systems/TetherSystem';

const CONFIG: TetherConfig = {
  attachDistancePx: 90,
  restLengthPx: 140,
  breakDistancePx: 420,
  stiffness: 0.00000022,
  maxForce: 0.00006,
};

describe('shouldAttach / shouldBreak', () => {
  it('links up two ships flying close together', () => {
    expect(shouldAttach(60, CONFIG)).toBe(true);
    expect(shouldAttach(200, CONFIG)).toBe(false);
  });

  it('snaps only well past the attach range, so a broken tether does not instantly re-form', () => {
    expect(shouldBreak(400, CONFIG)).toBe(false);
    expect(shouldBreak(500, CONFIG)).toBe(true);
    expect(CONFIG.attachDistancePx).toBeLessThan(CONFIG.breakDistancePx);
  });
});

describe('computeTetherForce', () => {
  it('pulls nothing at all while slack', () => {
    expect(computeTetherForce({ x: 0, y: 0 }, { x: 100, y: 0 }, CONFIG)).toEqual({ x: 0, y: 0 });
  });

  it('pulls toward the other ship once taut', () => {
    const force = computeTetherForce({ x: 0, y: 0 }, { x: 300, y: 0 }, CONFIG);
    expect(force.x).toBeGreaterThan(0);
    expect(force.y).toBeCloseTo(0, 10);
  });

  it('pulls harder the further it is stretched', () => {
    const light = computeTetherForce({ x: 0, y: 0 }, { x: 200, y: 0 }, CONFIG).x;
    const heavy = computeTetherForce({ x: 0, y: 0 }, { x: 380, y: 0 }, CONFIG).x;
    expect(heavy).toBeGreaterThan(light);
  });

  it('stays a real spring rather than saturating immediately', () => {
    // Regression: the first tuning hit maxForce at only 60px of stretch,
    // which made the tether a constant-force yank across almost its
    // whole range instead of something that builds.
    const justTaut = computeTetherForce({ x: 0, y: 0 }, { x: CONFIG.restLengthPx + 20, y: 0 }, CONFIG).x;
    expect(justTaut).toBeGreaterThan(0);
    expect(justTaut).toBeLessThan(CONFIG.maxForce * 0.25);
  });

  it('never exceeds maxForce however far it is stretched', () => {
    const extreme = computeTetherForce({ x: 0, y: 0 }, { x: 100000, y: 0 }, CONFIG);
    expect(Math.hypot(extreme.x, extreme.y)).toBeLessThanOrEqual(CONFIG.maxForce + 1e-12);
  });

  it('is symmetric - each end pulls the other equally and oppositely', () => {
    const a = { x: 10, y: 20 };
    const b = { x: 300, y: 260 };
    const onA = computeTetherForce(a, b, CONFIG);
    const onB = computeTetherForce(b, a, CONFIG);
    expect(onA.x).toBeCloseTo(-onB.x, 12);
    expect(onA.y).toBeCloseTo(-onB.y, 12);
  });

  it('is safe when both ships occupy the same point', () => {
    expect(computeTetherForce({ x: 5, y: 5 }, { x: 5, y: 5 }, CONFIG)).toEqual({ x: 0, y: 0 });
  });

  it('points diagonally for a diagonal pair', () => {
    const force = computeTetherForce({ x: 0, y: 0 }, { x: 300, y: 300 }, CONFIG);
    expect(force.x).toBeGreaterThan(0);
    expect(force.y).toBeGreaterThan(0);
    expect(force.x).toBeCloseTo(force.y, 12);
  });
});

describe('tetherTension', () => {
  it('reads zero while slack and one at the breaking point', () => {
    expect(tetherTension(100, CONFIG)).toBe(0);
    expect(tetherTension(CONFIG.restLengthPx, CONFIG)).toBe(0);
    expect(tetherTension(CONFIG.breakDistancePx, CONFIG)).toBe(1);
  });

  it('climbs in between and never leaves 0-1', () => {
    const mid = tetherTension(280, CONFIG);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(tetherTension(99999, CONFIG)).toBe(1);
  });
});

describe('distanceBetween', () => {
  it('measures a plain euclidean distance', () => {
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
