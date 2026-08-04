export type EnemyTypeName = 'drone' | 'sentinel' | 'seeker' | 'bulwark' | 'skirmisher';

/**
 * Which enemy types spawn on a given floor, in spawn-cell order. New types
 * are introduced one at a time as floors get deeper (see
 * docs/enemy_design.md for what each type actually does), rather than
 * dropping the full roster on the player from floor 1. Floor 5 and beyond
 * reuse floor 5's composition - FloorDifficulty.ts keeps raising the
 * stakes past that point via stat scaling instead of ever-longer rosters.
 */
export function enemyRosterForFloor(floor: number): EnemyTypeName[] {
  if (floor <= 1) return ['drone', 'drone', 'drone'];
  if (floor === 2) return ['drone', 'drone', 'sentinel'];
  if (floor === 3) return ['drone', 'sentinel', 'seeker'];
  if (floor === 4) return ['sentinel', 'seeker', 'bulwark'];
  return ['seeker', 'bulwark', 'skirmisher'];
}
