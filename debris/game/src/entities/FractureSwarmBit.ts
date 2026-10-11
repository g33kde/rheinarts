import Phaser from 'phaser';
import { COLORS, FRACTURE } from '../config/GameConfig';
import { CATEGORY } from '../systems/CollisionCategories';
import { wrapPosition } from '../systems/MovementSystem';
import type { Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from './MatterGameObject';

interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The two pickup silhouettes a bit can roll, picked live against a mockup over the original tetromino blocks (too puzzle-game at FRACTURE.swarmRadius's doubled size) and over five other flat-fill candidates (ingot, coil, gear tooth, cluster, token) - these two won on being an unfilled wireframe, the same rendering language the original 1979 Asteroids ship itself used, rather than another flat-shaded shape. */
export type SwarmBitKind = 'core' | 'cargo';

/** Half-extents (px) of the rectangular prism each kind draws - a cube for Core, a long thin box for Cargo. Both prisms share one vertex/edge topology (`PRISM_EDGES` below); only these three numbers differ. */
const HALF_EXTENTS: Record<SwarmBitKind, Vec3> = {
  core: { x: 15, y: 15, z: 15 },
  cargo: { x: 19, y: 7.6, z: 7.6 },
};

// Fixed tilt around the horizontal axis, same purpose as an isometric
// game's camera pitch: without it a Y-axis-only spin reads as a flat
// shape on a turntable rather than a solid tumbling in space.
const BASE_TILT = 0.55;

// The 8 corners of a unit box, in the fixed generation order every index
// below assumes: x sign outermost, then y, then z.
const SIGNS: readonly number[] = [-1, 1];

/** Index pairs into `prismVertices`'s output that are exactly one sign away from each other - the 12 edges of a rectangular prism, regardless of its half-extents. */
const PRISM_EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 2],
  [0, 4],
  [1, 3],
  [1, 5],
  [2, 3],
  [2, 6],
  [3, 7],
  [4, 5],
  [4, 6],
  [5, 7],
  [6, 7],
];

function prismVertices(half: Vec3): Vec3[] {
  const verts: Vec3[] = [];
  for (const sx of SIGNS) {
    for (const sy of SIGNS) {
      for (const sz of SIGNS) {
        verts.push({ x: sx * half.x, y: sy * half.y, z: sz * half.z });
      }
    }
  }
  return verts;
}

/** Rotates a local point around the vertical axis by `spin` (the tumble), then tilts the whole result by `tilt` (the fixed camera-pitch-equivalent) - same two-step rotation a flight-sim-style wireframe renderer would use, kept to exactly what's needed since there's no third axis or perspective divide here. */
function project3D(p: Vec3, spin: number, tilt: number): Vec3 {
  const cosSpin = Math.cos(spin);
  const sinSpin = Math.sin(spin);
  const x1 = p.x * cosSpin + p.z * sinSpin;
  const z1 = -p.x * sinSpin + p.z * cosSpin;

  const cosTilt = Math.cos(tilt);
  const sinTilt = Math.sin(tilt);
  const y2 = p.y * cosTilt - z1 * sinTilt;
  const z2 = p.y * sinTilt + z1 * cosTilt;

  return { x: x1, y: y2, z: z2 };
}

/**
 * Phase 3 of The Fracture (docs/roadmap.md) - one of several spawned on
 * a Fragment's death; also reused as-is for The Cardinal's own arm-scrap
 * (`GameScene.processPendingCardinalArmHits`) - the pickup mechanic and
 * visual don't need to know which boss dropped it. **Always safe to
 * touch, decided via `AskUserQuestion`** - a pickup, not a hazard,
 * unlike every other Fracture tier: collecting one adds 1 to that
 * player's scrap count (`GameScene.processPendingScrapPickups`), the
 * same touch-to-collect shape `Shield` pickups already use. No
 * hitsRemaining, no shooting - its collision mask is `CATEGORY.SHIP`
 * only, a player's own shots pass straight through.
 *
 * Redesigned a second time, decided after a live mockup comparison: each
 * pickup now rolls one of two unfilled wireframe prisms (`SwarmBitKind`
 * above) tumbling in true 3D - "Shattered Core," a cube, standing in for
 * a dead satellite's structural skeleton, and "Cargo Crate," an
 * elongated box, reading as a salvaged module by proportion alone. Both
 * replace the earlier tetromino-block look, which read fine at the
 * original `FRACTURE.swarmRadius` but started looking like a
 * puzzle-game piece once that radius doubled.
 */
export class FractureSwarmBit {
  readonly visual: MatterGameObject<Phaser.GameObjects.Graphics>;
  private readonly kind_: SwarmBitKind;
  private readonly halfExtents: Vec3;
  private readonly depthRange: number;
  private readonly spinSpeed: number;
  private readonly spinPhase: number;
  private readonly bobPhase: number;
  private readonly spawnedAtMs: number;
  private alive = true;

  constructor(
    scene: Phaser.Scene,
    position: Vector2,
    headingRad: number,
    nowMs: number,
    rng: () => number = Math.random,
  ) {
    this.spawnedAtMs = nowMs;
    this.kind_ = rng() < 0.5 ? 'core' : 'cargo';
    this.halfExtents = HALF_EXTENTS[this.kind_];
    // Edges near this (plus or minus) are treated as "facing the camera"
    // for the depth-fade below - derived from the shape's own footprint
    // rather than a shared constant, so Cargo's longer silhouette fades
    // over the same proportional range Core's does.
    this.depthRange = Math.hypot(this.halfExtents.x, this.halfExtents.z);
    this.spinSpeed = (rng() - 0.5) * 0.8; // rad/sec, same slow-tumble range the old 2D spin used
    this.spinPhase = rng() * Math.PI * 2; // random starting orientation, so a field of these doesn't spawn all facing identically
    this.bobPhase = rng() * Math.PI * 2;

    const visual = scene.add.graphics();
    scene.matter.add.gameObject(visual, {
      shape: { type: 'circle', radius: FRACTURE.swarmRadius },
      isSensor: true, // a pickup, not a solid obstacle - never physically pushes a ship around
      frictionAir: 0,
      friction: 0,
      frictionStatic: 0,
      collisionFilter: {
        category: CATEGORY.FRACTURE,
        mask: CATEGORY.SHIP,
      },
    });
    this.visual = visual as MatterGameObject<Phaser.GameObjects.Graphics>;
    this.visual.setPosition(position.x, position.y);
    this.visual.setData('entity', this);
    this.visual.setVelocity(Math.cos(headingRad) * FRACTURE.swarmSpeed, Math.sin(headingRad) * FRACTURE.swarmSpeed);
    this.draw(nowMs);
  }

  get position(): Vector2 {
    return { x: this.visual.x, y: this.visual.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  /** Which of the two wireframe prisms this pickup rolled at spawn - exposed so a network snapshot mirror (docs/roadmap.md's "Windows + LAN multiplayer," Sprint 13) draws the correct silhouette instead of guessing; the tumble's per-instance phase/speed stay un-synced, same "re-roll it locally" tradeoff the asteroid mirror already makes. */
  get kind(): SwarmBitKind {
    return this.kind_;
  }

  /** Not collectible in the first instant it appears - a beat to actually see it before it can be scooped, same spirit as every other Fracture tier's materialize grace period. */
  isMaterializing(nowMs: number): boolean {
    return nowMs - this.spawnedAtMs < FRACTURE.materializeDurationMs;
  }

  /** Same exact eased curve as `Fracture.materializeProgress` - see that getter's own doc comment. */
  materializeProgress(nowMs: number): number {
    const t = Math.min(1, (nowMs - this.spawnedAtMs) / FRACTURE.materializeDurationMs);
    return 1 - (1 - t) ** 3;
  }

  // Pure position/wrap simulation now - rotation is derived from nowMs
  // directly in render() (see draw()'s spin calculation) rather than
  // accumulated here, and that's also where nowMs/deltaSeconds actually
  // got used before the simulate/render split (docs/roadmap.md's
  // "Windows + LAN multiplayer," Sprint 3).
  update(arenaWidth: number, arenaHeight: number): void {
    if (!this.alive) return;

    const wrapped = wrapPosition(this.position, FRACTURE.swarmRadius, arenaWidth, arenaHeight);
    if (wrapped.x !== this.position.x || wrapped.y !== this.position.y) {
      this.visual.setPosition(wrapped.x, wrapped.y);
    }
  }

  /** Split from update() (docs/roadmap.md's "Windows + LAN multiplayer," Sprint 3) - a host-only simulation never touches Graphics. */
  render(nowMs: number): void {
    this.draw(nowMs);
  }

  private draw(nowMs: number): void {
    const g = this.visual;
    g.clear();

    const materializeT = Math.min(1, (nowMs - this.spawnedAtMs) / FRACTURE.materializeDurationMs);
    const eased = 1 - (1 - materializeT) ** 3;
    // "Make them pulse slightly," decided - a slow scale-breathing cycle
    // (~1.4s) layered on top of the existing materialize fade/scale-in,
    // same "reads as alive and worth grabbing" cue Shield pickups
    // already get from their own ring, just via scale/glow instead.
    const pulse = 0.5 + Math.sin(nowMs / 700) * 0.5;
    g.setAlpha(eased);
    g.setScale((0.3 + 0.7 * eased) * (1 + pulse * 0.08));

    // "Floating, not flying," decided - a small vertical bob independent
    // of the actual drift/wrap movement above, drawn (not physically
    // applied), same "cosmetic offset only" approach Fracture's own
    // shards already use for their bob.
    const bobY = Math.sin(nowMs / 900 + this.bobPhase) * 1.5;

    // True 3D tumble rather than the flat 2D spin the tetromino look
    // used - a slow yaw (this.spinSpeed) plus a gentle oscillation on
    // top of the fixed camera tilt, so it reads as a solid tumbling in
    // space rather than a shape spinning in place on a turntable.
    const elapsedSec = (nowMs - this.spawnedAtMs) / 1000;
    const spin = elapsedSec * this.spinSpeed + this.spinPhase;
    const tilt = BASE_TILT + Math.sin(nowMs / 1300 + this.bobPhase) * 0.12;

    // Graphics has no true blur - same "layered flat fill" stand-in
    // Fracture's own core glow and BlackHole already use: a soft,
    // low-alpha circle behind the wireframe, standing in for a glow a
    // hollow shape otherwise couldn't cast.
    const glowRadius = this.depthRange * (0.85 + pulse * 0.3);
    g.fillStyle(COLORS.scrap, 0.16 + pulse * 0.1);
    g.fillCircle(0, bobY, glowRadius);

    const projected = prismVertices(this.halfExtents).map((v) => project3D(v, spin, tilt));

    PRISM_EDGES.forEach(([ia, ib]) => {
      const a = projected[ia]!;
      const b = projected[ib]!;
      // Edges facing the camera (positive z after projection) read
      // brighter than ones facing away - the only concession to depth
      // this wireframe makes, since true hidden-line removal would
      // fight the "it's hollow" point of drawing it unfilled at all.
      const depthT = Math.max(0, Math.min(1, ((a.z + b.z) / 2 + this.depthRange) / (this.depthRange * 2)));
      const alpha = 0.5 + depthT * 0.5;
      const ax = a.x;
      const ay = a.y + bobY;
      const bx = b.x;
      const by = b.y + bobY;

      g.lineStyle(1.4, 0x3c4560, alpha); // structural edge tone - matches Cardinal.ts's own local METAL_LIGHT
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.strokePath();

      g.lineStyle(1.4, COLORS.scrap, Math.min(1, (0.45 + pulse * 0.55) * alpha));
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.strokePath();
    });
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.visual.destroy();
  }
}
