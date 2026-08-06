import Phaser from 'phaser';
import { BOSS_FRAMES, type BossAnimationName } from '../config/BossFrames';

export const BOSS_TEXTURE_KEY = 'bossSheet';

export function bossFrameKey(name: BossAnimationName, index: number): string {
  return `${name}-${index}`;
}

export function bossAnimKey(name: BossAnimationName): string {
  return `boss-${name}`;
}

const ANIM_SETTINGS: Record<BossAnimationName, { frameRate: number; repeat: number }> = {
  idle: { frameRate: 5, repeat: -1 },
  walk: { frameRate: 8, repeat: -1 },
  attack: { frameRate: 6, repeat: 0 },
  die: { frameRate: 5, repeat: 0 },
};

const ANIMATION_NAMES = Object.keys(BOSS_FRAMES) as BossAnimationName[];

/**
 * Registers named sub-frames on the already-preloaded boss sheet texture
 * (see BootScene) and builds the four Phaser animations from them. Same
 * pattern as WardenAnimations.ts/PowerupAnimations.ts - registered once
 * per game session (Phaser's Animation Manager lives on the Game
 * instance, not the Scene), safe to call from every Boss construction.
 */
export function ensureBossAnimations(scene: Phaser.Scene): void {
  if (scene.anims.exists(bossAnimKey('idle'))) return;

  const texture = scene.textures.get(BOSS_TEXTURE_KEY);

  for (const name of ANIMATION_NAMES) {
    const frames = BOSS_FRAMES[name];
    frames.forEach((rect, index) => {
      texture.add(bossFrameKey(name, index), 0, rect.x, rect.y, rect.width, rect.height);
    });

    scene.anims.create({
      key: bossAnimKey(name),
      frames: frames.map((_rect, index) => ({
        key: BOSS_TEXTURE_KEY,
        frame: bossFrameKey(name, index),
      })),
      frameRate: ANIM_SETTINGS[name].frameRate,
      repeat: ANIM_SETTINGS[name].repeat,
    });
  }
}
