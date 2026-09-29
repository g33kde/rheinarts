import { describe, expect, it } from 'vitest';
import { computeAsteroidSpawnCount, computeUfoSpawnIntervalMs } from '../src/systems/StageScaling';

describe('computeAsteroidSpawnCount', () => {
  it('starts at the base count on stage 1', () => {
    expect(computeAsteroidSpawnCount(1)).toBe(4);
  });

  it('climbs by spawnGrowthPerStage each subsequent stage', () => {
    expect(computeAsteroidSpawnCount(2)).toBe(5);
    expect(computeAsteroidSpawnCount(3)).toBe(6);
    expect(computeAsteroidSpawnCount(6)).toBe(9);
  });

  it('caps at maxSpawnCount and never exceeds it on later stages', () => {
    expect(computeAsteroidSpawnCount(11)).toBe(14);
    expect(computeAsteroidSpawnCount(12)).toBe(14);
    expect(computeAsteroidSpawnCount(50)).toBe(14);
  });
});

describe('computeUfoSpawnIntervalMs', () => {
  it('starts at the base interval on stage 1', () => {
    expect(computeUfoSpawnIntervalMs(1)).toBe(16000);
  });

  it('steps down by spawnIntervalStepDownMs each subsequent stage', () => {
    expect(computeUfoSpawnIntervalMs(2)).toBe(15200);
    expect(computeUfoSpawnIntervalMs(3)).toBe(14400);
  });

  it('floors at minSpawnIntervalMs and never goes below it on later stages', () => {
    expect(computeUfoSpawnIntervalMs(13)).toBe(6400);
    expect(computeUfoSpawnIntervalMs(14)).toBe(6000);
    expect(computeUfoSpawnIntervalMs(50)).toBe(6000);
  });
});
