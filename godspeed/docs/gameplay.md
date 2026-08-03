# Gameplay

## Version 1

- Single player
- Browser
- Full maze visible
- Top-down movement
- 3 biomes
- 5 enemy types
- 1 boss
- 5–15 minute successful runs

## Future

- Local co-op
- Branching biomes
- Electron desktop build

## Current implementation (v0.1)

- 3 lives. Enemy contact costs one life, respawns the player at the maze's
  center cell, and grants a brief invulnerability window
  (`PLAYER.invulnerabilityMs` in `GameConfig.ts`) so the same enemy can't
  immediately re-hit them.
- Losing the last life shows a "GAME OVER" screen; destroying every enemy
  shows a "MAZE CLEARED" screen. Both wait for SPACE, then call
  `scene.restart()`, which regenerates a brand new maze and resets state —
  there's no persistence between runs yet (see `docs/progression.md`).
- The player is animated (idle/walk/shoot/hurt/die), see
  `docs/art_direction.md`. `Player.playHurt()`/`playDie()` are called from
  the same hit-handling path described above - `playDie()` specifically on
  the hit that empties the last life, `playHurt()` otherwise.
- Not yet implemented: multi-floor descent (clearing a maze currently just
  restarts rather than advancing to a harder one), any run timer toward the
  5-15 minute target, and the "5 enemy types + 1 boss" scope from Version 1
  above — only one enemy behavior exists so far (see
  `docs/enemy_design.md`).
