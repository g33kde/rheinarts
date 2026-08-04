import { describe, expect, it } from 'vitest';
import { pickupTypesForFloor } from '../src/systems/FloorPickups';

describe('pickupTypesForFloor', () => {
  it('includes extraLife on odd floors', () => {
    expect(pickupTypesForFloor(1)).toContain('extraLife');
    expect(pickupTypesForFloor(3)).toContain('extraLife');
  });

  it('replaces extraLife with a second shield on even floors', () => {
    const floor2 = pickupTypesForFloor(2);
    expect(floor2).not.toContain('extraLife');
    expect(floor2.filter((type) => type === 'shield')).toHaveLength(2);
  });

  it('always returns exactly 4 pickups including speed and rapidFire', () => {
    for (const floor of [1, 2, 3, 4, 5, 10]) {
      const types = pickupTypesForFloor(floor);
      expect(types).toHaveLength(4);
      expect(types).toContain('speed');
      expect(types).toContain('rapidFire');
    }
  });
});
