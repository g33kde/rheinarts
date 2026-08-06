import Phaser from 'phaser';

/**
 * Phaser's sound manager is game-global (shared across scenes), not
 * per-scene - these helpers lean on that so switching scenes (Splash ->
 * Menu, Menu -> Game, floor -> floor) never restarts or duplicates a track
 * that's already playing.
 */

export function playLoopingMusic(scene: Phaser.Scene, key: string): void {
  const sound = scene.sound.get(key) ?? scene.sound.add(key, { loop: true });
  if (!sound.isPlaying) sound.play();
}

export function stopMusic(scene: Phaser.Scene, key: string | undefined): void {
  if (!key) return;
  scene.sound.get(key)?.stop();
}

export function pauseMusic(scene: Phaser.Scene, key: string | undefined): void {
  if (!key) return;
  const sound = scene.sound.get(key);
  if (sound?.isPlaying) sound.pause();
}

export function resumeMusic(scene: Phaser.Scene, key: string | undefined): void {
  if (!key) return;
  const sound = scene.sound.get(key);
  if (sound?.isPaused) sound.resume();
}
