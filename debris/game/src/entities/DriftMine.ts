import Phaser from 'phaser';
import { COLORS, DRIFT_MINE } from '../config/GameConfig';
import { CATEGORY } from '../systems/CollisionCategories';
import { wrapPosition } from '../systems/MovementSystem';
import type { Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from './MatterGameObject';

/**
 * A Saboteur's dropped ordnance (`SABOTEUR`/`DRIFT_MINE` config,
 * `entities/Saboteur.ts`) - a passive, physics-driven hazard rather than
 * an attack. Sensor body, same "detects contact without physically
 * pushing anything around" treatment Shield/FractureSwarmBit already
 * use - detonation destroys it outright, so a physical bounce first
 * would just look wrong.
 *
 * Inert for `armDelayMs` after dropping (`isArmed`) - "a placed object,"
 * not instantly live. `GameScene` is the one that actually resolves a
 * detonation's blast (`DriftMineBlast.ts`'s `isWithinBlast`, scoring,
 * chaining) - this class owns only its own drift/visual/arming state,
 * same division of labour the Gravity Well's hazard entity/GameScene
 * split already uses.
 *
 * **Two Graphics objects, not one** - a perf fix, not a style choice.
 * The blast-radius ring is ~950px of circumference chopped into 4px
 * dashes (~100 segments); drawing that through the same object as the
 * spinning/pulsing body meant redrawing all ~100 dash segments from
 * scratch every frame for a ring that never actually changes shape once
 * a mine is armed - a handful of mines on screen was enough to tank
 * frame time on nothing but static geometry. The ring now lives on its
 * own Graphics object, drawn once on the inert->armed transition (and
 * as a single path, not ~100 separate ones) and just repositioned every
 * frame after that; only the body (prongs + core, genuinely animated)
 * still redraws per frame.
 */
export class DriftMine {
  readonly visual: MatterGameObject<Phaser.GameObjects.Graphics>;
  private readonly ringGraphics: Phaser.GameObjects.Graphics;
  /** `undefined` until the ring's been drawn at least once - tracks the armed state it was last drawn for, so a redraw only happens on the one real transition (inert -> armed), never per frame. */
  private ringDrawnForArmedState: boolean | undefined;
  private alive = true;
  private readonly droppedAtMs: number;
  private readonly spinPhase: number;

  constructor(scene: Phaser.Scene, position: Vector2, velocity: Vector2, nowMs: number, rng: () => number = Math.random) {
    this.droppedAtMs = nowMs;
    this.spinPhase = rng() * Math.PI * 2;

    const visual = scene.add.graphics();
    scene.matter.add.gameObject(visual, {
      shape: { type: 'circle', radius: DRIFT_MINE.radius },
      isSensor: true,
      frictionAir: 0,
      friction: 0,
      frictionStatic: 0,
      collisionFilter: {
        category: CATEGORY.MINE,
        mask:
          CATEGORY.SHIP |
          CATEGORY.ASTEROID |
          CATEGORY.PROJECTILE |
          CATEGORY.UFO |
          CATEGORY.SABOTEUR |
          CATEGORY.MINE |
          CATEGORY.COMMANDER,
      },
    });
    this.visual = visual as MatterGameObject<Phaser.GameObjects.Graphics>;
    this.visual.setPosition(position.x, position.y);
    this.visual.setData('entity', this);
    this.visual.setVelocity(velocity.x, velocity.y);

    // Not Matter-attached - purely a repositioned-each-frame visual, same
    // "cosmetic offset only" spirit this game's other draw-only layers
    // already use. Starts hidden; drawRing() reveals it once armed.
    this.ringGraphics = scene.add.graphics();
    this.ringGraphics.setPosition(position.x, position.y);

    this.draw(nowMs);
  }

  get position(): Vector2 {
    return { x: this.visual.x, y: this.visual.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  /** Inert for `DRIFT_MINE.armDelayMs` after being dropped - contact triggers nothing until this flips true. */
  isArmed(nowMs: number): boolean {
    return nowMs - this.droppedAtMs >= DRIFT_MINE.armDelayMs;
  }

  update(arenaWidth: number, arenaHeight: number): void {
    if (!this.alive) return;

    const wrapped = wrapPosition(this.position, DRIFT_MINE.radius, arenaWidth, arenaHeight);
    if (wrapped.x !== this.position.x || wrapped.y !== this.position.y) {
      this.visual.setPosition(wrapped.x, wrapped.y);
    }
  }

  /** Split from update() (docs/roadmap.md's "Windows + LAN multiplayer," Sprint 3) - a host-only simulation never touches Graphics. */
  render(nowMs: number): void {
    this.ringGraphics.setPosition(this.visual.x, this.visual.y);
    this.draw(nowMs);
  }

  /** The always-visible blast-radius telegraph (fair-telegraph rule every hazard in Debris follows) - drawn once as a single dashed-circle path, not ~100 separate ones, and only redrawn on the one real transition (inert -> armed), never per frame. */
  private drawRing(armed: boolean): void {
    if (this.ringDrawnForArmedState === armed) return;
    this.ringDrawnForArmedState = armed;

    const g = this.ringGraphics;
    g.clear();
    if (!armed) return;

    g.lineStyle(1.2, COLORS.ufo, 0.5);
    const dashLength = 4;
    const gapLength = 5;
    const circumference = 2 * Math.PI * DRIFT_MINE.blastRadius;
    const segments = Math.max(8, Math.floor(circumference / (dashLength + gapLength)));
    g.beginPath();
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = a0 + (dashLength / circumference) * Math.PI * 2;
      g.moveTo(Math.cos(a0) * DRIFT_MINE.blastRadius, Math.sin(a0) * DRIFT_MINE.blastRadius);
      g.arc(0, 0, DRIFT_MINE.blastRadius, a0, a1, false);
    }
    g.strokePath();
  }

  private draw(nowMs: number): void {
    const armed = this.isArmed(nowMs);
    this.drawRing(armed);

    const g = this.visual;
    g.clear();

    const spin = nowMs / 2600 + this.spinPhase;
    const pulse = 0.5 + Math.sin(nowMs / 500) * 0.5;

    g.save();
    g.rotateCanvas(spin);
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const inner = DRIFT_MINE.radius * 0.5;
      const outer = DRIFT_MINE.radius * 1.3;
      g.lineStyle(1.6, 0x3c4560, 1);
      g.beginPath();
      g.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
      g.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
      g.strokePath();
      g.fillStyle(0x3c4560, 1);
      g.fillCircle(Math.cos(a) * outer, Math.sin(a) * outer, 1.3);
    }

    g.fillStyle(0x14141c, 1);
    g.fillCircle(0, 0, DRIFT_MINE.radius * 0.65);
    g.lineStyle(1.4, 0x3c4560, 1);
    g.strokeCircle(0, 0, DRIFT_MINE.radius * 0.65);

    g.fillStyle(COLORS.ufo, armed ? 0.55 + pulse * 0.45 : 0.3);
    g.fillCircle(0, 0, DRIFT_MINE.radius * 0.3 * (0.8 + pulse * 0.35));
    g.restore();
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.visual.destroy();
    this.ringGraphics.destroy();
  }
}
