import Phaser from 'phaser';
import { POWERUP_SPRITE } from '../config/GameConfig';
import type { UpgradeType } from '../systems/UpgradeSystem';
import type { Vector2 } from '../utilities/Vector2';
import { ensurePowerupAnimations, powerupAnimKey, POWERUP_TEXTURE_KEY } from './PowerupAnimations';

export class Pickup {
  readonly type: UpgradeType;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private alive = true;

  constructor(scene: Phaser.Scene, position: Vector2, type: UpgradeType) {
    this.type = type;
    ensurePowerupAnimations(scene);
    this.sprite = scene.add.sprite(position.x, position.y, POWERUP_TEXTURE_KEY, `${type}-0`);
    this.sprite.setScale(POWERUP_SPRITE.scale);
    this.sprite.play(powerupAnimKey(type));
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
