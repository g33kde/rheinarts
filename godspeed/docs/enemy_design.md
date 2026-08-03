# Enemy Design

Initial release: 5 enemy types and 1 boss.

## Current implementation (v0.1)

One behavior exists so far — a chaser:

- `src/ai/Pathfinding.ts` computes a BFS distance-from-player field over the
  maze's cell graph, recomputed on a fixed interval
  (`ENEMY.pathUpdateIntervalMs` in `GameConfig.ts`) rather than every frame.
- `src/ai/ChaseBehavior.ts` picks, per enemy, whichever open neighbor cell
  is strictly closer to the player according to that field.
- `src/entities/Enemy.ts` moves in a straight line cell-center to
  cell-center toward that target, snapping on arrival (no overshoot/jitter).
- Enemies die in one hit from a player projectile
  (`circlesIntersect` in `CollisionSystem.ts`); touching the player costs a
  life (see `docs/gameplay.md`).
- `ENEMY.count` (currently 3) spawn at the maze's four corners at scene
  start; no waves, respawning, or difficulty scaling yet.

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
