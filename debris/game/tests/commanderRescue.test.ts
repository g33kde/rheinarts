import { describe, expect, it } from 'vitest';
import { computeTowPosition, hasRescueWindowExpired, isWithinDropOffRange } from '../src/systems/CommanderRescue';

describe('hasRescueWindowExpired', () => {
  it('is false before the window elapses', () => {
    expect(hasRescueWindowExpired(0, 9999, 10000)).toBe(false);
  });

  it('is true exactly at the window boundary', () => {
    expect(hasRescueWindowExpired(0, 10000, 10000)).toBe(true);
  });

  it('is true well past the window', () => {
    expect(hasRescueWindowExpired(0, 25000, 10000)).toBe(true);
  });
});

describe('computeTowPosition', () => {
  it('trails directly behind a ship facing right (heading 0)', () => {
    const result = computeTowPosition({ x: 100, y: 100 }, 0, 20);
    expect(result.x).toBeCloseTo(80);
    expect(result.y).toBeCloseTo(100);
  });

  it('trails behind a ship facing down (heading +90deg, screen coords)', () => {
    const result = computeTowPosition({ x: 100, y: 100 }, Math.PI / 2, 20);
    expect(result.x).toBeCloseTo(100);
    expect(result.y).toBeCloseTo(80);
  });
});

describe('isWithinDropOffRange', () => {
  const station = { x: 960, y: 600 };

  it('is true exactly on the station', () => {
    expect(isWithinDropOffRange(station, station, 40)).toBe(true);
  });

  it('is true within the radius', () => {
    expect(isWithinDropOffRange({ x: 980, y: 600 }, station, 40)).toBe(true);
  });

  it('is false outside the radius', () => {
    expect(isWithinDropOffRange({ x: 1050, y: 600 }, station, 40)).toBe(false);
  });
});
