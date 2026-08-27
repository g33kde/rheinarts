import { describe, expect, it } from 'vitest';
import { computeCaptureVelocity, computeGravityForce, isCaptured, isLethal } from '../src/systems/BlackHoleGravity';

const HOLE = { x: 500, y: 500 };
const GRAVITY_RADIUS = 260;
const EVENT_HORIZON_RADIUS = 70;
const LETHAL_RADIUS = 14;
const MAX_FORCE = 0.00002;

describe('computeGravityForce', () => {
  it('is zero outside the gravity radius', () => {
    const farAway = { x: HOLE.x + GRAVITY_RADIUS + 50, y: HOLE.y };
    expect(computeGravityForce(farAway, HOLE, GRAVITY_RADIUS, EVENT_HORIZON_RADIUS, MAX_FORCE)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('is zero once inside the event horizon (capture takes over instead)', () => {
    const insideHorizon = { x: HOLE.x + EVENT_HORIZON_RADIUS - 5, y: HOLE.y };
    expect(
      computeGravityForce(insideHorizon, HOLE, GRAVITY_RADIUS, EVENT_HORIZON_RADIUS, MAX_FORCE),
    ).toEqual({ x: 0, y: 0 });
  });

  it('points toward the hole in the escapable band', () => {
    const pos = { x: HOLE.x + 150, y: HOLE.y };
    const force = computeGravityForce(pos, HOLE, GRAVITY_RADIUS, EVENT_HORIZON_RADIUS, MAX_FORCE);
    expect(force.x).toBeLessThan(0); // pulled toward -x, back to the hole
    expect(force.y).toBeCloseTo(0);
  });

  it('is stronger closer to the event horizon than near the outer edge', () => {
    const near = computeGravityForce({ x: HOLE.x + 90, y: HOLE.y }, HOLE, GRAVITY_RADIUS, EVENT_HORIZON_RADIUS, MAX_FORCE);
    const far = computeGravityForce({ x: HOLE.x + 250, y: HOLE.y }, HOLE, GRAVITY_RADIUS, EVENT_HORIZON_RADIUS, MAX_FORCE);
    expect(Math.abs(near.x)).toBeGreaterThan(Math.abs(far.x));
  });
});

describe('isCaptured', () => {
  it('is false outside the event horizon', () => {
    expect(isCaptured({ x: HOLE.x + 100, y: HOLE.y }, HOLE, EVENT_HORIZON_RADIUS)).toBe(false);
  });

  it('is true inside the event horizon', () => {
    expect(isCaptured({ x: HOLE.x + 30, y: HOLE.y }, HOLE, EVENT_HORIZON_RADIUS)).toBe(true);
  });
});

describe('isLethal', () => {
  it('is false outside the lethal radius', () => {
    expect(isLethal({ x: HOLE.x + 20, y: HOLE.y }, HOLE, LETHAL_RADIUS)).toBe(false);
  });

  it('is true inside the lethal radius', () => {
    expect(isLethal({ x: HOLE.x + 5, y: HOLE.y }, HOLE, LETHAL_RADIUS)).toBe(true);
  });
});

describe('computeCaptureVelocity', () => {
  it('points toward the hole', () => {
    const pos = { x: HOLE.x, y: HOLE.y + 50 };
    const velocity = computeCaptureVelocity(pos, HOLE, EVENT_HORIZON_RADIUS, 1.5, 0.05);
    expect(velocity.y).toBeLessThan(0); // pulled toward -y, back to the hole
    expect(velocity.x).toBeCloseTo(0);
  });

  it('speeds up the closer it gets to center', () => {
    const nearEdge = computeCaptureVelocity({ x: HOLE.x + 65, y: HOLE.y }, HOLE, EVENT_HORIZON_RADIUS, 1.5, 0.05);
    const nearCenter = computeCaptureVelocity({ x: HOLE.x + 10, y: HOLE.y }, HOLE, EVENT_HORIZON_RADIUS, 1.5, 0.05);
    expect(Math.abs(nearCenter.x)).toBeGreaterThan(Math.abs(nearEdge.x));
  });

  it('never drops below the base speed, even right at the event horizon boundary', () => {
    const atBoundary = computeCaptureVelocity({ x: HOLE.x + EVENT_HORIZON_RADIUS, y: HOLE.y }, HOLE, EVENT_HORIZON_RADIUS, 1.5, 0.05);
    expect(Math.hypot(atBoundary.x, atBoundary.y)).toBeCloseTo(1.5, 5);
  });
});
