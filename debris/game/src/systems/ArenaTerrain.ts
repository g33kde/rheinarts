import type { Vector2 } from '../utilities/Vector2';

/**
 * Static wreckage layouts (docs/roadmap.md's "arena terrain") - the
 * arena was an empty wrapping rectangle, and nothing in the game ever
 * blocked a shot. Wreckage gives the field actual geography: something
 * to break line of sight behind, which changes a Competitive duel more
 * than anything else in this sprint.
 *
 * **The screen-wrap question, resolved by placement rather than by
 * rules**: wrap is the one genuinely load-bearing physics rule in this
 * game (`docs/gameplay.md`: "nothing in this game should treat the
 * arena edges as walls"), and a wreck straddling an edge would have to
 * either wrap - a static body in two places at once - or quietly
 * become a wall. `edgeMarginPx` sidesteps the whole question: wreckage
 * only ever generates in the arena's interior, so a wrapping ship
 * crosses empty space every time and the two systems never meet.
 *
 * **Not destructible** in this pass, deliberately: destructible cover
 * is its own design (what does it leave behind? does it pay score?),
 * and this wants to prove that static geography is worth having first.
 *
 * Pure generation - the caller supplies the keep-out zones and gets
 * back plain positions, so this is testable without a scene.
 */
export interface WreckPlacement {
  readonly position: Vector2;
  readonly radius: number;
  /** Seed for the entity's own procedural silhouette, so a layout is reproducible from its placements alone. */
  readonly shapeSeed: number;
}

export interface TerrainConfig {
  readonly minCount: number;
  readonly maxCount: number;
  readonly minRadius: number;
  readonly maxRadius: number;
  /** Wreckage never generates within this of an arena edge - see the screen-wrap note above. */
  readonly edgeMarginPx: number;
  /** Clearance from anything the caller marks as off-limits (spawn points, the space station). */
  readonly keepOutPaddingPx: number;
  /** Clearance between two wrecks, so they never fuse into a pocket something can get trapped in. */
  readonly minSeparationPx: number;
}

export interface KeepOut {
  readonly position: Vector2;
  readonly radius: number;
}

/**
 * Lays out a stage's wreckage. Rejection sampling with a bounded
 * attempt count: it simply returns fewer wrecks if the arena is too
 * crowded to fit more, rather than looping forever or forcing an
 * overlap - the same "give up gracefully rather than risk a hang"
 * approach `GameScene.pickBlackHoleSpawnPosition` already takes.
 */
export function generateTerrain(
  arenaWidth: number,
  arenaHeight: number,
  keepOuts: readonly KeepOut[],
  config: TerrainConfig,
  rng: () => number = Math.random,
): WreckPlacement[] {
  const target = config.minCount + Math.floor(rng() * (config.maxCount - config.minCount + 1));
  const placed: WreckPlacement[] = [];
  const maxAttempts = target * 40;

  for (let attempt = 0; attempt < maxAttempts && placed.length < target; attempt += 1) {
    const radius = config.minRadius + rng() * (config.maxRadius - config.minRadius);
    const margin = config.edgeMarginPx + radius;
    const position = {
      x: margin + rng() * Math.max(0, arenaWidth - margin * 2),
      y: margin + rng() * Math.max(0, arenaHeight - margin * 2),
    };

    if (overlapsKeepOut(position, radius, keepOuts, config.keepOutPaddingPx)) continue;
    if (overlapsExisting(position, radius, placed, config.minSeparationPx)) continue;

    placed.push({ position, radius, shapeSeed: rng() });
  }

  return placed;
}

function overlapsKeepOut(
  position: Vector2,
  radius: number,
  keepOuts: readonly KeepOut[],
  padding: number,
): boolean {
  return keepOuts.some(
    (zone) => Math.hypot(position.x - zone.position.x, position.y - zone.position.y) < radius + zone.radius + padding,
  );
}

function overlapsExisting(
  position: Vector2,
  radius: number,
  placed: readonly WreckPlacement[],
  separation: number,
): boolean {
  return placed.some(
    (other) => Math.hypot(position.x - other.position.x, position.y - other.position.y) < radius + other.radius + separation,
  );
}

/** True if this placement sits entirely clear of the arena edges - the invariant the wrap note above depends on. */
export function isClearOfEdges(
  placement: WreckPlacement,
  arenaWidth: number,
  arenaHeight: number,
  edgeMarginPx: number,
): boolean {
  const { position, radius } = placement;
  return (
    position.x - radius >= edgeMarginPx &&
    position.y - radius >= edgeMarginPx &&
    position.x + radius <= arenaWidth - edgeMarginPx &&
    position.y + radius <= arenaHeight - edgeMarginPx
  );
}
