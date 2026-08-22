export type AsteroidSize = 'large' | 'medium' | 'small';

const NEXT_SIZE: Record<AsteroidSize, AsteroidSize | null> = {
  large: 'medium',
  medium: 'small',
  small: null,
};

/** What a destroyed asteroid splits into - null means it's gone for good (small). */
export function nextAsteroidSize(size: AsteroidSize): AsteroidSize | null {
  return NEXT_SIZE[size];
}

// +/- this many radians off the parent's original heading, per child.
// "Deliberately a little unpredictable" per docs/gameplay.md, not aimed
// away from the shot or perpendicular to it.
const SPLIT_SPREAD_RAD = Math.PI / 3;

/** A split child's heading - call once per child, each gets its own random offset. */
export function splitHeading(parentHeadingRad: number, rng: () => number = Math.random): number {
  const offset = (rng() - 0.5) * 2 * SPLIT_SPREAD_RAD;
  return parentHeadingRad + offset;
}
