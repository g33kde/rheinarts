import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../config/GameConfig';
import { wrapAxis } from '../systems/MovementSystem';

export const EARTH_TEXTURE_KEY = 'earthPhoto';
export const JUPITER_TEXTURE_KEY = 'jupiterPhoto';

interface Star {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  speedPxPerSec: number;
}

const FAR_STAR_COUNT = 90;
const NEAR_STAR_COUNT = 50;
const NEAR_STAR_SPEED_PX_PER_SEC = 14;

function generateStars(count: number, alphaRange: [number, number], radiusRange: [number, number], rng: () => number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: rng() * ARENA_WIDTH,
      y: rng() * ARENA_HEIGHT,
      radius: radiusRange[0] + rng() * (radiusRange[1] - radiusRange[0]),
      alpha: alphaRange[0] + rng() * (alphaRange[1] - alphaRange[0]),
      speedPxPerSec: 0,
    });
  }
  return stars;
}

/**
 * Two star layers (dim near-static far layer, brighter slowly-drifting
 * near layer) plus two real-photo planets, `earth.jpg` and `jupiter.jpg`,
 * each circular-clipped (Phaser `GeometryMask`). No nebula wash, no
 * procedural moon - both removed on request; Jupiter's photo replaces the
 * moon in the same lower-left slot instead of a generated gradient circle.
 *
 * Originally specced (with the nebula wash + moon) for the *menu*
 * background in `docs/art_direction.md`; redirected to the play field
 * per an earlier explicit instruction, then trimmed to just the two
 * planets + stars per this one - both docs updated to match, not
 * silently diverged from.
 *
 * Simplification kept from before: only the near star layer actually
 * drifts, both planets are static - animating a real photo's circular
 * mask in lockstep every frame is an extra per-frame failure mode for a
 * subtle effect this environment can't visually verify.
 */
export class PlayfieldBackground {
  private readonly nearStars: Star[];
  private readonly starsGraphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, rng: () => number = Math.random) {
    const farStars = generateStars(FAR_STAR_COUNT, [0.25, 0.45], [0.6, 1.1], rng);
    this.nearStars = generateStars(NEAR_STAR_COUNT, [0.5, 0.9], [1.1, 1.9], rng).map((star) => ({
      ...star,
      speedPxPerSec: NEAR_STAR_SPEED_PX_PER_SEC * (0.6 + rng() * 0.8),
    }));

    const farGraphics = scene.add.graphics();
    drawStars(farGraphics, farStars);

    this.starsGraphics = scene.add.graphics();
    drawStars(this.starsGraphics, this.nearStars);

    // Jupiter: smaller, lower-left - where the procedural moon used to be.
    drawPlanetPhoto(scene, JUPITER_TEXTURE_KEY, ARENA_WIDTH * 0.12, ARENA_HEIGHT * 0.84, 80);
    // Earth: primary planet, upper-right - ~58px at the original 960-wide
    // reference composition, scaled 2x for this arena.
    drawPlanetPhoto(scene, EARTH_TEXTURE_KEY, ARENA_WIDTH * 0.82, ARENA_HEIGHT * 0.2, 116, 0xbfd9ff);
  }

  update(deltaSeconds: number): void {
    for (const star of this.nearStars) {
      star.x = wrapAxis(star.x + star.speedPxPerSec * deltaSeconds, star.radius, ARENA_WIDTH);
    }
    drawStars(this.starsGraphics, this.nearStars);
  }
}

function drawStars(g: Phaser.GameObjects.Graphics, stars: readonly Star[]): void {
  g.clear();
  for (const star of stars) {
    g.fillStyle(0xffffff, star.alpha);
    g.fillCircle(star.x, star.y, star.radius);
  }
}

/** `tint` is an optional cool color grade, per docs/art_direction.md's note that a raw photo needs a touch of it to read as "in this game's world." */
function drawPlanetPhoto(scene: Phaser.Scene, textureKey: string, x: number, y: number, radius: number, tint?: number): void {
  const image = scene.add.image(x, y, textureKey);
  image.setDisplaySize(radius * 2, radius * 2);
  if (tint !== undefined) image.setTint(tint);

  const maskShape = scene.add.graphics();
  maskShape.fillStyle(0xffffff);
  maskShape.fillCircle(x, y, radius);
  maskShape.setVisible(false);
  image.setMask(maskShape.createGeometryMask());
}
