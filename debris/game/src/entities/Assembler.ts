import Phaser from 'phaser';
import { ASSEMBLER, COLORS } from '../config/GameConfig';
import {
  absorbAsteroid,
  applyAssemblerHit,
  assemblerProgress,
  initialAssemblerState,
  isAssemblerActive,
  starveAssembler,
  type AssemblerPhase,
  type AssemblerState,
} from '../systems/AssemblerBuild';
import { CATEGORY } from '../systems/CollisionCategories';
import { wrapPosition } from '../systems/MovementSystem';
import { fromAngle, type Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from './MatterGameObject';

interface Plate {
  /** Where on the ring this welded-on rock sits. */
  readonly angle: number;
  readonly distance: number;
  readonly radius: number;
  readonly spin: number;
}

/**
 * The Assembler (docs/roadmap.md) - Debris's third boss, and the only
 * one that builds itself out of the arena instead of arriving finished.
 * It seeds mid-stage, drags nearby asteroids in, and welds each one on
 * as a visible plate; once it has enough it comes alive and hunts.
 *
 * Descended from *Sinistar* (1983), the same arcade generation as
 * Asteroids itself: the assembly is visible and interruptible, which is
 * the whole mechanic. Starve it by clearing the field, or knock plates
 * back off by shooting it - see `systems/AssemblerBuild.ts`, which owns
 * all of those rules and is tested on its own.
 *
 * Matter-backed (unlike The Cardinal, like The Fracture): it's a single
 * round body that moves, which fits Matter's model fine. Its mask
 * carries SHIP so contact behaves like every other boss, and ASTEROID
 * so it can actually eat the field.
 *
 * **It talks.** Sinistar taunted, and that's most of why anyone
 * remembers it, so this does too - through `systems/VoiceSynth.ts`,
 * which synthesizes the game's voice from formants rather than playing
 * back recordings. Its four barks (seeding, completing, starved,
 * killed) are in that module's `VOICE_LINES`, and are original rather
 * than Sinistar's own.
 */
export class Assembler {
  readonly visual: MatterGameObject<Phaser.GameObjects.Graphics>;
  private state: AssemblerState = initialAssemblerState();
  private readonly plates: Plate[] = [];
  private readonly spawnedAtMs: number;
  private lastShardAtMs: number;
  private alive = true;

  constructor(scene: Phaser.Scene, position: Vector2, nowMs: number) {
    this.spawnedAtMs = nowMs;
    this.lastShardAtMs = nowMs;

    const visual = scene.add.graphics();
    scene.matter.add.gameObject(visual, {
      shape: { type: 'circle', radius: ASSEMBLER.radius },
      isSensor: true, // it pulls and eats rather than bouncing things off itself
      frictionAir: 0,
      collisionFilter: {
        category: CATEGORY.FRACTURE, // reuses the boss category - nothing distinguishes them by category anywhere
        mask: CATEGORY.SHIP | CATEGORY.ASTEROID | CATEGORY.PROJECTILE,
      },
    });
    this.visual = visual as MatterGameObject<Phaser.GameObjects.Graphics>;
    this.visual.setPosition(position.x, position.y);
    this.visual.setData('entity', this);
    this.visual.setFixedRotation();
    this.draw(nowMs);
  }

  get position(): Vector2 {
    return { x: this.visual.x, y: this.visual.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get phase(): AssemblerPhase {
    return this.state.phase;
  }

  get isActive(): boolean {
    return isAssemblerActive(this.state);
  }

  get plateCount(): number {
    return this.state.plates;
  }

  get hp(): number {
    return this.state.hp;
  }

  get progress(): number {
    return assemblerProgress(this.state, ASSEMBLER);
  }

  /** Still materializing - not yet eating or shootable, same grace beat every other boss gets. */
  isMaterializing(nowMs: number): boolean {
    return nowMs - this.spawnedAtMs < ASSEMBLER.materializeDurationMs;
  }

  /** Eats one asteroid, welding it on as a visible plate. Returns true if that was the plate that completed it. */
  absorb(rng: () => number = Math.random): boolean {
    const before = this.state.phase;
    this.state = absorbAsteroid(this.state, ASSEMBLER);
    if (this.state.plates > this.plates.length) {
      this.plates.push({
        angle: rng() * Math.PI * 2,
        distance: ASSEMBLER.radius * (0.55 + rng() * 0.5),
        radius: ASSEMBLER.plateRadius * (0.7 + rng() * 0.6),
        spin: (rng() - 0.5) * 0.6,
      });
    }
    return before === 'assembling' && this.state.phase === 'complete';
  }

  /** A player's shot: knocks a plate off while it's still building, real damage once it's alive. Returns true if this killed it. */
  takeHit(nowMs: number, damage = 1): boolean {
    if (this.isMaterializing(nowMs)) return false;
    this.state = applyAssemblerHit(this.state, damage);
    if (this.state.plates < this.plates.length) this.plates.length = this.state.plates;
    return this.state.phase === 'collapsed';
  }

  /** The field ran dry - an unfinished Assembler has nothing left to build with. Returns true if this collapsed it. */
  starve(): boolean {
    const before = this.state.phase;
    this.state = starveAssembler(this.state);
    return before !== 'collapsed' && this.state.phase === 'collapsed';
  }

  /** Once alive it closes on whoever it's hunting - slowly, so it's a pressure rather than a chase it always wins. */
  update(nowMs: number, target: Vector2 | undefined, arenaWidth: number, arenaHeight: number): void {
    if (!this.alive) return;

    if (this.isActive && target) {
      const dx = target.x - this.position.x;
      const dy = target.y - this.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 1) {
        this.visual.setVelocity((dx / distance) * ASSEMBLER.huntSpeed, (dy / distance) * ASSEMBLER.huntSpeed);
      }
      const wrapped = wrapPosition(this.position, ASSEMBLER.radius, arenaWidth, arenaHeight);
      if (wrapped.x !== this.position.x || wrapped.y !== this.position.y) {
        this.visual.setPosition(wrapped.x, wrapped.y);
      }
    } else {
      this.visual.setVelocity(0, 0); // stationary while it's still building
    }

    this.draw(nowMs);
  }

  canFireShard(nowMs: number): boolean {
    return this.isActive && nowMs - this.lastShardAtMs >= ASSEMBLER.shardCooldownMs;
  }

  recordShardFired(nowMs: number): void {
    this.lastShardAtMs = nowMs;
  }

  private draw(nowMs: number): void {
    const g = this.visual;
    g.clear();

    const materializeT = Math.min(1, (nowMs - this.spawnedAtMs) / ASSEMBLER.materializeDurationMs);
    const eased = 1 - (1 - materializeT) ** 3;
    g.setAlpha(eased);
    g.setScale(0.4 + 0.6 * eased);

    const active = this.isActive;
    const shell = active ? COLORS.ufo : COLORS.cardinal;

    // The pull field, drawn only while it's still feeding - showing the
    // radius it's stealing rocks from is the fair-telegraph rule every
    // other hazard in this game follows.
    if (!active) {
      const pulse = 0.5 + Math.sin(nowMs / 420) * 0.5;
      g.lineStyle(1, COLORS.cardinal, 0.10 + pulse * 0.10);
      g.strokeCircle(0, 0, ASSEMBLER.pullRadius);
    }

    // Welded-on plates, each an absorbed rock.
    this.plates.forEach((plate, i) => {
      const angle = plate.angle + nowMs / 4000 + i * 0.01;
      const wobble = Math.sin(nowMs / 700 + i) * 1.5;
      const px = Math.cos(angle) * (plate.distance + wobble);
      const py = Math.sin(angle) * (plate.distance + wobble);
      g.fillStyle(COLORS.asteroidFill, 1);
      g.lineStyle(1.5, COLORS.asteroid, 0.9);
      g.fillCircle(px, py, plate.radius);
      g.strokeCircle(px, py, plate.radius);
      // the weld holding it on
      g.lineStyle(1, shell, 0.5);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(px, py);
      g.strokePath();
    });

    // Nucleus - an angular core that reads as machinery, brightening as
    // it fills up and going red once it's alive.
    const corePulse = active ? 0.6 + Math.sin(nowMs / 180) * 0.4 : 0.35 + this.progress * 0.5;
    g.fillStyle(COLORS.cardinalFill, 1);
    g.lineStyle(2.5, shell, 0.5 + corePulse * 0.5);
    g.beginPath();
    const sides = 6;
    for (let i = 0; i < sides; i += 1) {
      const a = (i / sides) * Math.PI * 2 + nowMs / 6000;
      const point = fromAngle(a);
      const r = ASSEMBLER.coreRadius;
      if (i === 0) g.moveTo(point.x * r, point.y * r);
      else g.lineTo(point.x * r, point.y * r);
    }
    g.closePath();
    g.fillPath();
    g.strokePath();

    g.fillStyle(shell, corePulse);
    g.fillCircle(0, 0, ASSEMBLER.coreRadius * 0.42);
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.visual.destroy();
  }
}
