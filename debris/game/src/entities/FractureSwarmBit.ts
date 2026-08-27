import Phaser from 'phaser';
import { COLORS, FRACTURE } from '../config/GameConfig';
import { CATEGORY } from '../systems/CollisionCategories';
import { wrapPosition } from '../systems/MovementSystem';
import type { Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from './MatterGameObject';

// The 7 standard tetromino layouts, as [col, row] cell coordinates -
// "make them look like Tetris pieces," decided, replacing the jagged
// asteroid-shaped shell every earlier pass used. Deliberately file-local
// data, not GameConfig - purely a rendering detail, same treatment
// Fracture.ts's own SHARD_COUNT/SHARD_BASE_DIST already get.
const TETROMINOES: readonly (readonly [number, number])[][] = [
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
  ], // I
  [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ], // O
  [
    [0, 0],
    [1, 0],
    [2, 0],
    [1, 1],
  ], // T
  [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ], // S
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
  ], // Z
  [
    [0, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ], // J
  [
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ], // L
];

// "Smaller than or the same size as the little rocks," decided - the
// overall footprint every tetromino piece is scaled to fit, regardless
// of its own natural bounding box (a 4-wide I-piece and a 2x2 O-piece
// both end up reading as "the same size class"). Comfortably under
// FRACTURE.swarmRadius's own 14px hitbox diameter, leaving a small
// margin so the visual never pokes past the (invisible) collision circle.
const TARGET_SPAN_PX = 12;

interface Cell {
  readonly x: number;
  readonly y: number;
  readonly size: number;
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
 * Redesigned "floating parts," decided after a live mockup comparison -
 * a blocky tetromino-shaped fragment (dark metal plating, a pulsing
 * muted-jade glow, `COLORS.scrap`) instead of the jagged asteroid-shaped
 * shard every earlier pass used, so it reads as loose mechanical debris
 * rather than a small rock.
 */
export class FractureSwarmBit {
  readonly visual: MatterGameObject<Phaser.GameObjects.Graphics>;
  private readonly cells: Cell[];
  private readonly spinSpeed: number;
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
    this.cells = buildTetrominoCells(TETROMINOES[Math.floor(rng() * TETROMINOES.length)]!);
    this.spinSpeed = (rng() - 0.5) * 0.8;
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

  /** Not collectible in the first instant it appears - a beat to actually see it before it can be scooped, same spirit as every other Fracture tier's materialize grace period. */
  isMaterializing(nowMs: number): boolean {
    return nowMs - this.spawnedAtMs < FRACTURE.materializeDurationMs;
  }

  update(nowMs: number, deltaSeconds: number, arenaWidth: number, arenaHeight: number): void {
    if (!this.alive) return;

    this.visual.setRotation(this.visual.rotation + this.spinSpeed * deltaSeconds);

    const wrapped = wrapPosition(this.position, FRACTURE.swarmRadius, arenaWidth, arenaHeight);
    if (wrapped.x !== this.position.x || wrapped.y !== this.position.y) {
      this.visual.setPosition(wrapped.x, wrapped.y);
    }

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

    this.cells.forEach((cell) => {
      const x = cell.x;
      const y = cell.y + bobY;
      const glowPad = 1.5 + pulse * 1.5;

      // Graphics has no true blur - same "layered flat fills" stand-in
      // Fracture's own core glow and BlackHole already use: a soft,
      // low-alpha, slightly larger rect behind the solid cell.
      g.fillStyle(COLORS.scrap, 0.18 + pulse * 0.12);
      g.fillRect(x - glowPad, y - glowPad, cell.size + glowPad * 2, cell.size + glowPad * 2);

      g.fillStyle(COLORS.cardinalFill, 1);
      g.fillRect(x, y, cell.size, cell.size);

      g.lineStyle(1, 0x3c4560, 1); // structural edge tone - matches Cardinal.ts's own local METAL_LIGHT
      g.strokeRect(x, y, cell.size, cell.size);

      g.lineStyle(1, COLORS.scrap, 0.45 + pulse * 0.55);
      g.strokeRect(x, y, cell.size, cell.size);
    });
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.visual.destroy();
  }
}

/** Scales a tetromino's own natural bounding box (which varies - a 4-wide I vs. a 2x2 O) to a consistent TARGET_SPAN_PX footprint, and centers it on the entity's own local origin. */
function buildTetrominoCells(shape: readonly (readonly [number, number])[]): Cell[] {
  const cols = shape.map(([c]) => c);
  const rows = shape.map(([, r]) => r);
  const width = Math.max(...cols) + 1;
  const height = Math.max(...rows) + 1;
  const cellSize = TARGET_SPAN_PX / Math.max(width, height);
  const inset = Math.max(0.5, cellSize * 0.08);

  return shape.map(([col, row]) => ({
    x: (col - width / 2) * cellSize + inset,
    y: (row - height / 2) * cellSize + inset,
    size: cellSize - inset * 2,
  }));
}
