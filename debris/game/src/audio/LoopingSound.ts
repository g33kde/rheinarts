import Phaser from 'phaser';

/**
 * Phaser's sound manager is game-global (shared across scenes), not
 * per-scene - these helpers lean on that so switching scenes (Menu ->
 * Game, and back) never restarts or duplicates a track that's already
 * playing. Originally ported from Godspeed's `MusicController.ts`
 * (music-only there); genericized here since the ship's thrust loop
 * needs identical play-once/stop-and-reset behavior, just re-triggered
 * on key-press/release instead of on scene-enter/exit.
 */

/**
 * `Phaser.Sound.BaseSound` (what `scene.sound.get()` returns) has no
 * `volume`/`setVolume` in its own type - those only exist on its
 * concrete `WebAudioSound`/`HTML5AudioSound` subclasses, which is what
 * every sound actually is at runtime regardless of which backend Phaser
 * picked (both share this exact method shape). One cast here instead of
 * one at every call site.
 */
export function setVolume(scene: Phaser.Scene, key: string | undefined, volume: number): void {
  if (!key) return;
  const sound = scene.sound.get(key) as Phaser.Sound.WebAudioSound | undefined;
  sound?.setVolume(volume);
}

/** `volume` is applied every call (even to an already-playing sound), so a menu slider change lands immediately. */
export function playLoopingSound(scene: Phaser.Scene, key: string, volume: number): void {
  const sound = (scene.sound.get(key) ?? scene.sound.add(key, { loop: true })) as Phaser.Sound.WebAudioSound;
  sound.setVolume(volume);
  if (!sound.isPlaying) sound.play();
}

/** `stop()`, not `pause()` - the next `playLoopingSound` call starts over from the beginning, never resumes. */
export function stopSound(scene: Phaser.Scene, key: string | undefined): void {
  if (!key) return;
  scene.sound.get(key)?.stop();
}

/** Unlike `stopSound`, `resumeSound` picks back up from here - for an actual pause, not a reset. Ported from Godspeed's `MusicController.ts`. */
export function pauseSound(scene: Phaser.Scene, key: string | undefined): void {
  if (!key) return;
  const sound = scene.sound.get(key);
  if (sound?.isPlaying) sound.pause();
}

export function resumeSound(scene: Phaser.Scene, key: string | undefined): void {
  if (!key) return;
  const sound = scene.sound.get(key);
  if (sound?.isPaused) sound.resume();
}
