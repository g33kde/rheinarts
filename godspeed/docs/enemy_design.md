# Enemy Design

Initial release: 5 enemy types and 1 boss. All 5 plus the boss have shipped
since v0.1; this doc's "not yet implemented" footer used to (incorrectly)
say otherwise - see the 2026-08-05 CHANGELOG entry for the enhancement pass
that gave each type an actual distinguishing behavior instead of just a
stat variant, and gave everything (not just Bulwark/Boss) multiple hit
points.

## Current implementation

All five non-boss types now exist, are named, and each has its own
`src/entities/*.ts` class (previously Drone and Seeker were plain `Enemy`
instances - they needed dedicated classes once GameScene had to tell them
apart via `instanceof` to drive their own behaviors). All share the same
underlying movement (`src/ai/Pathfinding.ts` computes a BFS distance-from-
player field over the maze's cell graph, recomputed on a fixed interval,
`ENEMY.pathUpdateIntervalMs`, rather than every frame; `src/entities/
Enemy.ts` moves in a straight line cell-center to cell-center toward its
current target, snapping on arrival). Colors are still all `COLORS.danger`
red per `docs/art_direction.md` ("red reserved for danger") - types are
told apart by size and a stroke ring, not hue (except Skirmisher's sniper
shot, see below, which is deliberately violet).

Every type now takes multiple projectile hits instead of dying in one shot,
via `src/entities/Enemy.ts`'s generic `hitsRemaining`/`takeHit()`
(previously only Bulwark and Boss had their own copy of this). `GameScene.
resolveProjectileEnemyHits` calls `takeHit()` uniformly now instead of
special-casing `instanceof Boss || instanceof Bulwark`.

- **Drone** (`src/entities/Drone.ts`, `ENEMY.*` config) - the baseline
  chaser, still no gimmick beyond a brief **lunge**: a speed-up
  (`ENEMY.lungeSpeedMultiplier`, 1.6x) when it has a clear straight
  corridor to the player at least `ENEMY.lungeMinCells` (2) cells away -
  see `ai/Pathfinding.ts`'s `hasClearCorridor`. Exists so it isn't
  completely inert next to the other four. `ENEMY.maxHits` = 4.
- **Sentinel** (`src/entities/Sentinel.ts`) - parked and inert (rendered at
  half alpha) until the player wanders within `SENTINEL.triggerDistance`
  (130px), then wakes and chases like a Drone. Now **re-arms**: if the
  player gets past `SENTINEL.rearmDistance` (260px) and stays there for
  `SENTINEL.rearmDelayMs` (3000ms), it goes back dormant - previously it
  stayed woken forever after the first trigger, so the "ambush" was really
  a one-time trap. `SENTINEL.maxHits` = 4.
- **Seeker** (`src/entities/Seeker.ts`, `SEEKER.*` config) - smaller
  (radius 10 vs 14) and faster (~1.5x) than a Drone, and now retargets on
  its own tighter cadence (`SEEKER.pathUpdateIntervalMs`, 100ms vs the
  shared 300ms - `GameScene` runs a second, Seeker-only repath timer) so it
  reacts to the player's direction changes noticeably faster - reads as
  twitchy/relentless rather than just "a fast Drone." `SEEKER.maxHits` = 4.
- **Bulwark** (`src/entities/Bulwark.ts`) - bigger and slower than a Drone,
  takes `BULWARK.maxHits` (5, was 2) hits instead of one. Now **charges**:
  same `hasClearCorridor` speed-up as the Drone's lunge, but a bigger
  multiplier (`BULWARK.chargeSpeedMultiplier`, 1.8x) and a longer required
  runway (`BULWARK.chargeMinCells`, 3) - gives the tank identity an actual
  threat spike instead of being trivially outrunnable at speed 70. A violet
  stroke ring marks it as tougher-than-normal, distinct from the boss's
  gold ring. Still no ranged attack of its own.
- **Skirmisher** (`src/entities/Skirmisher.ts`) - backs away
  (`ai/ChaseBehavior.ts`'s `nextStepAway`) within `SKIRMISHER.fleeDistance`
  (90px), chases normally otherwise. `shouldFlee()` now has **hysteresis**:
  won't resume chasing until the player is past `SKIRMISHER.
  reengageDistance` (130px), not just back past `fleeDistance` again -
  fixes a known flicker bug (a player parked right at the boundary could
  make it flip direction every repath tick). Now also the second enemy
  (besides the Boss) with a ranged attack: the instant it has a clear line
  of sight to the player (`CollisionSystem.ts`'s `hasLineOfSight`, a real
  pixel-space raycast against the wall rects - not the maze cell grid,
  which was the original, much-too-restrictive implementation and the
  reason this used to effectively never fire) and its cooldown is up, it
  fires a fast **sniper** shot (`SKIRMISHER.sniperSpeed`, 900 vs a normal
  projectile's 520; `SKIRMISHER.sniperCooldownMs`, 1600ms) - independent of
  whether it's currently fleeing or chasing, so it snipes on sight rather
  than only while retreating. The actual "hit" in "hit and run," previously
  it was all run and no hit. Sniper shots render in
  `COLORS.skirmisherBeam` (violet, same hex as Bulwark's ring), deliberately
  distinct from the Boss's red aimed shots and the player's gold shots; the
  Skirmisher's own body ring is a separate green (`COLORS.skirmisherRing`)
  so it doesn't get confused with Bulwark's violet ring at a glance either.
  `SKIRMISHER.maxHits` = 4. **Only appears from floor 5 onward** (see the
  floor-roster breakdown below) - if you haven't reached floor 5 in a run,
  you won't have seen one yet.
- Which types appear together, and how many, is decided by
  `src/systems/FloorRoster.ts`'s `enemyRosterForFloor(floor)` - see
  `docs/progression.md` for the floor-by-floor breakdown. Always exactly
  3 enemies (the maze has 4 corner spawn points; the 4th is reserved for
  the boss).
- `src/systems/FloorDifficulty.ts` additionally scales enemy speed and
  boss stats up with floor depth, on top of whatever the roster itself
  does - see `docs/progression.md`.

## Boss

One boss exists, unnamed in the lore/UI (referred to only as "the
Guardian" in a one-line intro banner):

- `src/entities/Boss.ts` extends `Enemy` - same maze-aware chase movement,
  no separate pathfinding code. It's bigger (`BOSS.radius = 22` vs 14),
  slower (`BOSS.speed = 90` vs 110), and takes `BOSS.maxHits = 20` (was 5)
  projectile hits instead of one, now via the same generic `Enemy.
  hitsRemaining`/`takeHit()` every other type uses.
- Fires a projectile at the player every `BOSS.attackCooldownMs` (1400ms,
  further scaled by floor depth - see `FloorDifficulty.ts`).
- **Phase two**: once `hitsRemaining` drops to or below `BOSS.
  phaseTwoHpFraction` (50%) of its max, `isPhaseTwo` flips true and stays
  true. From then on: `canAttack()` multiplies whatever the current
  (already floor-scaled) cooldown is by `BOSS.phaseTwoCooldownMultiplier`
  (0.6, i.e. ~40% faster - a multiplier rather than a flat replacement
  value specifically so it composes correctly with `FloorDifficulty`'s own
  per-floor cooldown scaling instead of potentially being *slower* than
  phase one at very deep floors), and `GameScene.updateBossAttack` fires
  `BOSS.phaseTwoShotCount` (3) shots in a fan (`BOSS.
  phaseTwoSpreadDegrees`, 18° apart, via `utilities/Vector2.ts`'s `rotate`)
  instead of one aimed shot. Previously the fight had exactly one attack
  pattern for its entire duration.
- Trigger: spawns automatically the moment all regular enemies in the
  current maze are dead (`GameScene.spawnBoss()`), at a random open cell
  (excluding only the player's current cell - same `chooseSpawnCells`
  helper pickups use). Defeating it is what actually shows "MAZE CLEARED" -
  clearing the regular enemies alone no longer wins the maze.
- Entrance effect: `playBossEntranceEffect()` - a white/gold/white camera
  flash flicker plus a short screen shake, built entirely from Phaser's
  built-in camera FX (`flash`/`shake`), no new art assets.
- **Real sprite art** (`src/assets/boss-sprite-sheet.png`, user-provided) -
  the third entity with real art after the Warden and the pickups, and the
  first *enemy* to have it; every other enemy is still a flat primitive
  circle. See `src/config/BossFrames.ts`/`src/entities/BossAnimations.ts`.
  Four animations: `idle` (4 frames, unused by gameplay currently - the
  boss is always either moving or attacking once spawned, but registered
  for future use), `walk` (3 frames, loops continuously - the default
  state), `attack` (2 frames, plays once per shot then returns to `walk` -
  see `Boss.playAttack()`, called from `GameScene.updateBossAttack` right
  after it fires), `die` (3 frames, plays once on defeat - `Boss.destroy()`
  marks itself dead immediately so gameplay reacts on the same frame, but
  defers actually removing the GameObjects until the animation finishes).
  The old gold stroke ring is gone - the art itself is the "this is the
  boss" marker now. Its projectiles are still plain red circles (both
  phases), not gold or violet, so the player can tell "boss attack" apart
  from their own shots and from a Skirmisher's sniper shot at a glance.
- `attack`'s frames are reassigned, not both from the attack row: the
  attack row's own "charging" and "firing" poses are fused with zero
  transparent pixels between them anywhere along that span (confirmed by
  probing every column - no real seam to cut), so rather than keep that
  single oversized fused frame, `attack`'s second frame now reuses what
  was originally `walk`'s 4th frame (arm extended, projectile glow just
  starting) - on request, a cleaner purpose-built windup pose instead.
  `walk` dropped from 4 frames to 3 accordingly, and reads as a tighter
  pure locomotion loop without that reaching pose interrupting the cycle.
  See `src/config/BossFrames.ts` for the exact rects.

Not yet implemented: flanking/coordinated-pack behavior between enemies,
sound/vision-based reactions beyond Sentinel's proximity trigger, a third
boss attack type beyond "one shot" / "spread," and any lore/name for the
boss beyond the placeholder "THE GUARDIAN AWAKENS" banner text.
