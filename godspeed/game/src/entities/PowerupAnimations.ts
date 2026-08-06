import Phaser from 'phaser';
import { POWERUP_FRAMES } from '../config/PowerupFrames';
import type { UpgradeType } from '../systems/UpgradeSystem';

export const POWERUP_TEXTURE_KEY = 'powerupSheet';

export function powerupAnimKey(type: UpgradeType): string {
  return `powerup-${type}`;
}

const UPGRADE_TYPES = Object.keys(POWERUP_FRAMES) as UpgradeType[];

/**
 * Registers named sub-frames on the already-preloaded powerup sheet
 * texture (see BootScene) and builds one looping animation per pickup
 * type. Same pattern as WardenAnimations.ts - registered once per game
 * session (Phaser's Animation Manager lives on the Game instance, not the
 * Scene), safe to call from every Pickup construction.
 */
export function ensurePowerupAnimations(scene: Phaser.Scene): void {
  if (scene.anims.exists(powerupAnimKey('speed'))) return;

  const texture = scene.textures.get(POWERUP_TEXTURE_KEY);

  for (const type of UPGRADE_TYPES) {
    const frames = POWERUP_FRAMES[type];
    frames.forEach((rect, index) => {
      texture.add(`${type}-${index}`, 0, rect.x, rect.y, rect.width, rect.height);
    });

    scene.anims.create({
      key: powerupAnimKey(type),
      frames: frames.map((_rect, index) => ({
        key: POWERUP_TEXTURE_KEY,
        frame: `${type}-${index}`,
      })),
      frameRate: 8,
      repeat: -1,
    });
  }
}
