# Enemy Design

Initial release: 5 enemy types and 1 boss.

## Current implementation (v0.1)

All five non-boss types now exist and are named. All share the same
underlying movement (`src/ai/Pathfinding.ts` computes a BFS distance-from-
player field over the maze's cell graph, recomputed on a fixed interval,
`ENEMY.pathUpdateIntervalMs`, rather than every frame; `src/entities/
Enemy.ts` moves in a straight line cell-center to cell-center toward its
current target, snapping on arrival). What differs per type is stats,
which cell/behavior each one asks for from that shared movement system,
and (for two of them) hit points instead of dying in one shot. Colors are
still all `COLORS.danger` red per `docs/art_direction.md` ("red reserved
for danger") - types are told apart by size and a stroke ring, not hue.

- **Drone** (`ENEMY.*` config, plain `Enemy` instance - no subclass) - the
  original type. Direct chaser, dies in one hit, no gimmick. Baseline for
  comparison against the other four.
- **Sentinel** (`src/entities/Sentinel.ts`) - parked and inert (rendered at
  half alpha) until the player wanders within `SENTINEL.triggerDistance`
  (130px), then permanently wakes up and chases exactly like a Drone. An
  ambush type - reacting to the player's approach rather than always
  hunting, per the "react to sound or player movement" idea in
  `docs/game_ideas.md`. Can still be shot and killed while dormant.
- **Seeker** (`SEEKER.*` config, plain `Enemy` instance) - smaller
  (radius 10 vs 14) and faster (~1.5x) than a Drone. A stat variant, not a
  new behavior - the pressure comes from speed, not cleverness.
- **Bulwark** (`src/entities/Bulwark.ts`) - bigger and slower than a Drone,
  takes `BULWARK.maxHits` (2) projectile hits instead of one. A violet
  stroke ring marks it as tougher-than-normal, distinct from the boss's
  gold ring so the two are never confused at a glance. No ranged attack -
  that's the one thing reserved for the actual boss.
- **Skirmisher** (`src/entities/Skirmisher.ts`) - backs away
  (`ai/ChaseBehavior.ts`'s `nextStepAway`, the mirror of the normal chase
  function - picks the neighbor cell that's farther from the player instead
  of closer) whenever the player closes to within `SKIRMISHER.fleeDistance`
  (90px), chases normally otherwise. A "hit and run" type per the
  "retreat or regroup" idea in `docs/game_ideas.md`. Known rough edge:
  the flee/chase switch is a hard distance threshold with no hysteresis,
  so a player hovering right at that distance could see it flicker
  direction each repath tick (every 300ms) - untested in an actual
  browser, flagged as a thing to watch for.
- Which types appear together, and how many, is decided by
  `src/systems/FloorRoster.ts`'s `enemyRosterForFloor(floor)` - see
  `docs/progression.md` for the floor-by-floor breakdown. Always exactly
  3 enemies (the maze has 4 corner spawn points; the 4th is reserved for
  the boss).
- `src/systems/FloorDifficulty.ts` additionally scales enemy speed and
  boss stats up with floor depth, on top of whatever the roster itself
  does - see `docs/progression.md`.

## Boss (v0.1)

One boss exists, unnamed in the lore/UI (referred to only as "the
Guardian" in a one-line intro banner):

- `src/entities/Boss.ts` extends `Enemy` - same maze-aware chase movement,
  no separate pathfinding code. It's bigger (`BOSS.radius = 22` vs 14),
  slower (`BOSS.speed = 90` vs 110), and takes `BOSS.maxHits = 5` projectile
  hits instead of one (reuses `HealthSystem.applyHit`/`isGameOver` for the
  hit-point math).
- Additionally fires a projectile straight at the player's current position
  every `BOSS.attackCooldownMs` (1400ms) - the first enemy that can damage
  the player at range rather than only on contact.
- Trigger: spawns automatically the moment all regular enemies in the
  current maze are dead (`GameScene.spawnBoss()`), at the maze's first
  corner spawn cell. Defeating it is what actually shows "MAZE CLEARED" -
  clearing the regular enemies alone no longer wins the maze.
- Entrance effect: `playBossEntranceEffect()` - a white/gold/white camera
  flash flicker plus a short screen shake, built entirely from Phaser's
  built-in camera FX (`flash`/`shake`), no new art assets. Added directly
  in response to user feedback requesting something like a lightning/
  screen-blink moment for the boss's appearance.
- Visually: same red as regular enemies (matches `docs/art_direction.md` -
  "red is reserved for danger and bosses"), with a gold ring
  (`COLORS.projectile`) as the only added visual marker distinguishing it
  from a regular enemy. Its own projectiles are red, not gold, so the
  player can tell "boss attack" apart from their own shots at a glance.

Not yet implemented: the other 4 enemy types, flanking/ambush/retreat
behaviors (see `docs/game_ideas.md`), sound/vision-based reactions, boss
attack pattern variety (only one attack exists - a single aimed shot on a
timer, nothing like the "summon minions / alter the maze / break walls"
ideas from `docs/game_ideas.md`), and any lore/name for the boss beyond the
placeholder "THE GUARDIAN AWAKENS" banner text. All of that is still open
design work, not just missing code — "5 enemy types" needs actual
names/roles/stats decided, which nothing in `docs/` specifies yet.
