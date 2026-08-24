import Phaser from 'phaser';
import { COMMANDER } from '../config/GameConfig';
import { CATEGORY } from '../systems/CollisionCategories';
import { computeTowPosition } from '../systems/CommanderRescue';
import { wrapPosition } from '../systems/MovementSystem';
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
