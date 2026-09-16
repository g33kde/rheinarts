import Phaser from 'phaser';
import { CARDINAL, COLORS } from '../config/GameConfig';
import { applyHit, determinePhase, type CardinalPhase } from '../systems/CardinalCombat';
import { fromAngle, type Vector2 } from '../utilities/Vector2';

export type { CardinalPhase } from '../systems/CardinalCombat';

// Cosmetic-only (don't affect hit-testing, so kept out of GameConfig -
// same "file-local constant, not shared config" treatment Fracture.ts's
// own SHARD_COUNT/SHARD_BASE_DIST already get).
const ARM_TRUSS_WIDTH = 34;
const CANNON_LEN = 60;
const CANNON_WIDTH = 56;
const METAL_MID = 0x232a3c;
const METAL_LIGHT = 0x3c4560;
const CORE_SIDES = 8; // octagonal core, decided

type AttackSubPhase = 'idle' | 'charging' | 'firing' | 'fading';

const ATTACK_CYCLE_MS = CARDINAL.laserCooldownMs + CARDINAL.laserTelegraphMs + CARDINAL.laserActiveMs + CARDINAL.laserFadeMs;

/**
 * Debris's second boss (docs/roadmap.md's "The Cardinal") - a permanent
 * four-armed fixture at exact arena-center. Unlike `Fracture` (a real
 * Matter body that "behaves like rocks"), this entity is **not
 * Matter-backed at all**: a single rigid body with four independently-
 * destructible, continuously-rotating hit zones doesn't fit Matter's
 * category/mask model any more cleanly than a laser beam does - see
 * `CARDINAL`'s own doc comment in `GameConfig.ts` for the full reasoning.
 * GameScene hit-tests ships/projectiles against this entity's current
 * geometry every frame via plain distance/segment math (same "plain math
 * hazard" pattern `BlackHole`'s gravity/lethal checks and
 * `FractureLaser`'s beam already established), reading `rotation`/
 * `armAngleRad()`/`isArmAlive()` to know where everything currently is.
 *
 * Owns its own single `Graphics` visual (rotated as one whole rigid body
 * via `setRotation`, so every arm is drawn once in local space at a
 * fixed 0/90/180/270 offset and the transform does the actual spinning -
 * much simpler than Fracture's per-shard rotation, since this structure
 * is one rigid piece, not independently-bobbing shards) and its own
 * internal attack-cycle clock: unlike Fracture's laser (GameScene picks
 * a random angle and spawns a `FractureLaser`), The Cardinal's laser
 * direction is never random - it's always "wherever the arms currently
 * point" - so the whole charge/fire/fade cycle lives entirely inside
 * this class; GameScene only ever *asks* (`isLaserActiveForArm`), never
 * *triggers*, for the laser half of its attacks. The Phase 2 plasma ball
 * is the one attack GameScene does trigger (`canFirePlasma`/
 * `recordPlasmaFired`), since aiming it needs GameScene's own knowledge
 * of where the players are.
 */
export class Cardinal {
  readonly visual: Phaser.GameObjects.Graphics;
  private readonly countdownText: Phaser.GameObjects.Text;
  private readonly fixedPosition: Vector2;
  private readonly spawnedAtMs: number;
  private readonly armHp: number[];
  private coreHp: number;
  private previousPhase: CardinalPhase = 'armed';
  private lastPlasmaFiredAtMs: number | undefined;
  private criticalStartedAtMs: number | undefined;
  private alive = true;
  private rotation = 0;

  constructor(scene: Phaser.Scene, position: Vector2, nowMs: number) {
    this.fixedPosition = position;
    this.spawnedAtMs = nowMs;
    this.armHp = new Array<number>(CARDINAL.armCount).fill(CARDINAL.armHp);
    this.coreHp = CARDINAL.coreHp;

    this.visual = scene.add.graphics();
    this.visual.setPosition(position.x, position.y);

    // Only ever shown during the critical phase (point 8's detonation
    // countdown) - a plain, unrotated Text sitting on top of the
    // rotating Graphics, same "separate object, not part of the spun
    // silhouette" reasoning the scrap countdown text already uses.
    this.countdownText = scene.add
      .text(position.x, position.y, '', {
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: '56px',
        color: '#0a0b13',
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.draw(nowMs);
  }

  get position(): Vector2 {
    return this.fixedPosition;
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get phase(): CardinalPhase {
    return determinePhase(this.armIsAliveFlags(), this.coreHp <= 0);
  }

  /** Current absolute rotation, radians - the same convention `fromAngle`/`Ship.heading` already use (0 = +x, positive = clockwise on screen). */
  get rotationRad(): number {
    return this.rotation;
  }

  isMaterializing(nowMs: number): boolean {
    return nowMs - this.spawnedAtMs < CARDINAL.materializeDurationMs;
  }

  isArmAlive(armIndex: number): boolean {
    return (this.armHp[armIndex] ?? 0) > 0;
  }

  /** This arm's current absolute firing/hit-test direction - the body's own rotation plus its fixed 0/90/180/270 local offset. */
  armAngleRad(armIndex: number): number {
    return this.rotation + armIndex * (Math.PI / 2);
  }

  /** World position of this arm's cannon tip - where its destruction scrap should spawn. */
  armWorldPosition(armIndex: number): Vector2 {
    const direction = fromAngle(this.armAngleRad(armIndex));
    return {
      x: this.fixedPosition.x + direction.x * CARDINAL.armReach,
      y: this.fixedPosition.y + direction.y * CARDINAL.armReach,
    };
  }

  /** No-op (returns `destroyed: false`) while materializing, once every arm is already down, or once past Phase 1 entirely - same "the caller still gets a definite answer either way" shape as Fracture's own `takeHit`. `damage` defaults to 1 (a normal shot) - Heavy Shot passes more, see FractureCombat.applyHit's own doc comment (CardinalCombat.applyHit mirrors it). */
  takeArmHit(armIndex: number, nowMs: number, damage = 1): boolean {
    if (this.isMaterializing(nowMs) || this.phase !== 'armed' || !this.isArmAlive(armIndex)) return false;
    const result = applyHit(this.armHp[armIndex] ?? 0, damage);
    this.armHp[armIndex] = result.hp;
    return result.destroyed;
  }

  /** Only valid once every arm is gone (Phase 2) - a no-op otherwise, same shape as `takeArmHit`. */
  takeCoreHit(nowMs: number, damage = 1): boolean {
    if (this.isMaterializing(nowMs) || this.phase !== 'coreExposed') return false;
    const result = applyHit(this.coreHp, damage);
    this.coreHp = result.hp;
    return result.destroyed;
  }

  /** Sum of all four arms' remaining HP over the max - "one consolidated bar," decided. */
  armHpFraction(): number {
    const max = CARDINAL.armHp * CARDINAL.armCount;
    const remaining = this.armHp.reduce((total, hp) => total + hp, 0);
    return max === 0 ? 0 : remaining / max;
  }

  coreHpFraction(): number {
    return Math.max(0, this.coreHp) / CARDINAL.coreHp;
  }

  /** True only during the firing sub-phase of the shared attack cycle, and only for an arm that's still actually alive - GameScene hit-tests ships against `armAngleRad(armIndex)` whenever this is true. */
  isLaserActiveForArm(armIndex: number, nowMs: number): boolean {
    return this.phase === 'armed' && this.isArmAlive(armIndex) && this.attackSubPhase(nowMs) === 'firing';
  }

  /** Phase 2 only - "every 2 seconds," decided. First shot is a full cooldown after Phase 2 begins, not instant - same fairness precedent as Fracture's "first laser is cooldown after arrival." */
  canFirePlasma(nowMs: number): boolean {
    if (this.phase !== 'coreExposed' || this.lastPlasmaFiredAtMs === undefined) return false;
    return nowMs - this.lastPlasmaFiredAtMs >= CARDINAL.plasmaCooldownMs;
  }

  recordPlasmaFired(nowMs: number): void {
    this.lastPlasmaFiredAtMs = nowMs;
  }

  /** 0..1 across the Phase 3 countdown - drives both the growing danger ring and the countdown number. Meaningless (returns 0) outside `critical`. */
  detonationProgress(nowMs: number): number {
    if (this.criticalStartedAtMs === undefined) return 0;
    return Math.min(1, (nowMs - this.criticalStartedAtMs) / CARDINAL.detonationCountdownMs);
  }

  isDetonationReady(nowMs: number): boolean {
    return this.criticalStartedAtMs !== undefined && nowMs - this.criticalStartedAtMs >= CARDINAL.detonationCountdownMs;
  }

  update(nowMs: number): void {
    if (!this.alive) return;

    const currentPhase = this.phase;
    if (currentPhase !== this.previousPhase) {
      // "First shot is a cooldown after Phase 2 begins," decided - anchor
      // the plasma cooldown to the exact transition moment, not spawn time.
      if (currentPhase === 'coreExposed') this.lastPlasmaFiredAtMs = nowMs;
      if (currentPhase === 'critical') this.criticalStartedAtMs = nowMs;
      this.previousPhase = currentPhase;
    }

    this.draw(nowMs);
  }

  private armIsAliveFlags(): boolean[] {
    return this.armHp.map((hp) => hp > 0);
  }

  private cycleElapsedMs(nowMs: number): number {
    return (nowMs - this.spawnedAtMs) % ATTACK_CYCLE_MS;
  }

  private attackSubPhase(nowMs: number): AttackSubPhase {
    const elapsed = this.cycleElapsedMs(nowMs);
    if (elapsed < CARDINAL.laserCooldownMs) return 'idle';
    if (elapsed < CARDINAL.laserCooldownMs + CARDINAL.laserTelegraphMs) return 'charging';
    if (elapsed < CARDINAL.laserCooldownMs + CARDINAL.laserTelegraphMs + CARDINAL.laserActiveMs) return 'firing';
    return 'fading';
  }

  private draw(nowMs: number): void {
    const g = this.visual;
    g.clear();

    const materializeT = Math.min(1, (nowMs - this.spawnedAtMs) / CARDINAL.materializeDurationMs);
    const eased = 1 - (1 - materializeT) ** 3; // ease-out cubic, same curve every Fracture tier's materialize already uses
    g.setAlpha(eased);
    g.setScale(0.3 + 0.7 * eased);

    this.rotation = ((nowMs - this.spawnedAtMs) / CARDINAL.rotationPeriodMs) * Math.PI * 2;
    g.setRotation(this.rotation);

    const phase = this.phase;
    let glowColor: number = COLORS.cardinal;
    let glowStrength = 0.2 + Math.sin(nowMs / 500) * 0.05;
    let targetAlpha = 0;
    let beamAlpha = 0;

    if (phase === 'armed') {
      const elapsed = this.cycleElapsedMs(nowMs);
      const subPhase = this.attackSubPhase(nowMs);
      if (subPhase === 'charging') {
        const t = (elapsed - CARDINAL.laserCooldownMs) / CARDINAL.laserTelegraphMs;
        glowColor = COLORS.fractureLauncher;
        glowStrength = 0.3 + t * 0.7;
        targetAlpha = (Math.max(0, t - 0.3) / 0.7) * 0.6;
      } else if (subPhase === 'firing') {
        glowColor = COLORS.ufo;
        glowStrength = 1;
        beamAlpha = 1;
      } else if (subPhase === 'fading') {
        const t =
          (elapsed - CARDINAL.laserCooldownMs - CARDINAL.laserTelegraphMs - CARDINAL.laserActiveMs) /
          CARDINAL.laserFadeMs;
        glowColor = COLORS.ufo;
        glowStrength = 1 - t;
        beamAlpha = 1 - t;
      }
    } else if (phase === 'critical') {
      const pulse = 0.5 + Math.sin(nowMs / 180) * 0.5;
      glowColor = COLORS.ufo;
      glowStrength = 0.6 + pulse * 0.4;
    }

    for (let i = 0; i < CARDINAL.armCount; i += 1) {
      g.save();
      g.rotateCanvas(i * (Math.PI / 2));
      if (this.isArmAlive(i)) {
        this.drawArm(g, glowColor, glowStrength, targetAlpha, beamAlpha);
      } else {
        this.drawArmWreck(g);
      }
      g.restore();
    }

    this.drawCore(g, glowColor, glowStrength);

    if (phase === 'critical') {
      const p = this.detonationProgress(nowMs);
      const r = p * CARDINAL.detonationMaxRadius;
      g.fillStyle(COLORS.ufo, 0.05 + p * 0.05);
      g.fillCircle(0, 0, r);
      g.lineStyle(3 + p * 2, COLORS.ufo, 0.45 + p * 0.4);
      g.strokeCircle(0, 0, r);

      const secondsLeft = Math.max(1, Math.ceil((CARDINAL.detonationCountdownMs - p * CARDINAL.detonationCountdownMs) / 1000));
      this.countdownText.setText(String(secondsLeft)).setVisible(true);
    } else {
      this.countdownText.setVisible(false);
    }
  }

  private drawArm(g: Phaser.GameObjects.Graphics, glowColor: number, glowStrength: number, targetAlpha: number, beamAlpha: number): void {
    const innerX = CARDINAL.armInnerRadius;
    const trussLen = CARDINAL.armReach - CANNON_LEN - innerX;

    g.fillStyle(COLORS.cardinalFill, 1);
    g.lineStyle(3, METAL_LIGHT, 1);
    g.fillRect(innerX, -ARM_TRUSS_WIDTH / 2, trussLen, ARM_TRUSS_WIDTH);
    g.strokeRect(innerX, -ARM_TRUSS_WIDTH / 2, trussLen, ARM_TRUSS_WIDTH);

    g.lineStyle(4, glowColor, 0.5 + glowStrength * 0.5);
    g.beginPath();
    g.moveTo(innerX + 6, 0);
    g.lineTo(innerX + trussLen - 4, 0);
    g.strokePath();

    g.lineStyle(2, METAL_LIGHT, 1);
    g.strokeCircle(innerX + trussLen * 0.55, 0, ARM_TRUSS_WIDTH * 0.42);

    const cannonX = CARDINAL.armReach - CANNON_LEN;
    g.fillStyle(COLORS.cardinalFill, 1);
    g.lineStyle(3, METAL_LIGHT, 1);
    g.fillRect(cannonX, -CANNON_WIDTH / 2, CANNON_LEN, CANNON_WIDTH);
    g.strokeRect(cannonX, -CANNON_WIDTH / 2, CANNON_LEN, CANNON_WIDTH);

    g.fillStyle(glowColor, 0.35 + glowStrength * 0.65);
    g.fillCircle(CARDINAL.armReach - 10, 0, CANNON_WIDTH * 0.28);

    if (targetAlpha > 0) {
      g.lineStyle(1.5, COLORS.ufo, targetAlpha);
      g.beginPath();
      g.moveTo(innerX + 40, 0);
      g.lineTo(CARDINAL.armReach, 0);
      g.strokePath();
    }

    if (beamAlpha > 0) {
      g.fillStyle(COLORS.ufo, beamAlpha);
      g.fillRect(CARDINAL.armReach, -CARDINAL.laserWidth / 2, CARDINAL.laserLength - CARDINAL.armReach, CARDINAL.laserWidth);
      g.fillStyle(0xffffff, beamAlpha * 0.85);
      g.fillRect(
        CARDINAL.armReach,
        -Math.max(2, CARDINAL.laserWidth * 0.35) / 2,
        CARDINAL.laserLength - CARDINAL.armReach,
        Math.max(2, CARDINAL.laserWidth * 0.35),
      );
    }
  }

  /** A destroyed arm - "explodes into scrap and goes dark... stays physically attached as inert wreckage," decided. Purely decorative; GameScene spawns the actual scrap pickup once, at the moment the arm dies, not on every redraw. */
  private drawArmWreck(g: Phaser.GameObjects.Graphics): void {
    const stubLen = 44;
    const innerX = CARDINAL.armInnerRadius;

    g.fillStyle(COLORS.cardinalFill, 1);
    g.lineStyle(3, METAL_MID, 1);
    g.fillRect(innerX, -ARM_TRUSS_WIDTH / 2, stubLen, ARM_TRUSS_WIDTH);
    g.strokeRect(innerX, -ARM_TRUSS_WIDTH / 2, stubLen, ARM_TRUSS_WIDTH);

    const bx = innerX + stubLen;
    g.lineStyle(2, METAL_LIGHT, 1);
    g.beginPath();
    g.moveTo(bx, -ARM_TRUSS_WIDTH / 2);
    g.lineTo(bx + 14, -ARM_TRUSS_WIDTH / 4);
    g.lineTo(bx + 4, 0);
    g.lineTo(bx + 18, ARM_TRUSS_WIDTH / 4);
    g.lineTo(bx, ARM_TRUSS_WIDTH / 2);
    g.strokePath();

    g.fillStyle(COLORS.fractureLauncher, 0.35);
    g.fillCircle(bx - 10, 0, 3);
  }

  private drawCore(g: Phaser.GameObjects.Graphics, glowColor: number, glowStrength: number): void {
    const radius = CARDINAL.coreRadius;

    g.fillStyle(COLORS.cardinalFill, 1);
    g.lineStyle(3, METAL_LIGHT, 1);
    g.beginPath();
    for (let i = 0; i < CORE_SIDES; i += 1) {
      const a = (i / CORE_SIDES) * Math.PI * 2 + Math.PI / CORE_SIDES;
      const px = Math.cos(a) * radius;
      const py = Math.sin(a) * radius;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();
    g.strokePath();

    const innerR = radius * 0.55;
    g.fillStyle(glowColor, 0.55 + glowStrength * 0.45);
    g.beginPath();
    for (let i = 0; i < CORE_SIDES; i += 1) {
      const a = (i / CORE_SIDES) * Math.PI * 2 + Math.PI / CORE_SIDES;
      const px = Math.cos(a) * innerR;
      const py = Math.sin(a) * innerR;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    g.fillPath();
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.visual.destroy();
    this.countdownText.destroy();
  }
}
