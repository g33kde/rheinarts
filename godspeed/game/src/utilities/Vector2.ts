export interface Vector2 {
  x: number;
  y: number;
}

export function normalize(vector: Vector2): Vector2 {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) {
    return { x: 0, y: 0 };
  }
  return { x: vector.x / length, y: vector.y / length };
}

/** Rotates a vector by an angle (radians), preserving its length. */
export function rotate(vector: Vector2, angleRadians: number): Vector2 {
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}
