import Phaser from 'phaser';
import { COLORS, SPACE_STATION } from '../config/GameConfig';
import type { Vector2 } from '../utilities/Vector2';

const PULSE_PERIOD_MS = 1800;

/** `t` in [0,1] in, eased `t` in [0,1] out - same shape every other entity's own inline ease math (Fracture's materialize, etc.) uses, kept local rather than a shared utility since this is the only place in the codebase that needs ease-*in*-out specifically. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * "Cross Dock," decided in docs/art_direction.md - the Cooperative-only
 * rescue drop-off point (docs/gameplay.md's "Emergency Ejection &
 * Rescue"), normally fixed at arena center for the whole round. Not
 * Matter-backed at all (decided: trigger zone only, no physical
 * collision) - a plain `Graphics` object; `GameScene` checks a carrying
 * ship's distance against `dropOffRadius` itself
 * (`systems/CommanderRescue.ts`'s `isWithinDropOffRange`), not a
 * collision event, same reasoning Shield/Ship-style Matter sensors
 * weren't needed here.
 *
 * **Relocates during a boss fight, decided** - "the space station moves
 * before the boss fight to a random corner, then moves back after, make
 * the move visible" (GameScene's `beginBossAnnouncement()`/
 * `enterStageClear()`). `travelTo()` starts an eased glide rather than a
 * teleport; `position` reflects wherever it currently is mid-glide, so
 * every distance check that already reads it (drop-off range, a rescued
 * player's respawn point, Black Hole spawn clearance) stays correct
 * automatically without any of those call sites needing to know a move
 * is even happening.
 */
export class SpaceStation {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private currentPosition: Vector2;
  private travelFrom: Vector2 | undefined;
  private travelTarget: Vector2 | undefined;
  private travelStartedAtMs = 0;
  private travelDurationMs = 0;
  readonly dropOffRadius = SPACE_STATION.dropOffRadius;

  constructor(scene: Phaser.Scene, position: Vector2) {
    this.currentPosition = position;
    this.graphics = scene.add.graphics();
    this.graphics.setPosition(position.x, position.y);
    this.draw(0);
  }

  get position(): Vector2 {
    return this.currentPosition;
  }

  /** Begins an eased glide to `target` - "make the move visible," decided, so this is never an instant reposition. Calling this again mid-glide just retargets smoothly from the current in-flight position, not the original start. */
  travelTo(target: Vector2, nowMs: number, durationMs: number): void {
    this.travelFrom = this.currentPosition;
    this.travelTarget = target;
    this.travelStartedAtMs = nowMs;
    this.travelDurationMs = durationMs;
  }

  update(nowMs: number): void {
    if (this.travelTarget && this.travelFrom) {
      const t = this.travelDurationMs > 0 ? Math.min(1, (nowMs - this.travelStartedAtMs) / this.travelDurationMs) : 1;
      const eased = easeInOutCubic(t);
      this.currentPosition = {
        x: this.travelFrom.x + (this.travelTarget.x - this.travelFrom.x) * eased,
        y: this.travelFrom.y + (this.travelTarget.y - this.travelFrom.y) * eased,
      };
      this.graphics.setPosition(this.currentPosition.x, this.currentPosition.y);
      if (t >= 1) {
        this.travelFrom = undefined;
        this.travelTarget = undefined;
      }
    }
    this.draw(nowMs);
  }

  private draw(nowMs: number): void {
    const g = this.graphics;
    const armWidth = SPACE_STATION.armLength * 0.32;
    const armLength = SPACE_STATION.armLength;
    g.clear();

    // Four docking arms, each its own fill+stroke pass (same "one shape,
    // one begin/fill/stroke" pattern every other entity in this game
    // uses, rather than combining rotated rects into a single path).
    for (let i = 0; i < 4; i += 1) {
      g.save();
      g.rotateCanvas((Math.PI / 2) * i);
      g.fillStyle(0x0d0d16, 1);
      g.lineStyle(2.5, COLORS.shield, 1);
      g.beginPath();
      g.moveTo(-armWidth / 2, armWidth);
      g.lineTo(armWidth / 2, armWidth);
      g.lineTo(armWidth / 2, armLength);
      g.lineTo(-armWidth / 2, armLength);
      g.closePath();
      g.fillPath();
      g.strokePath();
      g.restore();
    }

    // Central hub.
    g.fillStyle(0x0d0d16, 1);
    g.lineStyle(2.5, COLORS.shield, 1);
    g.beginPath();
    g.moveTo(-armWidth, -armWidth);
    g.lineTo(armWidth, -armWidth);
    g.lineTo(armWidth, armWidth);
    g.lineTo(-armWidth, armWidth);
    g.closePath();
    g.fillPath();
    g.strokePath();

    // Pulsing center light - "this is a safe, active destination," same
    // pulse-as-signal language Shield's own center light already uses.
    const pulsePhase = (nowMs / PULSE_PERIOD_MS) * Math.PI * 2;
    const pulse = 0.6 + 0.4 * (Math.sin(pulsePhase) * 0.5 + 0.5);
    g.fillStyle(COLORS.shield, 0.6);
    g.fillCircle(0, 0, armWidth * 0.4 * pulse);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
