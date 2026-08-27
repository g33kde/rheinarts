/**
 * Matter collision categories/masks. Set up now so the "runtime filter
 * toggle" decision in docs/technical_design.md (ship-vs-ship collision
 * off in Cooperative, on in Competitive) has something to flip later -
 * one persistent world, category bits change, not a world rebuild.
 *
 * Also what implements "no rock-on-rock collision" from docs/gameplay.md:
 * asteroids simply don't have SHIP/ASTEROID in their own collides-with
 * mask against each other, same mechanism as everything else here rather
 * than a special-cased manual check.
 */
export const CATEGORY = {
  SHIP: 0x0001,
  ASTEROID: 0x0002,
  PROJECTILE: 0x0004,
  UFO: 0x0008,
  PICKUP: 0x0010,
  UFO_SHOT: 0x0020,
  COMMANDER: 0x0040,
  FRACTURE: 0x0080,
  // The Cardinal's own plasma ball (Phase 2) - a separate bit from
  // FRACTURE rather than reusing it, even though both are "boss
  // projectile vs. ship": the two bosses' collision filters should read
  // independently, not implicitly coupled through a shared category. The
  // rest of The Cardinal's body (arms, core) is a plain-math hazard, not
  // Matter-backed at all - see `entities/Cardinal.ts`'s own doc comment.
  CARDINAL: 0x0100,
} as const;
