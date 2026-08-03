/**
 * Scale factor to fit content of `contentWidth x contentHeight` entirely
 * within `boundsWidth x boundsHeight`, preserving aspect ratio (letterboxed,
 * never cropped). Used to place full-bleed art (splash/menu backgrounds)
 * inside the game canvas without cutting off any of it.
 */
export function containScale(
  contentWidth: number,
  contentHeight: number,
  boundsWidth: number,
  boundsHeight: number,
): number {
  return Math.min(boundsWidth / contentWidth, boundsHeight / contentHeight);
}
