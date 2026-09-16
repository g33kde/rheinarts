import { describe, expect, it } from 'vitest';
import { distanceToSegment, isPointOnBeam } from '../src/systems/BeamGeometry';

describe('distanceToSegment', () => {
  it('is zero for a point on the segment', () => {
    expect(distanceToSegment({ x: 50, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(0);
  });

  it('measures perpendicular distance to the middle of the segment', () => {
    expect(distanceToSegment({ x: 50, y: 20 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(20);
  });

  it('clamps to the nearest endpoint past the segment', () => {
    expect(distanceToSegment({ x: 150, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBeCloseTo(50);
  });
});

describe('isPointOnBeam', () => {
  it('is true for a point within width/2 of the beam line', () => {
    expect(isPointOnBeam({ x: 50, y: 3 }, { x: 0, y: 0 }, 0, 100, 10)).toBe(true);
  });

  it('is false for a point beyond width/2 of the beam line', () => {
    expect(isPointOnBeam({ x: 50, y: 20 }, { x: 0, y: 0 }, 0, 100, 10)).toBe(false);
  });

  it('is false for a point past the beam length, even if collinear', () => {
    expect(isPointOnBeam({ x: 500, y: 0 }, { x: 0, y: 0 }, 0, 100, 10)).toBe(false);
  });

  it('defaults pointRadius to 0 - a point just past width/2 alone still misses', () => {
    expect(isPointOnBeam({ x: 50, y: 6 }, { x: 0, y: 0 }, 0, 100, 10)).toBe(false);
  });

  it('a pointRadius widens the effective corridor by that amount', () => {
    // width/2 = 5, so y=6 alone misses (see above) - +2 radius covers it.
    expect(isPointOnBeam({ x: 50, y: 6 }, { x: 0, y: 0 }, 0, 100, 10, 2)).toBe(true);
  });

  it('a target still outside width/2 + pointRadius misses', () => {
    expect(isPointOnBeam({ x: 50, y: 20 }, { x: 0, y: 0 }, 0, 100, 10, 2)).toBe(false);
  });
});
