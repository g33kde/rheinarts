# Level Design

Random procedural floors initially. Branching biome system planned.

## Current implementation (v0.1)

- `src/systems/MazeGenerator.ts` generates a "perfect" maze (every cell
  reachable, no loops) via a randomized depth-first backtracker over an
  `cols x rows` cell grid, then expands it into a uniform tile grid
  (`2*rows+1` x `2*cols+1`) so both floor cells and the walls between them
  sit on the same grid pitch (`MAZE.tileSize`). Walls themselves render and
  collide as thin bars/posts (`MAZE.wallThickness = 10`, via
  `tileSegmentSize()`), not solid `tileSize`-square blocks - a full-size
  block read as much thicker than needed given the player already moves
  freely between cells; direct user feedback after playtesting the earlier
  block-wall version.
- `src/entities/MazeView.ts` renders the tile grid and exposes the wall
  rects for collision, plus a floor-cell-center lookup used to place the
  player.
- The player collides with walls via `src/systems/CollisionSystem.ts`
  (circle-vs-rect push-out); projectiles are destroyed on wall contact.
- `braidMaze(maze, extraConnectionChance, rng)` in `MazeGenerator.ts` runs
  after generation to knock down extra walls (`MAZE.braidChance = 0.6`),
  turning the single-path spanning tree into a loopy, multi-route layout
  with open rooms - closer to the source material's maze (an open arena
  with occasional short walls, not a dense one-path labyrinth) than a plain
  perfect maze is. This was a direct correction against a reference
  screenshot of the original arcade maze, which is clearly loop-heavy and
  fairly open rather than corridor-like. Braiding only ever adds
  connections, so the maze stays fully connected regardless of the chance
  value.
- **Biomes**: `GameConfig.ts` defines `BIOMES`, three `{name, background,
  wall}` environment palettes (Obsidian Depths / Sapphire Vault / Violet
  Sanctum), all within the palette documented in `docs/art_direction.md`.
  `systems/BiomeSelection.ts`'s `selectBiome(mazesCleared, BIOMES)` cycles
  through them by how many mazes have been cleared this session (0→Obsidian,
  1→Sapphire, 2→Violet, 3→Obsidian again, ...), so repeated runs read as
  moving through different environments even though there's no
  multi-floor/descent system yet to actually attach a biome to (see
  `docs/gameplay.md`). Only the background and wall color change per
  biome - player, enemy, projectile, and pickup colors are constant across
  all three, so gameplay-critical color coding never shifts with the
  environment (e.g. the boss's gold ring always means "boss," regardless
  of which biome it's fought in).
- Not yet implemented: secret rooms, side paths that are deliberately
  distinct from the main route (right now "openness" is uniform across the
  whole maze - there's no tuned mix of tight corridors vs. open rooms), any
  per-biome *gameplay* variation (enemy mix, maze size, braid chance,
  music/audio), or per-floor difficulty scaling. The three biomes are
  currently palette-only - "three biomes" here means three ways the same
  maze looks, not three different mazes to play. `MAZE.braidChance` is a
  single global knob; whether 0.6 is actually the right amount of openness
  is unverified (no browser tool in this environment - see
  `CHANGELOG.md`).
