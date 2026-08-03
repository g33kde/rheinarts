import Phaser from 'phaser';
import { WARDEN_FRAMES, type WardenAnimationName } from '../config/WardenFrames';

export const WARDEN_TEXTURE_KEY = 'wardenSheet';

export function wardenAnimKey(name: WardenAnimationName): string {
  return `warden-${name}`;
}

const ANIM_SETTINGS: Record<WardenAnimationName, { frameRate: number; repeat: number }> = {
  idle: { frameRate: 6, repeat: -1 },
  walk: { frameRate: 10, repeat: -1 },
  shoot: { frameRate: 18, repeat: 0 },
  hurt: { frameRate: 12, repeat: 0 },
  die: { frameRate: 8, repeat: 0 },
};

const ANIMATION_NAMES = Object.keys(WARDEN_FRAMES) as WardenAnimationName[];

/**
 * Registers named sub-frames on the already-preloaded warden sheet texture
 * (see BootScene) and builds the five Phaser animations from them. Phaser's
 * Animation Manager lives on the Game instance, not the Scene, so it
 * survives `scene.restart()` - this only needs to do real work once per
 * game session; `scene.anims.exists(...)` makes it safe to call every time
 * a Player is constructed.
 */
export function ensureWardenAnimations(scene: Phaser.Scene): void {
  if (scene.anims.exists(wardenAnimKey('idle'))) return;

  const texture = scene.textures.get(WARDEN_TEXTURE_KEY);

  for (const name of ANIMATION_NAMES) {
    const frames = WARDEN_FRAMES[name];
    frames.forEach((rect, index) => {
      texture.add(`${name}-${index}`, 0, rect.x, rect.y, rect.width, rect.height);
    });

    scene.anims.create({
      key: wardenAnimKey(name),
      frames: frames.map((_rect, index) => ({
        key: WARDEN_TEXTURE_KEY,
        frame: `${name}-${index}`,
      })),
      frameRate: ANIM_SETTINGS[name].frameRate,
      repeat: ANIM_SETTINGS[name].repeat,
    });
  }
}
