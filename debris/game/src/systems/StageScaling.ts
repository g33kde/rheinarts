import { ASTEROID, UFO } from '../config/GameConfig';

/**
 * "Fewer of both on early stages, climbing per stage instead of jumping
 * once and flattening out" (docs/roadmap.md's "Stage-scaled asteroid/UFO
 * counts") - replaces the old flat `spawnCountPerWave` (stage 1) /
 * `spawnCountPerWave + waveGrowthPerLevel` (every stage after, forever)
 * two-tier formula outright, not layered on top of it. `stageCount` is
 * `GameScene.normalStageCount` - 1 for the round's first wave (spawned
 * directly in `create()`), incremented once per subsequent normal-stage
 * transition in `beginNextLevel()` (boss stages don't advance it - they
 * spawn their own small fixed ambient wave, a separate system).
 */
export function computeAsteroidSpawnCount(stageCount: number): number {
  const raw = ASTEROID.baseSpawnCount + (stageCount - 1) * ASTEROID.spawnGrowthPerStage;
  return Math.min(ASTEROID.maxSpawnCount, raw);
}

/** Same idea as computeAsteroidSpawnCount, for the UFO's spawn cadence - gets more frequent (lower interval) each stage instead of staying a flat constant regardless of round progress. */
export function computeUfoSpawnIntervalMs(stageCount: number): number {
  const raw = UFO.baseSpawnIntervalMs - (stageCount - 1) * UFO.spawnIntervalStepDownMs;
  return Math.max(UFO.minSpawnIntervalMs, raw);
}
