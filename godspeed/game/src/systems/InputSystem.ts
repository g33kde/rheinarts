import Phaser from 'phaser';
import type { Vector2 } from '../utilities/Vector2';

/**
 * Reads keyboard state each frame. WASD and arrow keys move the player;
 * the last non-zero move direction is retained as the facing/aim direction
 * so Space fires without requiring a mouse (matches the arcade, no-mouse-
 * dependency feel described in docs/gameplay.md).
 */
export class InputSystem {
  private readonly keys: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    fire: Phaser.Input.Keyboard.Key;
  };

  private facing: Vector2 = { x: 0, y: -1 };

  constructor(scene: Phaser.Scene) {
    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      throw new Error('Keyboard input plugin is not available on this scene.');
    }

    const arrows = keyboard.createCursorKeys();
    const wasd = keyboard.addKeys('W,A,S,D') as Record<string, Phaser.Input.Keyboard.Key>;

    this.keys = {
      up: arrows.up,
      down: arrows.down,
      left: arrows.left,
      right: arrows.right,
      fire: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    };

    this.wasd = wasd;
  }

  private readonly wasd: Record<string, Phaser.Input.Keyboard.Key>;

  get moveDirection(): Vector2 {
    const direction: Vector2 = { x: 0, y: 0 };

    if (this.keys.left.isDown || this.wasd.A?.isDown) direction.x -= 1;
    if (this.keys.right.isDown || this.wasd.D?.isDown) direction.x += 1;
    if (this.keys.up.isDown || this.wasd.W?.isDown) direction.y -= 1;
    if (this.keys.down.isDown || this.wasd.S?.isDown) direction.y += 1;

    if (direction.x !== 0 || direction.y !== 0) {
      this.facing = direction;
    }

    return direction;
  }

  get aimDirection(): Vector2 {
    return this.facing;
  }

  get isFiring(): boolean {
    return this.keys.fire.isDown;
  }
}
