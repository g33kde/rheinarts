import { ASTEROID, CREW_SCALING, UFO } from '../config/GameConfig';

/**
 * Four players previously fought exactly the same field as one, which
 * made Cooperative/Competitive progressively easier the more people were
 * in the room. Deliberately **sub-linear**: four players are far more
 * than 4x as effective as one (four sets of guns, and rocks get cleared
 * before they have time to split), so scaling the field linearly with
 * headcount would overshoot badly. Clamped to the 1-4 range the game
 * actually supports.
 */
export function computeCrewMultiplier(playerCount: number): number {
  const clamped = Math.min(4, Math.max(1, playerCount));
  return 1 + (clamped - 1) * CREW_SCALING.perExtraPlayer;
}

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
export function computeAsteroidSpawnCount(stageCount: number, playerCount = 1): number {
  const raw = ASTEROID.baseSpawnCount + (stageCount - 1) * ASTEROID.spawnGrowthPerStage;
  // The per-stage cap applies *before* the crew multiplier, not after -
  // maxSpawnCount is the ceiling on one player's own difficulty curve,
  // not an absolute entity budget, so a full crew still gets a field
  // scaled to its size once that curve has topped out.
  const capped = Math.min(ASTEROID.maxSpawnCount, raw);
  return Math.round(capped * computeCrewMultiplier(playerCount));
}

/**
 * Same idea as computeAsteroidSpawnCount, for the UFO's spawn cadence -
 * gets more frequent (lower interval) each stage instead of staying a
 * flat constant regardless of round progress, and more frequent again
 * with more players in the room.
 *
 * Unlike the asteroid count above, `minSpawnIntervalMs` stays an
 * **absolute** floor rather than being scaled by crew size: a UFO
 * actively hunts a player and doesn't split into something weaker when
 * killed, so letting a full crew push the cadence below that floor
 * turns into unfair spam rather than proportionate difficulty. A bigger
 * crew reaches the floor sooner; nobody goes under it.
 */
export function computeUfoSpawnIntervalMs(stageCount: number, playerCount = 1): number {
  const raw = UFO.baseSpawnIntervalMs - (stageCount - 1) * UFO.spawnIntervalStepDownMs;
  return Math.max(UFO.minSpawnIntervalMs, Math.round(raw / computeCrewMultiplier(playerCount)));
}
