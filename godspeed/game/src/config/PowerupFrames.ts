import type { UpgradeType } from '../systems/UpgradeSystem';
import type { FrameRect } from './WardenFrames';

/**
 * Pixel rects into src/assets/powerups-sprite-sheet.png (1536x1024), one
 * entry per animation frame, in playback order. The sheet also had a
 * duplicate/corrupted second "Extra Life" row (its last frame morphs into
 * a Shield icon mid-generation) - discarded per direct instruction, not
 * used here.
 *
 * These were measured, not eyeballed: unlike the Warden sheet, this one
 * already has real alpha-channel transparency around each icon (no baked-
 * in background to key out), so frame boundaries were found by scanning
 * the alpha channel for content bands/columns, merging segments separated
 * by a small gap (faint motion-blur/glow trailing below the detection
 * threshold), and dropping anything still under ~30px wide (residual
 * noise blobs). Every row was then cropped and spot-checked against a
 * contact sheet before committing these numbers.
 *
 * `shield` only has 6 frames, not 7 like the other three - verified by
 * probing the alpha channel directly in the gap where a 7th frame would
 * be (zero content across a ~65px span), not a detection bug - the source
 * sheet genuinely only has 6 shield icons.
 */
export const POWERUP_FRAMES: Record<UpgradeType, FrameRect[]> = {
  speed: [
    { x: 352, y: 87, width: 97, height: 57 },
    { x: 478, y: 87, width: 114, height: 57 },
    { x: 613, y: 87, width: 139, height: 57 },
    { x: 781, y: 87, width: 133, height: 57 },
    { x: 939, y: 87, width: 134, height: 57 },
    { x: 1093, y: 87, width: 142, height: 57 },
    { x: 1264, y: 87, width: 224, height: 57 },
  ],
  rapidFire: [
    { x: 373, y: 235, width: 89, height: 74 },
    { x: 497, y: 235, width: 98, height: 74 },
    { x: 630, y: 235, width: 123, height: 74 },
    { x: 788, y: 235, width: 126, height: 74 },
    { x: 948, y: 235, width: 140, height: 74 },
    { x: 1116, y: 235, width: 133, height: 74 },
    { x: 1277, y: 235, width: 144, height: 74 },
  ],
  extraLife: [
    { x: 423, y: 386, width: 88, height: 87 },
    { x: 553, y: 386, width: 103, height: 87 },
    { x: 694, y: 386, width: 109, height: 87 },
    { x: 839, y: 386, width: 119, height: 87 },
    { x: 987, y: 386, width: 119, height: 87 },
    { x: 1135, y: 386, width: 114, height: 87 },
    { x: 1282, y: 386, width: 120, height: 87 },
  ],
  shield: [
    { x: 420, y: 718, width: 105, height: 101 },
    { x: 554, y: 718, width: 127, height: 101 },
    { x: 710, y: 718, width: 117, height: 101 },
    { x: 864, y: 718, width: 132, height: 101 },
    { x: 1042, y: 718, width: 136, height: 101 },
    { x: 1249, y: 718, width: 167, height: 101 },
  ],
};
