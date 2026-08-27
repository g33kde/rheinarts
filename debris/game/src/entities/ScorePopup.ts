import Phaser from 'phaser';
import { SCORE_POPUP } from '../config/GameConfig';
import { toCssHex } from '../utilities/Color';
import type { Vector2 } from '../utilities/Vector2';

/**
 * The floating "+<score>" number that appears where a shot lands
 * (docs/gameplay.md), in the scoring player's own color - decided on
 * request, sized against a live-rendered small-rock reference (see
 * `GameConfig.ts`'s `SCORE_POPUP` doc comment). A single `Text` object,
 * not the `Graphics`-particle pattern `DestructionBurst` uses - that
 * pattern is specifically about avoiding Phaser's `ParticleEmitter`
 * subsystem for *many* decorative dots, not a rule against `Text`, which
 * the HUD already uses everywhere for exactly this kind of thing.
 *
 * Same hand-managed `update()`/`isAlive`/`destroy()` shape as every other
 * transient effect in this game, driven by GameScene's own frame loop
 * rather than a Phaser tween - rise/drift/rotate/fade are all plain
 * eased math against elapsed time, not tween state to juggle.
 */
export class ScorePopup {
  private readonly text: Phaser.GameObjects.Text;
  private readonly startX: number;
  private readonly startY: number;
  private readonly driftX: number;
  private readonly rotationSign: number;
  private readonly spawnedAtMs: number;
  private alive = true;

  constructor(scene: Phaser.Scene, position: Vector2, color: number, amount: number, nowMs: number) {
    this.spawnedAtMs = nowMs;
    this.startX = position.x;
    this.startY = position.y;
    this.driftX =
      (Math.random() < 0.5 ? -1 : 1) *
      (SCORE_POPUP.driftRange[0] + Math.random() * (SCORE_POPUP.driftRange[1] - SCORE_POPUP.driftRange[0]));
    this.rotationSign = Math.random() < 0.5 ? -1 : 1;

    this.text = scene.add.text(position.x, position.y, `+${amount}`, {
      fontFamily: 'monospace',
      fontSize: `${SCORE_POPUP.fontSizePx}px`,
      fontStyle: 'bold',
      color: toCssHex(color),
      stroke: '#05050a', // COLORS.background - dark outline for legibility over any backdrop
      strokeThickness: SCORE_POPUP.strokeWidthPx,
    });
    this.text.setOrigin(0.5, 0.5);
    this.text.setShadow(0, 0, toCssHex(color), SCORE_POPUP.glowBlurPx, false, true);
  }

  get isAlive(): boolean {
    return this.alive;
  }

  update(nowMs: number): void {
    if (!this.alive) return;

    const age = nowMs - this.spawnedAtMs;
    if (age >= SCORE_POPUP.lifespanMs) {
      this.destroy();
      return;
    }

    const t = age / SCORE_POPUP.lifespanMs;
    const eased = 1 - (1 - t) ** 3; // ease-out cubic

    this.text.x = this.startX + this.driftX * t;
    this.text.y = this.startY - eased * SCORE_POPUP.riseDistancePx;
    this.text.rotation = this.rotationSign * SCORE_POPUP.rotationRad * Math.sin(t * Math.PI);
    this.text.alpha = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.text.destroy();
  }
}
