/** `0x00e5ff` -> `'#00e5ff'`, for Phaser text/DOM styles that want CSS hex. */
export function toCssHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
