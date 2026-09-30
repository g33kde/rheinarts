import Phaser from 'phaser';
import { COLORS, COMMANDER } from '../config/GameConfig';
import { CATEGORY } from '../systems/CollisionCategories';
import { computeTowPosition } from '../systems/CommanderRescue';
import { clampSpeed, wrapPosition } from '../systems/MovementSystem';
import { toCssHex } from '../utilities/Color';
import type { Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from './MatterGameObject';
import type { Ship } from './Ship';

export type CommanderState = 'adrift' | 'carried';

/**
 * "Astronaut," decided in docs/art_direction.md - the ejected pilot from
 * an unshielded Cooperative hit (docs/gameplay.md's "Emergency Ejection
 * & Rescue"). A sensor body like `Shield`, but listens for hazards too
 * (asteroid/UFO/UFO shot - decided: adrift is a real risk, not just a
 * countdown), not only a Ship touch.
 *
 * Two states:
 * - **adrift**: drifts on its own velocity like everything else, wraps at
 *   arena edges, shows a countdown to `COMMANDER.rescueWindowMs` under
 *   itself, vulnerable to hazards - `GameScene` destroys it (eliminating
 *   that player for the round) if the countdown runs out first.
 * - **carried**: towed behind a rescuing ship (`computeTowPosition`), no
 *   countdown shown (decided: pickup alone saves the life - the trip to
 *   the station is flavor, not still racing the clock), and not
 *   independently hazard-vulnerable (`GameScene` gates hazard hits on
 *   `isAdrift`).
 *
 * `hasBeenRescuedOnce` stays true even if the towing ship is later
 * destroyed and drops this Commander mid-transit - a real edge case, not
 * explicitly specified, resolved as a judgment call (see CHANGELOG): a
 * dropped Commander goes back to **adrift** so anyone can pick it up
 * again, but doesn't get a fresh countdown or become eligible for
 * expiry-elimination again - that life was already saved at the
 * original pickup.
 */
export class Commander {
  readonly visual: MatterGameObject<Phaser.GameObjects.Graphics>;
  readonly slotIndex: number;
  readonly color: number;
  readonly ejectedAtMs: number;
  private readonly timerText: Phaser.GameObjects.Text;
  private state: CommanderState = 'adrift';
  private towedBy: Ship | null = null;
  private hasBeenRescued = false;
  private alive = true;
  // EVA thruster state (COMMANDER.puff*) - the downed player's own
  // limited agency while adrift. `facingRad` is logical only: the body
  // itself is deliberately never rotated (see setFixedRotation below and
  // the tumbling-person art direction), so the direction is shown by a
  // chevron and the thruster flame instead.
  private facingRad: number;
  private puffFuelSeconds = COMMANDER.puffFuelSeconds;
  private isPuffing = false;

  constructor(
    scene: Phaser.Scene,
    origin: Vector2,
    slotIndex: number,
    color: number,
    headingRad: number,
    nowMs: number,
  ) {
    this.slotIndex = slotIndex;
    this.color = color;
    this.ejectedAtMs = nowMs;
    // Start aimed along the ejection heading - whichever way you were
    // flung is where a puff would take you, so the first press does
    // something predictable rather than something arbitrary.
    this.facingRad = headingRad;

    const visual = scene.add.graphics();
    scene.matter.add.gameObject(visual, {
      shape: { type: 'circle', radius: COMMANDER.radius },
      isSensor: true,
      frictionAir: 0,
      collisionFilter: {
        category: CATEGORY.COMMANDER,
        mask: CATEGORY.SHIP | CATEGORY.ASTEROID | CATEGORY.UFO | CATEGORY.UFO_SHOT,
      },
    });
    this.visual = visual as MatterGameObject<Phaser.GameObjects.Graphics>;
    this.visual.setPosition(origin.x, origin.y);
    this.visual.setData('entity', this);
    // No physics rotation - a collision nudge shouldn't send a tumbling
    // person spinning like a Matter body would otherwise; the draw()
    // bob/limb-sway below is cosmetic only, same spirit as Ship's own
    // setFixedRotation() reasoning.
    this.visual.setFixedRotation();
    this.visual.setVelocity(Math.cos(headingRad) * COMMANDER.driftSpeed, Math.sin(headingRad) * COMMANDER.driftSpeed);

    this.timerText = scene.add
      .text(origin.x, origin.y + COMMANDER.visualScale * 1.7, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        fontStyle: 'bold',
        color: toCssHex(color),
      })
      .setOrigin(0.5, 0);

    this.draw(nowMs);
  }

  get position(): Vector2 {
    return { x: this.visual.x, y: this.visual.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  get isAdrift(): boolean {
    return this.state === 'adrift';
  }

  get hasBeenRescuedOnce(): boolean {
    return this.hasBeenRescued;
  }

  /** GameScene calls this once, on pickup - stops independent drift, attaches to the rescuer. */
  pickUp(ship: Ship): void {
    this.state = 'carried';
    this.hasBeenRescued = true;
    this.towedBy = ship;
    this.visual.setVelocity(0, 0);
    this.timerText.setVisible(false);
  }

  get remainingPuffFuelRatio(): number {
    return COMMANDER.puffFuelSeconds <= 0 ? 0 : this.puffFuelSeconds / COMMANDER.puffFuelSeconds;
  }

  /**
   * The downed player's own input, applied to their adrift pilot
   * (COMMANDER.puff*) - GameScene routes the matching slot's turn/thrust
   * here each frame. Reuses the player's existing turn/thrust bindings
   * rather than adding new ones: the muscle memory transfers straight
   * from flying, which matters when you've got seconds to react.
   *
   * No-ops entirely once carried (your rescuer is flying now) or once
   * the fuel budget is spent.
   */
  applyControl(turnDirection: -1 | 0 | 1, thrusting: boolean, deltaSeconds: number): void {
    this.isPuffing = false;
    if (!this.alive || this.state !== 'adrift') return;

    if (turnDirection !== 0) {
      this.facingRad += turnDirection * COMMANDER.puffTurnRateRadPerSec * deltaSeconds;
    }

    if (!thrusting || this.puffFuelSeconds <= 0) return;

    // Spend only what's actually left this frame, so the budget can't be
    // overdrawn by a long frame.
    const spent = Math.min(this.puffFuelSeconds, deltaSeconds);
    this.puffFuelSeconds -= spent;
    this.isPuffing = true;

    const velocity = this.visual.getVelocity();
    const boosted = {
      x: velocity.x + Math.cos(this.facingRad) * COMMANDER.puffAccelPerSec * spent,
      y: velocity.y + Math.sin(this.facingRad) * COMMANDER.puffAccelPerSec * spent,
    };
    const clamped = clampSpeed(boosted, COMMANDER.puffMaxSpeed);
    this.visual.setVelocity(clamped.x, clamped.y);
  }

  /** A carrier that dies mid-transit drops this Commander back into open space - see the class doc's note on this edge case. */
  drop(headingRad: number): void {
    this.state = 'adrift';
    this.towedBy = null;
    this.visual.setVelocity(Math.cos(headingRad) * COMMANDER.driftSpeed, Math.sin(headingRad) * COMMANDER.driftSpeed);
  }

  update(nowMs: number, arenaWidth: number, arenaHeight: number): void {
    if (!this.alive) return;

    if (this.state === 'carried' && this.towedBy) {
      const towed = computeTowPosition(this.towedBy.position, this.towedBy.heading, COMMANDER.towOffsetPx);
      this.visual.setPosition(towed.x, towed.y);
    } else {
      const wrapped = wrapPosition(this.position, COMMANDER.radius, arenaWidth, arenaHeight);
      if (wrapped.x !== this.position.x || wrapped.y !== this.position.y) {
        this.visual.setPosition(wrapped.x, wrapped.y);
      }

      if (!this.hasBeenRescued) {
        const remainingMs = Math.max(0, COMMANDER.rescueWindowMs - (nowMs - this.ejectedAtMs));
        this.timerText.setText(`${Math.ceil(remainingMs / 1000)}`);
      }
    }

    this.timerText.setPosition(this.position.x, this.position.y + COMMANDER.visualScale * 1.7);
    this.draw(nowMs);
  }

  private draw(nowMs: number): void {
    const g = this.visual;
    const scale = COMMANDER.visualScale;
    g.clear();

    const bob = Math.sin(nowMs / 500) * scale * 0.04;
    g.save();
    g.translateCanvas(0, bob);

    // Limbs first, underneath the body/helmet - each on its own sway
    // phase (no shared divisor) so they drift loosely out of sync, the
    // way a tumbling person actually would, not a synchronized machine.
    this.drawLimb(g, -scale * 0.4, scale * 0.22, Math.PI * 0.85, Math.sin(nowMs / 900) * 0.35, scale * 0.85);
    this.drawLimb(g, scale * 0.4, scale * 0.22, Math.PI * 0.15, Math.sin(nowMs / 760 + 1.4) * 0.35, scale * 0.85);
    this.drawLimb(g, -scale * 0.24, scale * 0.95, Math.PI * 0.6, Math.sin(nowMs / 1100 + 2.6) * 0.3, scale * 0.9);
    this.drawLimb(g, scale * 0.24, scale * 0.95, Math.PI * 0.4, Math.sin(nowMs / 980 + 0.7) * 0.3, scale * 0.9);

    // body (tapered trapezoid)
    g.fillStyle(0x0d0d16, 1);
    g.lineStyle(2, this.color, 1);
    g.beginPath();
    g.moveTo(-scale * 0.4, scale * 0.2);
    g.lineTo(scale * 0.4, scale * 0.2);
    g.lineTo(scale * 0.26, scale * 0.95);
    g.lineTo(-scale * 0.26, scale * 0.95);
    g.closePath();
    g.fillPath();
    g.strokePath();

    // helmet
    g.fillStyle(0x0d0d16, 1);
    g.lineStyle(2, this.color, 1);
    g.fillCircle(0, -scale * 0.28, scale * 0.42);
    g.strokeCircle(0, -scale * 0.28, scale * 0.42);

    // visor glint
    g.fillStyle(this.color, 0.5);
    g.fillCircle(-scale * 0.08, -scale * 0.34, scale * 0.14);

    g.restore();

    // EVA thruster tells, drawn outside the bob transform so they read as
    // equipment rather than part of the tumble. Only while adrift and
    // only while there's fuel left to matter - once it's spent, they
    // disappear entirely, which *is* the "you're out" signal.
    if (this.state === 'adrift' && this.puffFuelSeconds > 0) {
      this.drawThrusterTells(g, scale);
    }
  }

  /** Aim chevron (where a puff would send you) plus the flame itself while thrusting, and a small fuel bar - the body is never rotated, so these are the only directional cue. */
  private drawThrusterTells(g: Phaser.GameObjects.Graphics, scale: number): void {
    const aimDistance = scale * 1.25;
    const aimX = Math.cos(this.facingRad) * aimDistance;
    const aimY = Math.sin(this.facingRad) * aimDistance;

    // chevron pointing the way the next puff would push
    const wingAngle = 0.6;
    const wing = scale * 0.32;
    g.lineStyle(2, this.color, 0.75);
    g.beginPath();
    g.moveTo(aimX - Math.cos(this.facingRad - wingAngle) * wing, aimY - Math.sin(this.facingRad - wingAngle) * wing);
    g.lineTo(aimX, aimY);
    g.lineTo(aimX - Math.cos(this.facingRad + wingAngle) * wing, aimY - Math.sin(this.facingRad + wingAngle) * wing);
    g.strokePath();

    if (this.isPuffing) {
      // flame out the back, opposite the aim - same "thrust shows behind
      // you" language the Ship's own flame already uses.
      const backX = -Math.cos(this.facingRad) * scale * 0.7;
      const backY = -Math.sin(this.facingRad) * scale * 0.7;
      const flame = scale * (0.45 + Math.random() * 0.2); // flicker, same trick Ship.draw uses
      g.fillStyle(COLORS.flame, 0.85);
      g.beginPath();
      g.moveTo(backX - Math.cos(this.facingRad + 1.4) * scale * 0.18, backY - Math.sin(this.facingRad + 1.4) * scale * 0.18);
      g.lineTo(backX - Math.cos(this.facingRad) * flame, backY - Math.sin(this.facingRad) * flame);
      g.lineTo(backX - Math.cos(this.facingRad - 1.4) * scale * 0.18, backY - Math.sin(this.facingRad - 1.4) * scale * 0.18);
      g.closePath();
      g.fillPath();
    }

    // Fuel bar sits *below* the rescue countdown text, not above it - the
    // countdown is at visualScale * 1.7 and the thruster flame swings
    // through everything within ~1x scale of the body, so this is the one
    // band around the astronaut nothing else competes for.
    const barWidth = scale * 0.9;
    const barY = scale * 2.6;
    g.lineStyle(1, this.color, 0.35);
    g.strokeRect(-barWidth / 2, barY, barWidth, 3);
    g.fillStyle(this.color, 0.8);
    g.fillRect(-barWidth / 2, barY, barWidth * this.remainingPuffFuelRatio, 3);
  }

  private drawLimb(
    g: Phaser.GameObjects.Graphics,
    shoulderX: number,
    shoulderY: number,
    baseAngle: number,
    sway: number,
    length: number,
  ): void {
    const angle = baseAngle + sway;
    const elbowX = shoulderX + Math.cos(angle) * length * 0.55;
    const elbowY = shoulderY + Math.sin(angle) * length * 0.55;
    const tipAngle = angle + sway * 0.6; // forearm/shin bends a bit further than the sway alone
    const tipX = elbowX + Math.cos(tipAngle) * length * 0.5;
    const tipY = elbowY + Math.sin(tipAngle) * length * 0.5;

    g.lineStyle(2.2, this.color, 1);
    g.beginPath();
    g.moveTo(shoulderX, shoulderY);
    g.lineTo(elbowX, elbowY);
    g.lineTo(tipX, tipY);
    g.strokePath();
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.visual.destroy();
    this.timerText.destroy();
  }
}
