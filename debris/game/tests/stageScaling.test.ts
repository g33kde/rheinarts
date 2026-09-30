import { describe, expect, it } from 'vitest';
import {
  computeAsteroidSpawnCount,
  computeCrewMultiplier,
  computeUfoSpawnIntervalMs,
} from '../src/systems/StageScaling';

describe('computeCrewMultiplier', () => {
  it('leaves a solo player unscaled', () => {
    expect(computeCrewMultiplier(1)).toBe(1);
  });

  it('grows sub-linearly with crew size', () => {
    expect(computeCrewMultiplier(2)).toBeCloseTo(1.4, 10);
    expect(computeCrewMultiplier(3)).toBeCloseTo(1.8, 10);
    expect(computeCrewMultiplier(4)).toBeCloseTo(2.2, 10);
    // the whole point: 4 players face far less than 4x the field
    expect(computeCrewMultiplier(4)).toBeLessThan(4);
  });

  it('clamps outside the supported 1-4 player range', () => {
    expect(computeCrewMultiplier(0)).toBe(1);
    expect(computeCrewMultiplier(-3)).toBe(1);
    expect(computeCrewMultiplier(9)).toBeCloseTo(2.2, 10);
  });
});

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

  it('defaults to solo scaling when no player count is passed', () => {
    expect(computeAsteroidSpawnCount(3)).toBe(computeAsteroidSpawnCount(3, 1));
  });

  it('scales the field with crew size', () => {
    expect(computeAsteroidSpawnCount(1, 2)).toBe(6); // round(4 * 1.4)
    expect(computeAsteroidSpawnCount(1, 4)).toBe(9); // round(4 * 2.2)
    expect(computeAsteroidSpawnCount(3, 4)).toBe(13); // round(6 * 2.2)
  });

  it('applies the per-stage cap before the crew multiplier, so a full crew still scales past it', () => {
    expect(computeAsteroidSpawnCount(50, 1)).toBe(14);
    expect(computeAsteroidSpawnCount(50, 4)).toBe(31); // round(14 * 2.2)
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

  it('defaults to solo scaling when no player count is passed', () => {
    expect(computeUfoSpawnIntervalMs(3)).toBe(computeUfoSpawnIntervalMs(3, 1));
  });

  it('shortens the interval for a bigger crew', () => {
    expect(computeUfoSpawnIntervalMs(1, 2)).toBe(11429); // round(16000 / 1.4)
    expect(computeUfoSpawnIntervalMs(1, 4)).toBe(7273); // round(16000 / 2.2)
  });

  it('keeps minSpawnIntervalMs an absolute floor even for a full crew', () => {
    expect(computeUfoSpawnIntervalMs(50, 4)).toBe(6000);
    expect(computeUfoSpawnIntervalMs(8, 4)).toBe(6000); // would be ~4200 unclamped
  });
});
