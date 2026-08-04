import { describe, expect, it } from 'vitest';
import { BOSS, FLOOR_DIFFICULTY } from '../src/config/GameConfig';
import { difficultyForFloor } from '../src/systems/FloorDifficulty';

describe('difficultyForFloor', () => {
  it('applies no scaling on floor 1', () => {
    const difficulty = difficultyForFloor(1);
    expect(difficulty.enemySpeedMultiplier).toBe(1);
    expect(difficulty.bossMaxHits).toBe(BOSS.maxHits);
    expect(difficulty.bossAttackCooldownMs).toBe(BOSS.attackCooldownMs);
  });

  it('scales enemy speed and boss hits up with floor depth', () => {
    const floor1 = difficultyForFloor(1);
    const floor3 = difficultyForFloor(3);
    expect(floor3.enemySpeedMultiplier).toBeGreaterThan(floor1.enemySpeedMultiplier);
    expect(floor3.bossMaxHits).toBeGreaterThan(floor1.bossMaxHits);
  });

  it('scales boss attack cooldown down but never below the floor value', () => {
    const shallow = difficultyForFloor(2);
    const deep = difficultyForFloor(50);
    expect(shallow.bossAttackCooldownMs).toBeLessThan(BOSS.attackCooldownMs);
    expect(deep.bossAttackCooldownMs).toBe(FLOOR_DIFFICULTY.bossAttackCooldownFloorMs);
  });

  it('treats floors below 1 the same as floor 1 (no negative scaling)', () => {
    expect(difficultyForFloor(0)).toEqual(difficultyForFloor(1));
  });
});
