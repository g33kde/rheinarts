export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WardenAnimationName = 'idle' | 'walk' | 'shoot' | 'hurt' | 'die';

/**
 * Pixel rects into src/assets/warden-sprite-sheet.png (1254x1254), one
 * entry per animation frame, in playback order. The source sheet also has
 * ATTACK, JUMP, FALL, and LAND rows - deliberately not used here.
 *
 * These were measured, not eyeballed: the sheet's background is a flat,
 * alpha-free ~(21,21,21), so frame boundaries were found by scanning for
 * background-only gaps between poses, then every row was spot-checked by
 * cropping individual frames and viewing them. One SHOOT frame came back
 * merged (two poses bridged by a bright muzzle-flash effect with no
 * background gap between them) and was manually re-split after finding
 * the true gap in a flash-free region (the lower body/legs).
 *
 * The bundled sheet's transparency is *not* a naive per-pixel color-key:
 * the flat background has enough grain/noise that a simple distance
 * threshold left stray specks inside several frames. It's a per-frame
 * connected-component pass instead - keep any blob of near-background-
 * distance pixels at or above ~15px (real content: the character body,
 * muzzle-flash sparks, dust-burst motes), discard anything smaller (noise).
 *
 * Size alone wasn't quite enough: the source art has a small checkmark-
 * shaped mark (not character content, cause unknown - possibly a QA
 * annotation left in by whoever produced the sheet) at the exact top-left
 * corner of the `shoot` and `hurt` first frames specifically, big enough
 * (~50-157px) to survive the size filter. Those two frames get an extra
 * hardcoded corner exclusion in the cleaning script. See CHANGELOG.md.
 */
export const WARDEN_FRAMES: Record<WardenAnimationName, FrameRect[]> = {
  idle: [
    { x: 71, y: 30, width: 104, height: 130 },
    { x: 184, y: 30, width: 98, height: 130 },
    { x: 293, y: 30, width: 96, height: 130 },
    { x: 401, y: 30, width: 95, height: 130 },
    { x: 508, y: 30, width: 91, height: 130 },
    { x: 618, y: 30, width: 93, height: 130 },
    { x: 729, y: 30, width: 101, height: 130 },
  ],
  walk: [
    { x: 58, y: 187, width: 102, height: 118 },
    { x: 175, y: 187, width: 93, height: 118 },
    { x: 277, y: 187, width: 100, height: 118 },
    { x: 391, y: 187, width: 97, height: 118 },
    { x: 503, y: 187, width: 95, height: 118 },
    { x: 617, y: 187, width: 95, height: 118 },
    { x: 732, y: 187, width: 102, height: 118 },
    { x: 865, y: 187, width: 101, height: 118 },
  ],
  shoot: [
    { x: 61, y: 477, width: 97, height: 105 },
    { x: 172, y: 477, width: 96, height: 105 },
    { x: 280, y: 477, width: 98, height: 105 }, // manually re-split, see header comment
    { x: 378, y: 477, width: 98, height: 105 }, // manually re-split, see header comment
    { x: 482, y: 477, width: 129, height: 105 },
    { x: 621, y: 477, width: 116, height: 105 },
    { x: 761, y: 477, width: 153, height: 105 },
  ],
  hurt: [
    { x: 52, y: 612, width: 77, height: 95 },
    { x: 155, y: 612, width: 73, height: 95 },
    { x: 258, y: 612, width: 69, height: 95 },
    { x: 342, y: 612, width: 74, height: 95 },
  ],
  die: [
    { x: 59, y: 742, width: 67, height: 89 },
    { x: 150, y: 742, width: 68, height: 89 },
    { x: 243, y: 742, width: 94, height: 89 },
    { x: 375, y: 742, width: 88, height: 89 },
    { x: 497, y: 742, width: 110, height: 89 },
    { x: 629, y: 742, width: 118, height: 89 },
    { x: 768, y: 742, width: 113, height: 89 },
    { x: 902, y: 742, width: 80, height: 89 },
  ],
};
