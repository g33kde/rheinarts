import type { FrameRect } from './WardenFrames';

export type BossAnimationName = 'idle' | 'walk' | 'attack' | 'die';

/**
 * Pixel rects into src/assets/boss-sprite-sheet.png (1536x1024), one entry
 * per animation frame, in playback order.
 *
 * Measured, not eyeballed, same as WardenFrames.ts/PowerupFrames.ts: this
 * sheet has real alpha-channel transparency, so frames were found by
 * scanning the alpha channel for content bands/columns. `die` needed a
 * smaller gap-merge threshold than the pickup sheet used (8px, not 20) -
 * it has a genuine but narrow (~10-15px) transparent seam between poses
 * that a larger threshold was incorrectly bridging.
 *
 * `attack`'s second frame is reassigned, not from the attack row: the
 * attack row's own two poses ("charging" and "firing") are fused with
 * zero transparent pixels between them anywhere (confirmed by probing
 * every x column in that span - no gap, not even a few px), so rather
 * than keep that single fused-and-oversized frame, its slot now reuses
 * what was `walk`'s 4th frame (arm extended, projectile glow just
 * starting at the hand) - a cleaner, purpose-built windup pose, on
 * request. `walk` dropped to 3 frames accordingly; its remaining three
 * are a tighter pure locomotion loop without that reaching pose breaking
 * the cycle. Every row was cropped to a contact sheet and visually
 * spot-checked before committing these numbers.
 */
export const BOSS_FRAMES: Record<BossAnimationName, FrameRect[]> = {
  idle: [
    { x: 455, y: 49, width: 207, height: 198 },
    { x: 697, y: 49, width: 194, height: 198 },
    { x: 930, y: 49, width: 214, height: 198 },
    { x: 1170, y: 49, width: 225, height: 198 },
  ],
  walk: [
    { x: 449, y: 287, width: 207, height: 203 },
    { x: 687, y: 287, width: 206, height: 203 },
    { x: 924, y: 287, width: 234, height: 203 },
  ],
  attack: [
    { x: 431, y: 523, width: 216, height: 200 },
    { x: 1171, y: 287, width: 302, height: 203 }, // formerly walk's 4th frame
  ],
  die: [
    { x: 430, y: 766, width: 222, height: 152 },
    { x: 683, y: 766, width: 358, height: 152 },
    { x: 1059, y: 766, width: 283, height: 152 },
  ],
};
