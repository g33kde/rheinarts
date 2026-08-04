import Phaser from 'phaser';
import { COLORS, PICKUP } from '../config/GameConfig';
import type { UpgradeType } from '../systems/UpgradeSystem';
import type { Vector2 } from '../utilities/Vector2';

const PICKUP_COLOR: Record<UpgradeType, number> = {
  speed: COLORS.pickupSpeed,
  rapidFire: COLORS.pickupRapidFire,
  extraLife: COLORS.pickupExtraLife,
  shield: COLORS.pickupShield,
};

export class Pickup {
  readonly type: UpgradeType;
  private readonly sprite: Phaser.GameObjects.Arc;
  private alive = true;

  constructor(scene: Phaser.Scene, position: Vector2, type: UpgradeType) {
    this.type = type;
    this.sprite = scene.add.circle(position.x, position.y, PICKUP.radius, PICKUP_COLOR[type]);
  }

  get position(): Vector2 {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  get isAlive(): boolean {
    return this.alive;
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.sprite.destroy();
  }
}
