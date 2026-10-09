import { describe, expect, it } from 'vitest';
import { findDenseClusterTarget, pickDropTarget, turnToward } from '../src/systems/SaboteurAI';

const SABOTEUR_POS = { x: 0, y: 0 };
const SEEK_RADIUS = 260;
const MIN_NEIGHBORS = 2;

describe('findDenseClusterTarget', () => {
  it('returns undefined when nothing is within seekRadius', () => {
    const farAsteroids = [{ x: 1000, y: 1000 }, { x: 1050, y: 1000 }, { x: 1000, y: 1050 }];
    expect(findDenseClusterTarget(SABOTEUR_POS, farAsteroids, SEEK_RADIUS, MIN_NEIGHBORS)).toBeUndefined();
  });

  it('returns undefined for a single lone asteroid - not a cluster', () => {
    const lone = [{ x: 50, y: 0 }];
    expect(findDenseClusterTarget(SABOTEUR_POS, lone, SEEK_RADIUS, MIN_NEIGHBORS)).toBeUndefined();
  });

  it('finds the center of a genuine cluster', () => {
    const cluster = [
      { x: 100, y: 0 },
      { x: 120, y: 20 },
      { x: 110, y: -20 },
    ];
    const target = findDenseClusterTarget(SABOTEUR_POS, cluster, SEEK_RADIUS, MIN_NEIGHBORS);
    expect(target).toBeDefined();
    expect(cluster).toContainEqual(target);
  });

  it('picks the denser of two candidate clusters', () => {
    // Both groups within SABOTEUR_POS's own seekRadius, but far enough
    // apart from each other (>SEEK_RADIUS) that neither sees the other -
    // otherwise every point here would count every other point as its
    // own neighbor too, defeating the point of this test.
    const sparsePair = [{ x: -200, y: 0 }, { x: -220, y: 10 }];
    const denseTrio = [
      { x: 200, y: 0 },
      { x: 210, y: 10 },
      { x: 190, y: -10 },
    ];
    const target = findDenseClusterTarget(SABOTEUR_POS, [...sparsePair, ...denseTrio], SEEK_RADIUS, MIN_NEIGHBORS);
    expect(denseTrio).toContainEqual(target);
  });
});

describe('pickDropTarget', () => {
  const asteroidCluster = [
    { x: 150, y: 0 },
    { x: 160, y: 10 },
    { x: 140, y: -10 },
  ];

  it('prefers an adrift Commander within commanderPriorityRadius over any cluster', () => {
    const commanderPos = { x: 300, y: 0 };
    const target = pickDropTarget(SABOTEUR_POS, [commanderPos], 340, asteroidCluster, SEEK_RADIUS, MIN_NEIGHBORS);
    expect(target).toEqual(commanderPos);
  });

  it('falls back to the densest cluster when no Commander is in range', () => {
    const farCommander = { x: 5000, y: 5000 };
    const target = pickDropTarget(SABOTEUR_POS, [farCommander], 340, asteroidCluster, SEEK_RADIUS, MIN_NEIGHBORS);
    expect(asteroidCluster).toContainEqual(target);
  });

  it('returns undefined when there is neither a Commander nor a cluster', () => {
    const target = pickDropTarget(SABOTEUR_POS, [], 340, [], SEEK_RADIUS, MIN_NEIGHBORS);
    expect(target).toBeUndefined();
  });
});

describe('turnToward', () => {
  it('turns toward the desired heading, capped by the max turn rate', () => {
    const result = turnToward(0, Math.PI / 2, Math.PI / 2, 1);
    expect(result).toBeCloseTo(Math.PI / 2, 5);
  });

  it('does not overshoot past the desired heading', () => {
    const result = turnToward(0, 0.1, Math.PI, 1);
    expect(result).toBeCloseTo(0.1, 5);
  });

  it('turns the short way around the wrap boundary', () => {
    // From just past +pi to just past -pi is a short hop across the
    // wrap, not a near-full-circle turn the long way.
    const result = turnToward(Math.PI - 0.1, -Math.PI + 0.1, 10, 1);
    expect(Math.abs(result - Math.PI)).toBeLessThan(0.5);
  });
});
