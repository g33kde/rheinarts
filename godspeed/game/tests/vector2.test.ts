import { describe, expect, it } from 'vitest';
import { rotate } from '../src/utilities/Vector2';

describe('rotate', () => {
  it('leaves the vector unchanged at a zero angle', () => {
    const result = rotate({ x: 1, y: 0 }, 0);
    expect(result.x).toBeCloseTo(1, 10);
    expect(result.y).toBeCloseTo(0, 10);
  });

  it('rotates a vector by 90 degrees', () => {
    const result = rotate({ x: 1, y: 0 }, Math.PI / 2);
    expect(result.x).toBeCloseTo(0, 10);
    expect(result.y).toBeCloseTo(1, 10);
  });

  it('preserves vector length', () => {
    const result = rotate({ x: 3, y: 4 }, 1.23);
    expect(Math.hypot(result.x, result.y)).toBeCloseTo(5, 10);
  });
});
