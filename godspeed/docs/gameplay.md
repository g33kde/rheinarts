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
- Losing the last life shows a "GAME OVER" screen and resets to floor 1;
  defeating the boss shows a "FLOOR N CLEARED" screen and advances to a
  harder floor within the same run, lives and upgrades carried over (see
  `docs/progression.md` for the full floor-advance mechanics). Both wait
  for SPACE before continuing.
- The player is animated (idle/walk/shoot/hurt/die), see
  `docs/art_direction.md`. `Player.playHurt()`/`playDie()` are called from
  the same hit-handling path described above - `playDie()` specifically on
  the hit that empties the last life, `playHurt()` otherwise. A blocked
  hit (see Shield in `docs/progression.md`) triggers neither.
- The "5 enemy types + 1 boss" scope from Version 1 above is now fully
  built - see `docs/enemy_design.md` for what each type does.
- Not yet implemented: any run timer toward the 5-15 minute target (floors
  can currently be descended indefinitely with no time pressure), and any
  UI surfacing of floor depth beyond the HUD's plain number.
