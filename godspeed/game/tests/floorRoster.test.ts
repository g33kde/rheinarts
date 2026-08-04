import { describe, expect, it } from 'vitest';
import { enemyRosterForFloor } from '../src/systems/FloorRoster';

describe('enemyRosterForFloor', () => {
  it('is three drones on floor 1', () => {
    expect(enemyRosterForFloor(1)).toEqual(['drone', 'drone', 'drone']);
  });

  it('introduces exactly one new type per floor through floor 5', () => {
    const seenByFloor = [1, 2, 3, 4, 5].map((floor) => new Set(enemyRosterForFloor(floor)));
    for (let i = 1; i < seenByFloor.length; i += 1) {
      const previous = seenByFloor[i - 1]!;
      const current = seenByFloor[i]!;
      const newTypes = [...current].filter((type) => !previous.has(type));
      expect(newTypes.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('always returns exactly three enemies (matches the four fixed spawn corners minus the boss slot)', () => {
    for (const floor of [1, 2, 3, 4, 5, 10, 100]) {
      expect(enemyRosterForFloor(floor)).toHaveLength(3);
    }
  });

  it('floor 5 and beyond reuse the same composition', () => {
    expect(enemyRosterForFloor(5)).toEqual(enemyRosterForFloor(9));
    expect(enemyRosterForFloor(5)).toEqual(enemyRosterForFloor(100));
  });
});
