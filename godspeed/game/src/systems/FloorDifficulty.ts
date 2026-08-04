import { BOSS, FLOOR_DIFFICULTY } from '../config/GameConfig';

export interface FloorDifficulty {
  readonly enemySpeedMultiplier: number;
  readonly bossMaxHits: number;
  readonly bossAttackCooldownMs: number;
}

/**
 * Small linear scaling applied on top of whatever the floor's enemy
 * roster already does (see FloorRoster.ts) - roster composition is the
 * main difficulty lever; this is a secondary nudge so floors with the
 * same roster still feel a little tougher deeper in.
 */
export function difficultyForFloor(floor: number): FloorDifficulty {
  const step = Math.max(0, floor - 1);
  return {
    enemySpeedMultiplier: 1 + step * FLOOR_DIFFICULTY.enemySpeedStepPercent,
    bossMaxHits: BOSS.maxHits + step * FLOOR_DIFFICULTY.bossHitsStepPerFloor,
    bossAttackCooldownMs: Math.max(
      FLOOR_DIFFICULTY.bossAttackCooldownFloorMs,
      BOSS.attackCooldownMs - step * FLOOR_DIFFICULTY.bossAttackCooldownStepMs,
    ),
  };
}
