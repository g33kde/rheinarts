import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH, PLAYER, WARDEN_SPRITE } from '../config/GameConfig';
import { resolveCircleRectCollisions } from '../systems/CollisionSystem';
import { clampToBounds, computeNextPosition } from '../systems/MovementSystem';
import type { Rect } from '../utilities/Rect';
import type { Vector2 } from '../utilities/Vector2';
import { ensureWardenAnimations, wardenAnimKey, WARDEN_TEXTURE_KEY } from './WardenAnimations';

type TransientAnim = 'shoot' | 'hurt' | 'die';

const TRANSIENT_ANIM_KEYS: readonly string[] = [
  wardenAnimKey('shoot'),
  wardenAnimKey('hurt'),
  wardenAnimKey('die'),
];

export class Player {
  readonly sprite: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    ensureWardenAnimations(scene);
    this.sprite = scene.add.sprite(x, y, WARDEN_TEXTURE_KEY, 'idle-0');
    this.sprite.setScale(WARDEN_SPRITE.scale);
    this.sprite.play(wardenAnimKey('idle'));
  }

  get position(): Vector2 {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  move(
    direction: Vector2,
    deltaSeconds: number,
    walls: readonly Rect[],
    speedMultiplier = 1,
  ): void {
    const speed = PLAYER.speed * speedMultiplier;
    const next = computeNextPosition(this.position, direction, speed, deltaSeconds);
    const withinArena = clampToBounds(next, PLAYER.radius, ARENA_WIDTH, ARENA_HEIGHT);
    const resolved = resolveCircleRectCollisions(withinArena, PLAYER.radius, walls);
    this.sprite.setPosition(resolved.x, resolved.y);
    this.updateLocomotionAnim(direction);
  }

  teleportTo(position: Vector2): void {
    this.sprite.setPosition(position.x, position.y);
  }

  playShoot(): void {
    this.playTransient('shoot');
  }

  playHurt(): void {
    this.playTransient('hurt');
  }

  playDie(): void {
    this.playTransient('die');
  }

  private playTransient(name: TransientAnim): void {
    this.sprite.play(wardenAnimKey(name));
  }

  private updateLocomotionAnim(direction: Vector2): void {
    const currentKey = this.sprite.anims.currentAnim?.key;
    const isTransientInProgress =
      !!currentKey && TRANSIENT_ANIM_KEYS.includes(currentKey) && this.sprite.anims.isPlaying;
    if (isTransientInProgress) return;

    if (direction.x !== 0) {
      this.sprite.setFlipX(direction.x > 0);
    }

    const moving = direction.x !== 0 || direction.y !== 0;
    const desired = wardenAnimKey(moving ? 'walk' : 'idle');
    if (currentKey !== desired) {
      this.sprite.play(desired);
    }
  }
}
