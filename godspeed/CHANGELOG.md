# Changelog

A running log of implementation work on Godspeed, written for AI coding agents
(and humans) picking up the project cold. Read the newest entry before starting
work, then check `docs/roadmap.md` for the next planned item.

Add a new entry — newest at the top — whenever you complete a feature or
milestone, per the Documentation Rule and Definition of Done in
`docs/ai_development_guide.md`.

---

## 2026-08-06 — Boss attack frame reassigned from Walk

### What was built

On request: `attack`'s awkward second frame (the fused charge+fire pose,
600px wide - see the previous entry's "measure, don't invent" note) is
gone, replaced by what was `walk`'s 4th frame (arm extended, projectile
glow just starting at the hand) - a cleaner, purpose-built windup pose.
`walk` dropped from 4 frames to 3 accordingly. Both changes are in
`src/config/BossFrames.ts` only - `BossAnimations.ts` reads frame counts
from the data itself, no hardcoded assumptions to update elsewhere.
Republished the animation-viewer artifact from the previous entry with
the new frame data so it reflects the current state.

### Verified

- `npx tsc --noEmit`, `npx eslint src tests`, `npm run test` (110/110,
  unchanged), `npm run build` all clean.

### Not done yet

- Same standing caveat as the previous entry - not yet seen animating in
  a live browser, only in the canvas-based artifact viewer and via the
  frame data itself.

---

## 2026-08-06 — Boss sprite art (animated, first enemy with real art)

### What was built

The Boss now renders real animated sprite art instead of a flat red circle
with a gold ring: idle (loop, unused by gameplay yet), walk (loop, default
state), attack (plays once per shot then returns to walk), die (plays once
on defeat). Source art (`godspeed/artwork/boss-sprite-sheet.png`,
user-provided, 1536x1024) followed the same measure-then-crop-verify
process as the Warden and pickup sheets. New `src/config/BossFrames.ts` +
`src/entities/BossAnimations.ts` mirror the established
`WardenFrames.ts`/`WardenAnimations.ts` and
`PowerupFrames.ts`/`PowerupAnimations.ts` split exactly.

This required a real architecture change, unlike the pickups: `Enemy` (the
base class every enemy including Boss extends) only ever built a flat
Phaser `Arc` circle. `Enemy`'s `sprite` field is now typed
`Phaser.GameObjects.Arc | Phaser.GameObjects.Sprite`, with a new optional
`visual` constructor param (`{ textureKey, frameKey, scale }`) - when
given, a real `Sprite` is built instead of a circle. `radius` (the
collision hitbox) stays decoupled from the visual's `scale`, same as
`PLAYER.radius`/`WARDEN_SPRITE.scale` already were. Bulwark and Skirmisher
(the two other subclasses that call the Arc-only `setStrokeStyle` for
their rings) needed a local cast since `sprite`'s static type is now a
union - safe, since neither ever passes `visual`.

### Key decisions

- Two of the sheet's four rows (`walk`, `die`) needed a smaller gap-merge
  threshold (8px) than the pickup sheet's alpha-scan used (20px) - both
  have a genuine but narrow (~10-15px) transparent seam between poses that
  the larger threshold was incorrectly bridging into one wide "frame."
  Found by probing the alpha channel at full column resolution across the
  suspiciously-merged region and finding a real (if narrow) near-zero dip,
  not just noise.
- `attack` ships as 2 frames, not the visually-implied 3 (windup / charge /
  fire): probed every column across the "charge→fire" span and found zero
  points below full opacity anywhere in it - the source art has no
  transparent seam there at all, the two poses are fused. Rather than
  invent a cut through connected artwork (which the earlier gap-merge fix
  correctly does NOT paper over, since there's no gap of any size to find),
  frame 1 covers both poses as a single wide frame. This is the same
  "measure, don't invent" principle as the Skirmisher-sheet's genuinely-
  6-frame Shield row two entries ago - respecting what's actually in the
  pixels over what the thumbnail visually implied.
- `Boss.destroy()` overrides the base class instead of just calling
  `super.destroy()`: it sets `alive = false` immediately (Enemy's `alive`
  field is now `protected`, not `private`, specifically for this) so
  `GameScene`'s "boss defeated" checks fire on the correct frame, but
  defers the actual `sprite.destroy()`/health-bar cleanup (extracted into
  a new `protected destroyVisuals()` in the base class) until the `die`
  animation's `ANIMATION_COMPLETE` event - the boss visibly crumbles while
  the "FLOOR CLEARED" text appears, instead of vanishing instantly.
- No separate "enraged" phase-two art exists in the delivered sheet (the
  original prompt suggested one, but the user's actual art has 4 rows:
  idle/walk/attack/die) - both phases share the same walk/attack
  animations. Only the already-existing mechanical changes (faster
  cooldown, spread shot) communicate phase two; not compensated for
  visually here since the art to do so doesn't exist yet.

### Verified

- `npx tsc --noEmit`, `npx eslint src tests`, `npm run test` (110/110,
  unchanged - no new pure logic), `npm run build` (confirms
  `boss-sprite-sheet-*.png` bundles) all clean.
- Dev server started and both the page and the new asset URL curled
  directly (200/200).
- All 13 frames (4+4+2+3) cropped to a contact sheet and visually
  inspected before committing coordinates to `BossFrames.ts`.

### Not done yet

- Never seen actually animating in a live browser (no browser tool in
  this environment) - confirms the asset loads and the frame math is
  internally consistent, not that the animations play/transition
  correctly at runtime (walk→attack→walk, or the die sequence timing
  against `enterFloorCleared`'s own text/restart flow).
- `idle` is registered but nothing in `GameScene`/`Boss` ever triggers it -
  the boss is always either moving or attacking once spawned. Left wired
  up for a possible future use (e.g. a brief pause during the entrance
  banner) rather than removed, since it's real content from the sheet, not
  dead code in the usual sense.

---

## 2026-08-05 — Real pickup sprite art (animated, replaces flat circles)

### What was built

Pickups now render as animated sprite icons instead of flat colored
circles: boot (Speed), bullet (Rapid Fire), heart (Extra Life), shield
(Shield), each looping a short idle animation. Source art
(`godspeed/artwork/powerups-sprite-sheet.png`, user-provided, 1536x1024)
had 5 rows - the 4th ("Extra Life," a duplicate of row 3 whose last frame
morphs into a Shield icon mid-generation) was discarded per direct
instruction. New `src/config/PowerupFrames.ts` (frame rects, keyed by the
existing `UpgradeType` rather than a redundant parallel enum) and
`src/entities/PowerupAnimations.ts` (registers sub-frames + builds one
looping Phaser animation per type) follow the exact same split
`WardenFrames.ts`/`WardenAnimations.ts` already established.
`entities/Pickup.ts` swapped `scene.add.circle` for `scene.add.sprite`.

### Key decisions

- Frame boundaries were measured, not eyeballed - per the standing project
  rule (this exact scenario burned real time on the Warden sheet
  previously). Unlike the Warden sheet, this one already has real alpha-
  channel transparency (confirmed by sampling pixels: corners/gaps are
  A=0), so frames were found by scanning the alpha channel for content
  bands/columns rather than a background-color-distance threshold. Raw
  detection initially over-segmented (motion-blur/glow trails dipping
  below the alpha threshold for a few px, splitting single icons into 2-3
  pieces) - fixed by merging segments separated by a small gap and
  dropping anything still under ~30px wide as residual noise. Every frame
  was then cropped to a contact sheet and visually spot-checked before
  committing the numbers to `PowerupFrames.ts`.
- Shield's row only has 6 frames, not 7 like the other three - confirmed
  by probing the alpha channel directly in the gap where a 7th frame would
  sit (zero content across a ~65px span). The source sheet genuinely only
  generated 6 shield icons; not a detection bug.
- Removed `COLORS.pickupSpeed`/`pickupRapidFire`/`pickupExtraLife` from
  `GameConfig.ts` - dead code once `Pickup.ts` stopped flat-tinting a
  circle (each icon now carries its own baked-in color). Kept
  `COLORS.pickupShield`: `HUD.ts`'s hand-drawn shield icon still uses it,
  confirmed via a repo-wide grep before deciding what to keep.
- New `POWERUP_SPRITE.scale` (0.22) targets ~26px on screen for a typical
  ~120px-wide source frame - a bit bigger than the old flat circle's 20px
  diameter, reads clearly in a 40px maze tile without dominating it. Each
  animation's last frame is a wider "flash" pose in the source art (up to
  224px for Speed) and reads noticeably bigger for that one frame -
  intentional, left as-is rather than compensated for.

### Verified

- `npx tsc --noEmit`, `npx eslint src tests`, `npm run test` (110/110,
  unchanged - no new pure logic), `npm run build` (confirms
  `powerups-sprite-sheet-*.png` is bundled) all clean.
- Started the Vite dev server and curled both the page and the new asset
  URL directly (both 200), confirming it's actually served, not just
  referenced.
- Frame boundaries verified by cropping and visually inspecting a contact
  sheet of all 27 frames (7+7+7+6) before wiring them into the game -
  not just trusting the alpha-scan numbers blind.

### Not done yet

- Never seen actually rendering in a live browser (no browser tool in
  this environment) - the dev-server check above confirms the asset
  loads, not that `Phaser.Textures`' sub-frame registration or the
  animations play correctly at runtime. Worth a real playtest.
- No confirmation the 0.22 scale/8fps frame rate feel right in motion
  against the maze - tuned by reasoning about pixel dimensions, not by
  eye in-game.

---

## 2026-08-05 — Skirmisher snipes on sight, not just while fleeing

### What was built

The sniper shot (see the two entries below) fired only while `isFleeing`
was true. On request, it now fires the moment it has a clear line of sight
to the player and its cooldown is ready, regardless of whether it's
currently fleeing or chasing - `updateSkirmisherAttacks` in `GameScene.ts`
dropped the `isFleeing` check entirely. Movement (flee within 90px, chase
otherwise) is unchanged; this only changed the firing trigger.

### Key decisions

- Removed `Skirmisher.isFleeing` entirely rather than leaving it as dead
  code - it was only ever read by the one call site just removed, and
  nothing else in the codebase referenced it (confirmed with a repo-wide
  grep before deleting).

### Verified

- `npx tsc --noEmit`, `npx eslint src tests`, `npm run test` (110/110,
  unchanged - no new pure logic, just removed a condition) all clean.

### Not done yet

- Never seen in an actual browser (no browser tool in this environment) -
  worth checking this doesn't feel like it fires *too* often now that it's
  not gated to the retreat window (the 1600ms cooldown is the only
  remaining rate limit).

---

## 2026-08-05 — Skirmisher green ring + confirmed floor-5 spawn gating

### What was built

Added a green stroke ring (`COLORS.skirmisherRing`, `0x2ecc71`) to the
Skirmisher's sprite, on request - previously it had no ring at all (Bulwark
gets violet, Boss gets gold, Skirmisher had nothing distinguishing it
beyond size). Also investigated a "does the Skirmisher ever spawn?"
question: confirmed via `systems/FloorRoster.ts` and its tests that yes, it
does, but **only from floor 5 onward** - `enemyRosterForFloor` doesn't
introduce it until the `floor >= 5` case (`['seeker', 'bulwark',
'skirmisher']`); floors 1-4 never include it. If a run hasn't reached floor
5, a Skirmisher is never going to have appeared - that's working as
designed (one new type introduced per floor), not a bug, but easy to read
as "broken" if you've been testing on earlier floors.

### Key decisions

- Green isn't in `docs/art_direction.md`'s documented palette (dark stone,
  obsidian, gold, sapphire, violet, white) - added anyway since it was an
  explicit request, but flagged here and in `enemy_design.md` rather than
  silently expanding the palette without a note.

### Verified

- `npx tsc --noEmit`, `npx eslint src tests`, `npm run test` (110/110,
  unchanged - this was a visual-only change) all clean.
- The floor-5 spawn gating was confirmed by reading `FloorRoster.ts` and
  its existing test suite directly, not by playtesting a run to floor 5.

### Not done yet

- Never seen in an actual browser (no browser tool in this environment) -
  whether green reads clearly against the maze's per-biome wall/background
  colors (see `BIOMES` in `GameConfig.ts`) hasn't been checked.

---

## 2026-08-05 — Fix: Skirmisher's sniper shot effectively never fired

### What was built

User-reported bug: the Skirmisher's sniper shot (added in the enemy
enhancement pass, see below) essentially never fired in actual play. Root
cause: its line-of-sight check was `ai/Pathfinding.ts`'s `hasClearCorridor`,
which requires the Skirmisher and player to sit in *exactly* the same
maze row or column, with every wall between them open. In an 11x7 grid
that's already a narrow coincidence, and it doesn't account for diagonal
sightlines at all - a Skirmisher one cell off either axis from the player
could have an obviously clear view and still never qualify. Replaced it
with a real pixel-space line-of-sight raycast: new `CollisionSystem.ts`
functions `segmentIntersectsRect` (slab-method line segment/AABB test) and
`hasLineOfSight` (true if no wall rect blocks the straight line between two
points), checked against the same `wallRects` the player/enemies already
collide against. Works at any angle, not just axis-aligned cells.

### Key decisions

- `hasClearCorridor` (cell-grid based) stays as-is for the Drone's lunge
  and Bulwark's charge - those are speed boosts tied to *movement along the
  maze's cell-to-cell paths*, which are only ever axis-aligned anyway
  (enemies move in straight lines between cell centers), so the cell-grid
  check is the right tool there. It was only the wrong tool for "can this
  enemy see the player to snipe," which is a real geometric line-of-sight
  question independent of the cell grid.
- Reused the existing `wallRects` (already built once per maze in
  `MazeView`, already used for player/projectile collision) rather than
  re-deriving geometry from the cell graph - one source of truth for "where
  the walls physically are."

### Verified

- `npx tsc --noEmit`, `npx eslint src tests`, `npm run test` (110/110, 6
  new: `segmentIntersectsRect`/`hasLineOfSight` cases including a
  diagonal-segment corner clip), `npm run build` all clean.

### Not done yet

- Still not confirmed in an actual browser (no browser tool in this
  environment) - the user's original report was from real play, so this
  fix is reasoned from the code, not re-verified against the same repro.
  Worth a playtest to confirm the sniper shot now actually fires at a
  believable rate (not too rarely, and not so often it feels spammy).

---

## 2026-08-05 — Enemy health bars, game-over-to-menu, random boss spawn

### What was built

- **Enemy health bars**: every enemy (including the Boss) now shows a
  small bar under its sprite - a background rect plus a fill rect that
  shrinks with `hitsRemaining/maxHits`, both drawn as separate
  `Phaser.GameObjects.Rectangle`s at a forced-higher depth
  (`ENEMY_HEALTH_BAR.depth`) rather than baked into the enemy's own circle.
  Lives in the base `Enemy` class so every subclass gets it for free;
  repositions every frame in `update()` to follow the sprite, and is
  cleaned up in `destroy()`.
- **Game over → main menu**: dying now sends the player to `MenuScene`
  (previously `scene.restart()`'d straight into a fresh floor-1 run), and
  any key (not just SPACE) continues past the GAME OVER screen -
  `showEndScreen` takes a new `anyKey` param that swaps the `keydown-SPACE`
  listener for a bare `keydown` one and updates the on-screen prompt to
  match. Floor-cleared screens are unchanged (still SPACE-only, still
  restarts into the next floor).
- **Random boss spawn**: `spawnBoss()` now picks a random open cell via the
  same `chooseSpawnCells` helper pickups already use, excluding only the
  player's current cell, instead of always using the same fixed corner.

### Key decisions

- Made `Enemy.maxHits` `protected` (was going to stay `private`) once
  `Boss.ts` needed it too for its phase-two threshold - Boss previously
  kept its own duplicate `private maxHits` field, which would now collide
  with the base class's identically-named private field (TypeScript
  rejects two separate private declarations of the same name across a
  base/derived pair). Protected + no duplicate declaration is simpler than
  it was before, not just conflict-free.
- Health bar fill uses `setDisplaySize()`, not a direct `.width` mutation -
  with the fill rectangle's origin at (0, 0.5), scaling via display size
  keeps the left edge anchored and shrinks toward it (bar drains right to
  left), which a raw geometry resize isn't guaranteed to do consistently.
- Boss spawn only excludes the player's exact current cell, not a wider
  safety radius around it - matches the existing pickup-placement pattern
  exactly (`chooseSpawnCells` was written for exact-cell exclusion, not
  radius-based), and keeps the change scoped to "random" rather than also
  redesigning spawn fairness that wasn't asked for.

### Verified

- `npx tsc --noEmit`, `npx eslint src tests`, `npm run test` (104/104),
  `npm run build` all clean.

### Not done yet

- Never seen in an actual browser (no browser tool in this environment) -
  health bar sizing/spacing under small-radius enemies (Seeker, radius 10)
  and the boss's random spawn actually landing somewhere reasonable (not,
  say, directly adjacent to a wall corner in a way that looks odd) both
  need a real playtest.
- No minimum-distance guarantee between the boss's random spawn and the
  player beyond "not the exact same cell" - a spawn one cell away is
  possible and would feel abrupt given the entrance camera-shake/flash
  plays regardless of distance.

---

## 2026-08-05 — Enemy enhancement pass + player movement easing

### What was built

Player movement now ramps toward its target velocity (`PLAYER.
accelerationPxPerSec2`, ~0.1s to reach full speed from a standstill) instead
of snapping instantly, via new `MovementSystem.approachVelocity`/
`scaledVelocity` pure helpers, in response to feedback that movement felt
"too direct." `Player.teleportTo` (used on respawn-after-hit) also resets
velocity to zero so a fresh spawn doesn't carry momentum from before the hit.

All five non-boss enemy types got an actual distinguishing behavior instead
of being pure stat variants, all enemies (Drone/Sentinel/Seeker/Skirmisher)
now take 4 hits instead of 1 and Bulwark takes 5 (was 2) - "+3 all round" -
and the Boss takes 20 (was 5) and gained a second phase. See the rewritten
`docs/enemy_design.md` for full details; summary:

- **Drone** - "lunge" (1.6x speed) on a clear straight corridor to the player.
- **Sentinel** - re-arms (goes back dormant) if the player stays away long
  enough, instead of staying woken forever after the first trigger.
- **Seeker** - retargets on its own 100ms cadence instead of the shared
  300ms tick, via a second repath timer in `GameScene`.
- **Bulwark** - "charges" (1.8x speed) on a longer clear corridor than the
  Drone's lunge needs.
- **Skirmisher** - flee/chase now has hysteresis (fixes a known flicker
  bug), and it fires a fast violet "sniper" shot while retreating with a
  clear line of sight - the second enemy with a ranged attack besides the
  Boss.
- **Boss** - phase two past 50% HP: faster attacks (a cooldown multiplier
  that composes with `FloorDifficulty`'s existing per-floor scaling) and a
  3-shot spread instead of one aimed shot.

New pure helpers backing all of this: `ai/Pathfinding.ts`'s
`hasClearCorridor` (row/column-aligned, wall-free straight line between two
cells - shared by the Drone lunge, Bulwark charge, and Skirmisher sniper
line-of-sight checks) and `utilities/Vector2.ts`'s `rotate` (for the Boss's
spread shot).

### Key decisions

- Gave `Enemy` (the base class) a generic `hitsRemaining`/`takeHit()`
  instead of leaving it Bulwark/Boss-only - every type needing multiple
  hits made the old `instanceof Boss || instanceof Bulwark` special-case in
  `GameScene.resolveProjectileEnemyHits` pointless; it's now a single
  unconditional `chaser.takeHit()`.
- Drone and Seeker got their own dedicated classes (`Drone.ts`, `Seeker.ts`)
  instead of staying plain `Enemy` instances - now that each has its own
  behavior, `GameScene` needs `instanceof` to tell them apart, which a
  shared class can't provide.
- Boss's phase-two cooldown is a *multiplier* on its current cooldown, not
  a flat replacement value - a flat value could accidentally end up
  *slower* than phase one's already floor-scaled cooldown at very deep
  floors, which a multiplier composes correctly with regardless of depth.
- Skirmisher's sniper shot is rendered in a new `COLORS.skirmisherBeam`
  (same violet hex as `bulwarkRing`) rather than reusing the Boss's red or
  the player's gold - so players can tell all three projectile sources
  apart at a glance. Violet is already an established palette color (see
  `docs/art_direction.md`), so this isn't a new hue, just a new use of one.
- Player acceleration is a fixed px/s² constant, not a time-constant that
  scales with the current (possibly upgrade-boosted) max speed - simpler,
  avoids a divide-by-zero when decelerating to a zero target, and the
  "tiny" framing means it doesn't need to be perfectly consistent across
  every speed-multiplier stack.
- The HP increases (+3 across the board, Boss to 20) and which enemy got
  the ranged sniper (Skirmisher, chosen over Drone/Sentinel/Seeker/Bulwark
  since "keeps its distance and hits from range" already is its identity)
  were both explicit user calls, not balance choices made unprompted here.

### Verified

- `npx tsc --noEmit`, `npx eslint src tests`, `npm run test` (104/104,
  15 new), `npm run build` all clean.

### Not done yet

- Never played in an actual browser (no browser tool in this environment) -
  this is a real balance swing (every regular enemy now takes 4x the
  shots to kill, the boss 4x), so the actual in-game feel - especially
  floor 1, which used to be one-shot-kill Drones - needs a real playtest
  before treating these numbers as final.
- Sentinel's re-arm walks back to wherever it happened to be when it lost
  the player, not back to its original post - a minor simplification, not
  a "patrol back to spawn" behavior.
- Bulwark's charge and Drone's lunge share the same `hasClearCorridor`
  check but aren't visually distinguished from their normal state beyond
  speed (no wind-up telegraph, no trail effect) - acceptable for a first
  pass, a candidate for a follow-up polish round.

---

## 2026-08-04 — Escape-to-quit confirmation on the main menu

### What was built

Pressing `Escape` on the main menu (`MenuScene`) now opens a "QUIT GAME?"
confirm dialog (Yes/No), navigable the same way as the rest of the menu
(mouse hover/click, or Up/Down + Enter/Space) - `Escape` again cancels it,
same toggle symmetry as the in-run pause menu. Choosing Yes sends the
browser to `/`, the portal's cabinet screen; No closes the dialog and
returns to the menu. HyperOut got the equivalent: a new `quitMenu` overlay
panel (`hyperout/index.html`) wired into `hyperout/game.js`'s existing state
machine as a `STATE.QUIT_CONFIRM` state, reachable the same way (`Escape`
from `STATE.MENU`).

### Key decisions

- Both games navigate with an absolute `window.location.href = '/'`, not a
  relative path - correct for how they're actually deployed (nginx serves
  the portal at site root, HyperOut at `/hyperout/`, Godspeed at
  `/godspeed/`; see root `DEPLOYMENT.md`). In each game's own standalone dev
  server this doesn't reach a real portal (no portal is running there), a
  known/accepted limitation rather than something worth adding dev-only
  branching for.
- Godspeed's dialog is Phaser-native (add.rectangle + add.text), same
  pattern as `GameScene`'s existing pause overlay, not a DOM overlay -
  consistent with every other screen in that codebase.
- HyperOut's dialog reuses existing `.overlay.panel` / `.pause-title` /
  `.big-btn` / `.menu-btn` CSS classes from the pause menu - no new CSS.

### Verified

- Godspeed: `npx tsc --noEmit`, `npx eslint src`, `npm run test` (89/89) all
  clean.
- HyperOut: `node --check game.js` - no syntax errors.

### Not done yet

- Neither confirmed in an actual browser (no browser tool in this
  environment) - dialog layout/readability and the actual navigate-to-`/`
  behavior against the real deployed portal should get a real check.

---

## 2026-08-04 — Diablo-3-style bottom HUD bar

### What was built

Replaced the top-left plain-text HUD (`Floor: 16` / `Lives: 3  Shield: 1` /
`Enemies: 0` / `Guardian: 0`) with a bottom-anchored bar, 5 fixed icon+value
slots (Floor, Lives, Shield, Enemies, Guardian) on a dark panel with thin
dividers between slots - closer to how Diablo 3 anchors its readouts along
the bottom edge instead of a corner text dump. Icons (heart, shield, skull,
crown, a descend-arrow for floor) are hand-drawn `Phaser.GameObjects.Graphics`
vector shapes, not image assets. Shield and Guardian slots hide entirely when
not applicable (no shield charges / no boss up) rather than reflowing the bar.

### Key decisions

- Icon+count, not one-heart-per-life: lives/shield charges can grow past a
  handful (extra-life pickups, no hard cap - see `HealthSystem.grantExtraLife`
  and `UpgradeSystem`'s uncapped `shieldCharges`), so repeating an icon per
  unit like classic Zelda hearts would overflow the bar at depth. A single
  icon plus a number scales to any value and is still far more scannable than
  the old `Lives: 3  Shield: 1` text run.
- Icons are drawn once in the constructor and never redrawn; only their
  `Text` values and the two conditional slots' `.setVisible()` change per
  frame in `update()` - same cheap pattern the old HUD already used for its
  text, just extended to the new Graphics icons instead of clearing and
  redrawing vector shapes 60 times a second.
- The skull icon's "eyes" are drawn as small circles filled with the panel's
  own background color/alpha (a fake cutout, not real transparency) - picked
  a near-solid panel alpha (0.92) specifically so that fake cutout reads
  cleanly instead of visibly mismatching whatever's rendered behind the bar.
- `HudState` (the public interface `GameScene` calls `hud.update()` with) is
  unchanged, so this was a pure `ui/HUD.ts` rewrite - no `GameScene.ts` edits.

### Verified

- `npx tsc --noEmit`, `npx eslint src`, `npm run test` (89/89) all clean.

### Not done yet

- Never seen in an actual browser (no browser tool in this environment) -
  slot spacing, icon legibility at a small canvas size, and whether the
  bottom bar overlaps the player/maze awkwardly at the bottom row of cells
  should get a real playtest.
- Icons are simple flat vector shapes, not art in the Warden's style: fine
  for a first pass, but a candidate for a later real-icon-sprite pass (same
  idea as HUD design option 3 that was proposed but not chosen here).

---

## 2026-08-04 — Pause menu + background music

### What was built

- **Escape-to-pause** during gameplay, matching HyperOut's pause behavior:
  `Escape` freezes the run (a new `'paused'` `RunState`, so the existing
  `update()` early-return already halts everything) and shows an overlay -
  Continue / Restart / Main Menu, navigable by mouse or Up/Down + Enter/Space,
  `Escape` again resumes. "Main Menu" stops the run's music and returns to
  `MenuScene`; "Restart" restarts the run from floor 1.
- **Music**: menu music (`godspeed_intro.mp3`) starts on the splash screen and
  keeps playing uninterrupted through the menu; stage music
  (`godspeed_maze1.mp3`) starts when a run begins, keeps playing across floor
  transitions (`scene.restart()` with new floor data), and only stops on
  death (game over). Pausing pauses the current track rather than stopping it.
- New `src/systems/MazeMusic.ts` (pure, tested) picks a track per floor by
  cycling through a configured file list - `docs`/user note: further stage
  tracks will land in `godspeed/music/maze/`; adding a new floor's music is
  just appending its filename to `MAZE_MUSIC_FILES`, no code changes needed
  beyond that.
- New `src/audio/MusicController.ts` (Phaser-touching, unlike `systems/`)
  wraps Phaser's sound manager: play-if-not-already-playing, pause, resume,
  stop - since Phaser's sound manager is game-global (not per-scene), these
  are what make "don't restart the track across scene transitions" work.

### Key decisions

- Music files live in `godspeed/music/` (sibling to `godspeed/game/`, e.g.
  `godspeed/music/menu/godspeed_intro.mp3`), not inside `src/assets/` -
  they're large (3-6MB each) content-only assets a designer should be able to
  drop in without touching source. Wired up via Vite's `publicDir` (set to
  `../music` in `vite.config.ts`) rather than an ES import, so they're copied
  as static files at build time; referenced at runtime via
  `import.meta.env.BASE_URL` since publicDir assets aren't hashed/rewritten
  by Vite. `Dockerfile`'s build stage now also `COPY godspeed/music/ /music/`
  (mirroring the repo's sibling-directory layout inside the container) so the
  same relative `publicDir: '../music'` path resolves in both places.
- Used `this.sound.add(key, {loop:true})` + `.play()`/`.pause()`/`.resume()`,
  not the `this.sound.play(key)` shorthand - that shorthand spawns a
  throwaway Sound instance that self-destroys on completion, which breaks
  `this.sound.get(key)` lookups from a different scene later (needed for
  "don't restart if already playing" across Splash → Menu → Game).
- Pause overlay built Phaser-native (add.rectangle + add.text, same pattern
  as the existing `showEndScreen`), not a DOM overlay like HyperOut's -
  Godspeed's `index.html` is a bare canvas host with no overlay markup, and
  every other menu/screen in this codebase is already drawn this way.

### Verified

- `npm run test` - 89/89 passing (4 new tests for `mazeTrackForFloor`/
  `mazeTrackKey` track-cycling logic).
- `npx tsc --noEmit` - clean.
- `npx eslint src` - clean.
- `npm run build` - confirmed `dist/menu/godspeed_intro.mp3` and
  `dist/maze/godspeed_maze1.mp3` are present in the build output (i.e.
  `publicDir` actually copies them, not just a config that looks right).

### Not done yet

- Never verified in an actual browser (no browser tool in this environment) -
  the pause overlay's layout/readability and the music actually
  playing/looping/ducking correctly on scene transitions should get a real
  playtest.
- No volume control / mute key (HyperOut has an `M` mute shortcut and volume
  sliders; Godspeed has neither yet).
- Only one stage track exists today (`godspeed_maze1.mp3`) so the
  per-floor cycling logic is unexercised beyond floor 1 in practice - once a
  second file lands in `godspeed/music/maze/` and gets added to
  `MAZE_MUSIC_FILES`, worth confirming the floor-boundary track switch
  sounds right (currently: hard stop-and-restart on the new track, no
  crossfade).

---

## 2026-08-04 — Deployment wiring: Docker/nginx (roadmap items 9-10, prep only)

### What was built

After confirming the balance fix worked, user said "continue" with no
further direction. Rather than re-asking after already getting an
explicit answer to "what's next" two entries ago, picked the next
unambiguous, unstarted roadmap work: items 9-10 (Docker image,
Kubernetes deployment) were the only ones with zero design/game-feel
judgment calls left in them - purely mechanical, and the repo already has
a working pattern to extend (HyperOut's static-file deploy).

- **Root `Dockerfile`** gained a `node:22-alpine` build stage
  (`npm ci && npm run build`) ahead of the existing `nginx:1.27-alpine`
  stage - godspeed is a Vite/TypeScript build, unlike HyperOut and the
  portal, which are plain static files copied straight in. The built
  `dist/` gets copied to `/usr/share/nginx/html/godspeed/` alongside the
  existing `web/` and `hyperout/` copies.
- **`godspeed/game/vite.config.ts`** gained `base: '/godspeed/'` for
  production builds only (dev server keeps `base: '/'`) - without this,
  every asset reference in the built `index.html`/JS would resolve against
  the site root instead of the `/godspeed/` subpath and the deployed page
  would load blank. Caught and fixed *before* it could ship broken -
  verified by actually running `npm run build` and reading the emitted
  `dist/index.html`: asset `src` correctly changed from `/assets/...` to
  `/godspeed/assets/...`. Confirmed the dev server was unaffected
  (`npm run dev` still serves `/src/main.ts` at root, as before).
- **`.dockerignore`** gained `**/node_modules` and `godspeed/game/dist` -
  without this, `COPY godspeed/game/ ./` in the new build stage would have
  pulled the *host's* locally-built `node_modules` (Windows binaries, wrong
  platform for the Linux container) and a stale local `dist/` straight
  into the image, either breaking `npm ci` or silently shipping stale
  assets. Caught by inspecting exactly what that `COPY` would actually
  pick up, not by trusting the pattern already worked for HyperOut (which
  has no `node_modules`/`dist` of its own, so this gap was invisible until
  a Node-based sub-project existed).
- **`nginx.conf`** gained a `/godspeed` → `/godspeed/` redirect, mirroring
  the existing `/hyperout` one - no other server-block changes needed, the
  existing generic `.js`/`.css`/`.png` caching rules already cover
  godspeed's build output by extension.
- **Root `README.md`** and **`DEPLOYMENT.md`** updated to mention
  Godspeed's path and its build-step difference from HyperOut.
  **`godspeed/docs/roadmap.md`** updated - deliberately *not* marked
  fully done, see below.
- Did **not** touch `web/index.html`'s "coming soon" cabinet placeholders
  or add a live Godspeed card to the portal - whether an early, mostly-
  unplaytested prototype should be publicly linked from the arcade site is
  a visibility call for the user to make, not something to do as a side
  effect of wiring up the build.
- Did **not** run `docker build`, `docker push`, or `kubectl apply`.
  Building an image is reversible and local, but no Docker is installed in
  this dev environment, so even the local build couldn't be exercised.
  Pushing to GHCR and applying to the live k3s cluster are exactly the
  "affects shared state, hard to reverse" actions that need the user's own
  hands on them, not something to run unprompted regardless of tooling
  availability.

### Key decisions

- Chose to fix the `base` path and `.dockerignore` gaps proactively rather
  than write the obvious/expected Dockerfile and call it done. Both are
  the specific kind of bug that only shows up *after* a real build/deploy
  cycle (a working `npm run dev` gives zero signal that the production
  `base` path is wrong; a Dockerfile that "looks right" gives zero signal
  that its build context has a bloat/platform-mismatch problem) - exactly
  the failure mode of assuming a locally-tested thing will also work once
  containerized and subpath-deployed.
- Left roadmap items 9-10 explicitly *not* checked off. The Dockerfile is
  written and traced by hand, and the one piece that could be verified
  locally (the actual `vite build` output) was verified - but "the config
  should work" and "this was built and confirmed to work" are different
  claims, and the changelog's own standing rule throughout this project
  has been not to conflate them.

### Verified

- `npm run lint` / `npm run test` (85/85) / `npm run build` — all pass,
  unaffected by the `vite.config.ts` change (only production `base`
  changed; dev mode identical).
- Manually inspected `dist/index.html` after building: script `src`
  correctly rewritten to `/godspeed/assets/...`.
- Confirmed `npm run dev` still serves correctly from `/` (unaffected by
  the prod-only `base` change).
- **Not verified**: the actual Docker build. No `docker` binary available
  in this environment (checked - not installed). The multi-stage
  Dockerfile, the `.dockerignore` fix, and the nginx redirect are all
  reasoned through by hand against the actual file layout, not exercised
  end-to-end. This is a meaningfully different (weaker) confidence level
  than every other "traced by hand" claim in this project, because unlike
  game logic, a container build has real external-tool behavior (Alpine's
  package resolution, `npm ci` in a clean environment, Docker's layer/COPY
  semantics) that hand-tracing can miss even when the reasoning is sound.

### Not done yet

- **Run `docker build` at least once** before trusting this - the single
  most important unverified thing in this entry, more so than any
  previous game-feel question, because a broken container build fails
  loudly and completely rather than just feeling off.
- Push to GHCR and `kubectl apply` - both require the user's explicit
  go-ahead and credentials, not something to do from here.
- Decide whether/when Godspeed gets a real portal card instead of staying
  reachable only by typing `/godspeed/` directly.
- Everything else still open from prior entries (real enemy art, Skirmisher
  flee tuning, cap-value feel, menu alignment, asset compression, roadmap
  items 11-12).

**2026-08-04 follow-up:** user installed Docker. Ran the actual build this
time - `docker build --platform linux/amd64 -t rheinarts:test .` - and it
succeeded cleanly end to end: `npm ci` in the `node:22-alpine` stage found
0 vulnerabilities and installed correctly (confirming the `.dockerignore`
fix actually worked - no host `node_modules` conflict), `npm run build`
produced the identical output already verified locally, and the final
`COPY --from=godspeed-build` into the nginx stage completed with no
errors. Didn't stop at "the build succeeded" - ran the resulting image
(`docker run -p 8099:80 ...`) and curled it directly: portal `/` → 200,
`/godspeed` → 301 redirect to `/godspeed/`, `/godspeed/` → serves the
real `index.html`, the hashed JS bundle and a bundled PNG under
`/godspeed/assets/` both → 200 (confirms the `base: '/godspeed/'` fix
resolves correctly in a real deployed container, not just in the local
`dist/index.html` text), `/hyperout/` → still 200 (regression check - the
new stage didn't break the existing game), `/healthz` → still 200. Stopped
and removed the test container afterward; left the `rheinarts:test` image
(136MB) in the local Docker cache in case retagging it directly to
`ghcr.io/g33kde/rheinarts:v1` is more convenient than rebuilding.

Roadmap item 9 (Docker image) is now genuinely done, not just "wired." Item
10 (Kubernetes) still isn't - the local build proves the image is correct,
it doesn't push anything to GHCR or touch the live cluster, which stays the
user's action per DEPLOYMENT.md.

---

## 2026-08-04 — Godspeed added to the portal cabinet view (BETA)

### What was built

User asked for Godspeed to appear in the arcade portal's cabinet grid with
a "beta" highlight, linking to the game the same way HyperOut's card does,
then asked how to deploy to Kubernetes.

- `web/index.html` - added a Godspeed `<a class="card live">` card between
  HyperOut's and the remaining "coming soon" placeholder (there were two;
  Godspeed's card took one of those two slots, matching root `ROADMAP.md`'s
  existing "replace the coming soon cabinets with real games as they land"
  item). Links to `/godspeed/index.html`, same pattern as HyperOut's card.
  Also updated the page's `<meta name="description">` and `og:description`
  to mention both games instead of just HyperOut.
- `web/img/godspeed.png` - copied from
  `godspeed/artwork/godspeed-start-screen.png` (the hero/splash art already
  used inside the game itself) as the cabinet thumbnail, same pattern as
  `hyperout.png`.
- `web/style.css` - added `.badge.beta`: orange (`var(--orange)`) instead
  of the existing `.badge`'s cyan, so PLAYABLE and BETA read as distinct
  statuses at a glance, not just distinguishable by reading the text.
- Verified through the **actual deployment pipeline**, not a standalone
  preview: rebuilt the real multi-stage Docker image (`docker build
  --platform linux/amd64 -t rheinarts:test .`), ran it, and curled the
  live nginx-served portal - confirmed the Godspeed card's markup, the
  `badge beta` class, the `/godspeed/index.html` link, the thumbnail image,
  and the new CSS rule are all actually being served, and that `/godspeed/`
  itself still resolves the real game. An earlier attempt at a quick
  standalone Node static-file server (to avoid needing Docker for a fast
  check) hit a Windows path-separator bug in the throwaway script itself
  and was abandoned in favor of the real pipeline instead of debugging
  disposable tooling.

### Key decisions

- Took one of the two remaining "coming soon" slots rather than adding a
  fourth grid card - the portal's grid was designed around a specific
  rhythm (1 live + N soon), and Godspeed replacing a placeholder reads as
  "the arcade is filling up," which is the actual intent of that section,
  rather than just appending an entry.
- Reused the game's own splash art as the cabinet thumbnail instead of
  commissioning/generating a separate marketing image - it's already the
  right aspect ratio for a hero shot, already on-theme, and avoids a
  second asset to keep in sync with the game's actual look.
- BETA status is honest, not just decorative - roadmap items 3-8 are all
  "done" in the sense of being built and unit-tested, but almost none of
  them have been played by a human yet (see the standing caveats
  throughout this file). An orange "beta" badge next to HyperOut's cyan
  "playable" is an accurate signal, not hedging.

### Verified

- Full rebuild of the Docker image with the portal changes included, run,
  and curled: portal `/` (200), Godspeed card present in the served HTML,
  `badge beta` class present, `href="/godspeed/index.html"` present,
  `img/godspeed.png` (200), the `.badge.beta` CSS rule present in the
  served `style.css`, and `/godspeed/` itself still resolves (200).
- **Not verified**: actual visual appearance (card layout, badge
  positioning/contrast, thumbnail crop) in a real browser - same standing
  limitation as every visual change in this project. The HTML/CSS
  structure and server-side wiring are confirmed correct; whether it
  *looks* right is not.

### Not done yet

- Look at the actual rendered portal in a browser.
- Push the rebuilt image to GHCR and apply to the cluster if the user
  wants the portal change live - see the deployment walkthrough given in
  this same conversation turn.
- The rest of root `ROADMAP.md`'s "Grow the arcade" item (About blurb,
  DE/EN toggle) and its one remaining "coming soon" slot.

---

## 2026-08-04 — Balance fix: capped Speed/Rapid Fire, curbed Extra Life

### What was built

User played the new multi-floor build and reported the Warden getting
faster every floor, and effectively firing more (higher rate of fire)
every floor, both unwanted. Root cause, traced back to the previous
entry's own design rather than a new bug: `FloorPickups`-equivalent logic
at the time spawned one guaranteed pickup of every type every floor, and
Speed/Rapid Fire are multiplicative and persist across floors within a
run - so a normal player who just explores picks up both every floor,
compounding forever with zero choice involved. By floor 5 that's ~3.3x
move speed (`1.35^4`) and ~7.7x fire rate (`1/0.6^4`). Laid out all 4
current powerups with their mechanics before touching anything, then
asked the user to decide the fix direction rather than picking one
unilaterally, since "cap the numbers" vs. "make pickups random" vs.
"reset every floor instead of every run" are genuinely different game-feel
bets, not a correctness question with one right answer.

- **Speed and Rapid Fire are now capped.** `UPGRADE_EFFECTS.speedMultiplierCap`
  (2x) and `fireCooldownMultiplierFloor` (~3.3x fire rate) in
  `GameConfig.ts`; `UpgradeSystem.applyUpgrade` clamps with `Math.min`/
  `Math.max` instead of multiplying unboundedly. Per-pickup growth is
  unchanged - pickups past the cap are harmless no-ops, not wasted.
- **Pickups stayed guaranteed** (user's choice, not randomized) - now that
  stacking has a ceiling, "reliable" isn't the same problem "unbounded"
  was.
- **Extra Life curbed to odd floors** (user's choice, over leaving it
  alone) via new `src/systems/FloorPickups.ts`'s `pickupTypesForFloor(floor)`.
  Its slot on even floors becomes a second Shield charge rather than
  disappearing, so every floor still has exactly 4 pickups. `GameScene`'s
  `create()` now calls this instead of using a fixed `PICKUP_TYPES`
  constant.
- **Shield was left alone** (user's choice) - it doesn't compound the way
  a multiplier does (a charge is *consumed*, not multiplied), so stacking
  charges doesn't distort movement/combat feel the way runaway speed or
  fire rate did.
- New tests: cap/floor behavior in `upgradeSystem.test.ts` (20 pickups in
  a row still lands exactly on the cap, not past it), full
  `floorPickups.test.ts` (odd floors have Extra Life, even floors have two
  Shields instead, always exactly 4 pickups including Speed and Rapid
  Fire). Suite is now 85 tests, all passing.

### Key decisions

- Presented the full powerup list and the three-question fix-direction
  choice to the user instead of silently picking "cap the numbers" myself.
  The previous entry's own changelog had already flagged the compounding
  math as something nobody had watched happen in a browser yet - once it
  did happen and got reported, the right move was surfacing the actual
  tradeoffs (cap vs. diminishing returns vs. reset-per-floor; guaranteed
  vs. random pickups; curb Extra Life or not) rather than guessing which
  one the user would have wanted.
- Capped via clamping the *result* of each pickup (`Math.min`/`Math.max`
  after multiplying) rather than, say, precomputing "how many pickups
  until cap" and rejecting pickups past that count. The clamp approach is
  simpler, and means a future balance change (different cap value, or a
  pickup that temporarily lifts the cap) only ever touches the one
  clamped line, not a separate counting mechanism.

### Verified

- `npm run lint` — clean.
- `npm run test` — 85/85 passing.
- `npm run build` — succeeds.
- `npm run dev` — serves and returns 200.
- **Not verified**: whether the chosen cap values (2x speed, ~3.3x fire
  rate) themselves feel right - "capped" fixes the specific "keeps getting
  faster forever" complaint, but 2x could still feel too twitchy or too
  tame at floor 4+, and there's no way to know without playing several
  floors deep again. Same for whether losing Extra Life every other floor
  feels like a fair trade for an extra Shield charge, or just feels like a
  downgrade. Both are exactly the kind of thing this session cannot judge
  without a browser.

### Not done yet

- Confirm the new cap values and the Extra-Life-for-Shield trade actually
  feel right once played, not just "no longer literally unbounded."
- Everything still open from the previous entry (real art for the 4 new
  enemy types, floor-depth/shield UI beyond the HUD, roadmap items 9-12).

---

## 2026-08-04 — Multi-floor progression, full 5-enemy roster, Shield upgrade

### What was built

User picked "keep building gameplay" from a menu of next-step options
(more art / deployment / clean up debt / more gameplay) after confirming
the Warden sprite integration worked. This is the biggest single-entry
change so far - three linked pieces:

- **Multi-floor descent.** Defeating the boss now shows "FLOOR N CLEARED"
  and, on continue, calls `this.scene.restart({ floor: floor + 1, lives,
  upgrades })` - Phaser's `Scene.restart(data)` accepts an arbitrary
  payload that the next `create(data)` call receives, which is what makes
  carrying lives/upgrades across floors possible without any external
  state manager. Game over still calls `scene.restart()` with no payload,
  which resets to floor 1. Biome selection was switched from keying off
  `progression.mazesCleared` (lifetime win count) to `floor` (in-run
  depth) - `selectBiome(floor - 1, BIOMES)` - since "which environment am I
  in" is much more naturally a function of how deep into a run you are
  than how many runs you've ever finished.
- **All 5 enemy types, not 1.** `Sentinel` (dormant until the player is
  within `SENTINEL.triggerDistance`, then chases), `Seeker` (smaller,
  ~1.5x speed, otherwise a plain stat variant - no subclass needed),
  `Bulwark` (`extends Enemy`, 2 hit points via the same `applyHit`/
  `isGameOver` reuse pattern `Boss` already established, no ranged attack),
  and `Skirmisher` (`extends Enemy`, backs away when the player is within
  `SKIRMISHER.fleeDistance` via a new `nextStepAway` in `ChaseBehavior.ts`
  - the mirror of the existing `nextStepToward`, picks the neighbor that's
  *farther* instead of closer). `src/systems/FloorRoster.ts`'s
  `enemyRosterForFloor(floor)` decides which 3 of the 5 types spawn
  together, introducing one new type per floor through floor 4, then
  holding steady. `src/entities/EnemyFactory.ts` maps a roster entry to
  the right constructor call.
- **Difficulty scaling.** `src/systems/FloorDifficulty.ts`'s
  `difficultyForFloor(floor)` — small linear bumps to enemy speed and boss
  hit points/attack cooldown, layered on top of whatever the roster itself
  already does. `Boss`'s `maxHits`/`attackCooldownMs` became constructor
  parameters (defaulting to the existing constants) specifically so this
  could scale them without the Boss class needing to know floors exist.
- **Shield upgrade.** A 4th `UpgradeType`. Grants a charge
  (`UPGRADE_EFFECTS.shieldChargesGranted`, stacks) that blocks the next hit
  entirely - no life lost, no teleport-to-spawn, no hurt animation -
  consumed in `resolvePlayerContact` before life loss is even considered.
  `PICKUP.count` went from 3 to 4 to fit it (one of each type per maze,
  same as before).
- HUD gained a floor-number line and, conditionally, a shield-charge
  count (only shown once you have at least one charge, to avoid a
  permanent "Shield: 0" line cluttering the display).
- New tests: `floorDifficulty.test.ts`, `floorRoster.test.ts`, `nextStepAway`
  cases added to `pathfinding.test.ts`, shield cases added to
  `upgradeSystem.test.ts`. Suite is now 80 tests, all passing.

### Key decisions

- Went with exactly 3 stat/behavior *variants* on the existing chase
  system (Sentinel's trigger, Seeker's stats, Bulwark's hit points,
  Skirmisher's flee) rather than inventing new movement/targeting
  infrastructure per type. Every one of them still moves through the same
  `Enemy.update()`/pathfinding loop; the only new piece of actual
  targeting logic across all four is `nextStepAway`, which is a
  three-line mirror of code that already existed. This was a deliberate
  ceiling on scope - "5 enemy types" could easily have meant 5 bespoke AI
  systems, which wasn't achievable as one coherent, testable increment.
- Floor-to-floor difficulty is the roster composition *first*,
  `FloorDifficulty`'s stat multipliers *second*. Chose not to lean harder
  on stat scaling alone (e.g. "same 3 Drones but progressively faster
  forever") because introducing new *behavior* reads as the run getting
  more interesting, not just more of a damage-sponge grind - matches
  "smarter enemy AI" over "bigger numbers" in `docs/game_ideas.md`'s own
  stated direction.
- `mazesCleared` (the permanent-unlock counter) stays a lifetime count,
  not reset by starting a new run, while the new `floor` field resets to 1
  every game over. These are deliberately two different numbers measuring
  two different things ("how many floors have I ever cleared" vs "how deep
  is my current run") - documented explicitly in `docs/progression.md`
  since conflating them would have been an easy, quiet bug.
- Skirmisher's flee/chase switch is a hard distance threshold, not
  hysteresis (a wider "keep fleeing until X" than "start fleeing at Y").
  Flagged in `docs/enemy_design.md` as a known rough edge - a player
  hovering right at the threshold could see it flicker direction every
  repath tick. Didn't add hysteresis speculatively for a feel problem that
  hasn't been confirmed to exist without playtesting it first.

### Verified

- `npm run lint` — clean.
- `npm run test` — 80/80 passing.
- `npm run build` — succeeds.
- `npm run dev` — serves and returns 200.
- Traced the full state-machine by hand rather than only trusting green
  tests, since `scene.restart(data)` plumbing is exactly the kind of thing
  that type-checks fine while being logically wrong (e.g. double-applying
  the permanent life bonus on every floor instead of once per run):
  confirmed fresh-run vs continuing-run branches in `create()` apply
  `bonusStartingLives` exactly once per run, confirmed `mazesCleared`
  isn't reset by a fresh run while `floor` is, confirmed a dormant
  Sentinel can still be shot and still deals contact damage if walked
  into (intentional - "dormant" means "doesn't chase," not "harmless").
- **Not verified**: any of this in an actual browser. This is the largest
  single change yet to core loop state, and none of it has been played -
  does floor 2's Sentinel ambush read as intended, does Skirmisher's
  flee look controlled or erratic, does the difficulty curve feel fair
  floor-to-floor, does Shield's "no animation, no flinch" absorb read as
  satisfying or confusing. All open questions a browser session would
  answer immediately and code review cannot.

### Not done yet

- Confirm the whole floor-progression loop in a browser - this is now the
  single most load-bearing unverified thing in the project, given how much
  new state-machine logic this entry adds.
- Retune Skirmisher's flee threshold if the no-hysteresis flicker turns
  out to be a real problem once seen.
- Real art for any of the 4 new enemy types (still red circles with
  different sizes/rings) - see `docs/art_direction.md`.
- Any UI beyond the HUD for floor depth, shield charges, or which enemy
  types are new this floor.
- Roadmap items 9-12 (Docker, Kubernetes, Electron, co-op) untouched.

---

## 2026-08-03 — Real player sprite: the Warden (idle/walk/shoot/hurt/die)

### What was built

- User supplied `godspeed/artwork/warden-sprite-sheet.png`, an AI-generated
  (AutoSprite; also added to the AI's own persistent memory as a reference
  for generating future sprites) sheet with IDLE/WALK/ATTACK/SHOOT/HURT/
  DIE/JUMP/FALL/LAND rows, and asked to use only idle/walk/shoot/hurt/die.
  Confirmed with the user this is the **player character**, not an enemy.
- Frame extraction was done by measurement, not by eyeballing the preview:
  the sheet's background is a flat, alpha-free ~(21,21,21), so a script
  (PowerShell + `System.Drawing`, `LockBits` for speed) scanned for
  background-only gaps between poses to find each frame's exact pixel
  rect. Every row was then spot-checked by cropping individual frames back
  out and viewing them - this caught a real bug: one SHOOT frame came back
  as a single 196px-wide blob because a bright muzzle-flash effect
  visually bridged two separate poses with no background gap between
  them. Found the true split point by re-scanning just the lower-body
  region (legs, below the flash) for the real gap, then verified the fix
  by cropping and viewing both halves. Final counts: idle 7, walk 8, shoot
  7 (was 6 before the split), hurt 4, die 8 - 34 frames total.
- `src/config/WardenFrames.ts` — the verified `{x,y,width,height}` rects,
  with a header comment explaining the measurement approach and the one
  manual correction, so the next person touching this trusts the numbers
  for the right reason.
- `src/entities/WardenAnimations.ts` — `ensureWardenAnimations(scene)`
  registers each frame as a named sub-region on the single loaded sheet
  texture (`Texture.add(name, 0, x, y, w, h)` - Phaser's mechanism for
  irregular, non-grid frame layouts, since these frames are not uniform
  size/spacing) and builds the five `scene.anims.create(...)` animations.
  Guarded by `scene.anims.exists(...)` - idempotent, since Phaser's
  Animation Manager lives on the Game instance and survives
  `scene.restart()`, so this only does real work once per session even
  though a new `Player` is constructed on every restart.
- `Player.ts` rewritten: `sprite` is now a `Phaser.GameObjects.Sprite`
  (was a plain `Arc` circle) playing `warden-idle`/`warden-walk`
  automatically based on movement direction (with horizontal flip for
  left/right facing), plus `playShoot()`/`playHurt()`/`playDie()` for the
  three event-driven one-shot animations. A small in-progress check
  (`isTransientInProgress`) stops the per-frame idle/walk logic from
  cutting off a shoot/hurt/die animation before it finishes.
- `GameScene` calls `player.playShoot()` on every fired shot,
  `player.playHurt()` on a non-fatal hit, and `player.playDie()`
  specifically on the hit that empties the last life (before
  `enterGameOver()`).
- New config: `WARDEN_SPRITE.scale = 0.34` (idle's 104x130px reference
  frame → ~35x44px on screen - bigger than `PLAYER.radius`'s 28px hitbox,
  which is normal for a top-down sprite whose hood/cloak/weapon extend
  past the actual collision circle).
- New tests: `tests/wardenFrames.test.ts` - correct frame count per
  animation, every rect fits within the 1254x1254 sheet with positive
  width/height, and no two frames in the same row overlap in x (a cheap
  regression guard against a future edit reintroducing a merged-frame
  bug like the one just fixed by hand). Suite is now 67 tests, all
  passing.
- New memories saved (persistent across sessions, not just this repo):
  AutoSprite + other AI sprite-sheet tools as a reference, and a feedback
  note - "never eyeball pixel coordinates from a preview, measure and
  crop-verify" - written directly off the earlier menu-alignment miss
  plus the SHOOT-frame merge caught here.

### Key decisions

- Loaded the whole sheet as one texture and carved out named sub-frames
  in code, instead of exporting a tight, uniform spritesheet/atlas from
  an image editor first. The frames are irregular (different widths per
  pose, extra space for effects like the muzzle flash), so a uniform-grid
  `load.spritesheet()` wouldn't fit them anyway; Phaser's manual
  `Texture.add()` handles arbitrary rects directly from the original
  1254x1254 file with no preprocessing step.
- Origin/anchor stays Phaser's default center (0.5, 0.5), matching how
  every other entity (enemies, boss, pickups) is centered on its
  collision point - not switched to a feet-anchored origin (common for
  character sprites) to keep the Warden consistent with the rest of the
  game's visual convention rather than introducing a one-off exception.
  Worth revisiting if it reads as "floating" once seen.
- `WARDEN_SPRITE.scale` is one number applied uniformly across all five
  animations' frames, on the assumption the character is drawn at a
  consistent true pixel size across rows and the differing frame/row
  heights (130 down to 89px) just reflect how much a given pose's silhouette
  needs, not an actual size change. Unverified - if walk looks visibly
  bigger/smaller than idle once seen, this assumption is wrong and needs
  per-animation scale correction instead of one global number.
- Did not wire the unused ATTACK/JUMP/FALL/LAND rows at all (not even
  extracted into `WardenFrames.ts`) - the user was explicit about which
  five to use, and this is a top-down shooter with no melee or jumping,
  so there's no gameplay event that would trigger them regardless.

### Verified

- `npm run lint` — clean.
- `npm run test` — 67/67 passing.
- `npm run build` — succeeds; sprite sheet (~1.5MB) bundles alongside the
  two existing PNGs (~4.5MB) and the JS bundle - asset weight keeps
  growing and is still unoptimized, same flag as the splash/menu entry.
- `npm run dev` — serves; both the app shell and the raw sprite-sheet
  path return 200.
- **Not verified**: the actual animation in a browser - does idle loop
  smoothly, does walk sync sensibly with movement speed, does the flip
  look right when reversing direction, does shoot/hurt/die actually
  trigger and look right at real gameplay speed, is 0.34 the right scale.
  Frame *coordinates* were rigorously verified (measured, cropped, and
  visually checked one by one, see above) - but coordinate correctness and
  "does the animation feel good in motion" are different questions, and
  only the first one could be checked in this session. No browser tool
  available here, same standing limitation as every visual entry so far.

### Not done yet

- Confirm the animation actually plays correctly and looks right in a
  browser - this is the most load-bearing unverified item yet, since
  frame-extraction bugs specifically (wrong crop, wrong order, wrong
  scale) would be very visible and are exactly the class of thing that
  can't be caught without watching it run.
- Real sprites for anything else (enemies, boss, projectiles, pickups,
  walls) - still all primitive shapes.
- Asset size/compression, still unaddressed across all three image assets.
- Roadmap items 8-12 (polish, Docker, Kubernetes, Electron, co-op) remain
  open and are unrelated to this entry.

**2026-08-03 follow-up:** user ran the build and reported a visible dark
box around the Warden - the source sheet has **no alpha channel** (flat
opaque ~(21,21,21) background, confirmed earlier while measuring frame
rects), so every rectangular frame crop necessarily included some of that
solid background fill around the character's irregular silhouette. Fixed
by reprocessing `game/src/assets/warden-sprite-sheet.png` in place (the
original `godspeed/artwork/warden-sprite-sheet.png` master is untouched):
every pixel's color distance from the background is measured, and alpha
is 0 below a distance of 5, 255 above 18, and linearly ramped in between,
producing soft anti-aliased edges instead of a hard cutout. Checked first
that this wouldn't eat into the character's own dark cloak/shadow
details - sampled pixel colors showed the character's true-black shadow
areas (near (0,0,0)) sit well outside the outer threshold, distinctly
darker than the (21,21,21) background, so there was a safe margin. Verified
by cropping frames from the reprocessed file and viewing them directly
(idle, a wide shoot-flash frame, and the fine-detail die dust-burst frame),
with no box, no halo, and shadow detail intact. `npm run test` (67/67) and
`npm run build` both still pass; no code changed, only the bundled PNG.
Still unverified in an actual browser render, same standing limitation.

**2026-08-03 second follow-up:** two more pieces of feedback after
actually running it.

1. User reported "some movements have pixels still showing," with a
   screenshot showing two solid red circles flanking the character.
   Rebuilt contact sheets of all 34 frames (all animations, side by side
   on a checkerboard so any leftover opaque background would be obvious)
   and reviewed every one - all clean, no boxes, no halos, anywhere. The
   two red circles are almost certainly `Enemy` game objects (still plain
   `COLORS.danger` red circles - no real enemy art exists yet) that
   happened to be near the player when the screenshot was taken, not a
   Warden sprite artifact. Flagged this back to the user rather than
   assuming and chasing a non-existent sprite bug; the thorough frame
   check was worth doing regardless, since it was already an open item
   from the previous entry ("confirm the animation actually plays
   correctly" was explicitly the most load-bearing unverified thing).
2. User reported left/right movement facing the wrong way (up/down were
   fine, and asked to double check the shoot direction specifically).
   `Player.ts`'s flip logic was `setFlipX(direction.x < 0)`. Re-derived
   from the shoot contact sheet (gun/muzzle-flash clearly point right in
   every unflipped frame) that this should have been correct - couldn't
   find a logical bug via code review (`InputSystem`'s left/right-to-`x`
   mapping is standard and correct, and there's only one `setFlipX` call
   in the codebase, confirmed via grep, so nothing else could be
   conflicting with it). Fixed by trusting the user's direct observation
   of the actual live render over the static re-derivation and inverting
   the condition to `direction.x > 0`. Since `setFlipX` is a GameObject
   property independent of which animation/frame is currently playing,
   this single fix also covers the shoot-direction concern - the shoot
   animation renders with whatever flip state was already set by
   movement, so bullet travel direction (driven separately by
   `InputSystem.aimDirection`, unaffected by this bug) and the visual gun
   direction should now agree. `npm run lint`/`test` (67/67)/`build` all
   still pass. Left genuinely unresolved *why* the original condition was
   backwards despite the code read looking correct - noted here so a
   future look at this doesn't assume it's settled science, just that the
   visible symptom is fixed.

**2026-08-03 third follow-up:** user reported stray pixels were *still*
visible after the second follow-up's fix, with a screenshot showing a
small fleck near the character. Root cause: the first background-removal
pass (the very first fix in this entry) used a single global color-
distance threshold from one reference background sample. The AI-generated
background isn't perfectly flat - it has enough grain/noise that occasional
pixels sit far enough from the reference color to stay opaque, showing up
as tiny stray specks. Rebuilt the removal as a per-frame **connected-
component** pass instead: for each of the 34 frames, flood-fill-label
every "candidate foreground" pixel (loose threshold) into blobs, then keep
only blobs at or above ~15px and discard the rest as noise - regardless
of that pixel's individual color, going by connectivity and size instead
of a single global reference. First attempt at this used "keep only the
single largest blob per frame," which was wrong: the die animation's
dust-burst frames and several shoot frames' muzzle-flash sparks are
*intentionally* made of many separate small blobs (scattered particles,
not one connected shape) - checked this by printing every component's
pixel-count histogram per frame before deciding on a threshold rather
than assuming, and the histograms showed a clean split (true noise: 1-11px,
real secondary effects: 15-157px) that a size cutoff handles correctly
without needing the largest-only shortcut. Rebuilt contact sheets for all
five animations again and reviewed every one; also built and published an
interactive gallery (all 34 frames playing at real in-game frame rate,
click to pause, source frames and pixel data shown alongside) so the user
could review the fix directly rather than take another round of static
screenshots on faith - <https://claude.ai/code/artifact/45184c12-2722-42db-9bf0-90b0d01bf57d>.
`npm run test` (67/67) and `npm run build` both still pass; only the
bundled PNG changed (and shrank, 1.9MB → 796KB, since most of the
canvas outside the 34 registered frames is now genuinely empty instead of
opaque background fill).

**2026-08-03 fourth follow-up:** user pointed at the exact bundled file
and a specific visible mark - a small white checkmark-shaped fleck,
clearly not part of the character (wrong shape, wrong color: white/grey
against a cast of gold/blue/black). This one wasn't random noise - it was
a real leftover in the source art itself, present at the exact top-left
corner of both `shoot`'s and `hurt`'s *first* frame specifically (and, per
a look at the other 32 frames, nowhere else). It survived the previous
connected-component pass because it's ~50-157px, comfortably above the
15px noise cutoff, so it read as "real content" by size alone, same as a
muzzle-flash spark would.

Rather than guess again, built a diagnostic pass that lists every kept
secondary component (position, size) across all 34 frames, then visually
inspected each one at 4-5x zoom before deciding what to do with it. This
caught the false positive from the *previous* attempt at a general fix: a
first instinct was "exclude anything touching a frame's top edge," which
would have looked reasonable from the shoot/hurt data alone - but the same
check against `die`'s dust-burst frames found a legitimate sparkle motif
sitting at the same y=0 top edge (confirmed by looking directly at it:
a clean scattered blue-particle burst, not an artifact). A general rule
would have quietly deleted real art in a frame nobody was even complaining
about. Fixed narrowly instead - the cleaning script now zeroes a small
fixed corner region (~28x12px) for `shoot_0` and `hurt_0` only, regardless
of what the connected-component analysis says about that region. `npm run
test` (67/67) and `npm run build` still pass. Republished the gallery
artifact from the earlier follow-up with the corrected sheet, same URL:
<https://claude.ai/code/artifact/45184c12-2722-42db-9bf0-90b0d01bf57d>.

Three passes in to background cleanup and still finding new things by
actually looking - the pattern holding up across all of them: verify by
cropping/zooming and viewing the specific pixels, never by assuming a fix
generalizes just because it worked for the case that was reported.

---

## 2026-08-03 — Thin walls + boss entrance VFX (playtest feedback, not a roadmap item)

### What was built

- User played the build (Node now works locally) and gave three pieces of
  feedback. Two were direct code changes; the third ("what's the process
  for adding real graphics?") was a question, answered in this session's
  conversation rather than in code - see the reasoning notes below for the
  gist, since it matters for anyone picking this up next.
- **Wall thickness**: `tileSegmentSize(row, col, tileSize, wallThickness)`
  added to `MazeGenerator.ts` - classifies a blocked tile by parity (even/
  even = corner post, even row/odd col = horizontal bar, odd row/even col =
  vertical bar) and returns thin dimensions instead of a full `tileSize`
  square. `MazeView` now centers a thin rect on each wall tile instead of
  filling it. New config: `MAZE.wallThickness = 10` (vs. `tileSize = 40`).
  Applies to both rendering and collision simultaneously, since `MazeView`
  builds both from the same rect - no risk of the visual and the hitbox
  drifting apart.
- **Boss entrance VFX**: `GameScene.playBossEntranceEffect()` - a white/
  gold/white camera flash flicker (three chained `camera.flash()` calls,
  ~150ms apart) plus a short `camera.shake()`, called from `spawnBoss()`
  right before the existing "THE GUARDIAN AWAKENS" banner. Built entirely
  from Phaser's built-in camera FX; no new assets.
- New test: `tileSegmentSize` cases for all three tile roles (corner,
  horizontal bar, vertical bar). Suite is now 64 tests, all passing.

### Key decisions

- Kept the wall *grid pitch* (`tileSize = 40`, i.e. distance between cell
  centers) unchanged and only shrank the rendered/collided thickness -
  cell-center movement targets, pathfinding, and spawn-point math in
  `MazeView` all key off `tileSize`, so touching it would have reshuffled
  maze proportions/enemy counts/pickup placement along with the wall look.
  The user's complaint was specifically about thickness, not maze scale.
- Did not retune `MAZE.braidChance` (0.6, set in the maze-braiding entry)
  even though thinner walls will likely already read as noticeably more
  open on their own - two visual changes at once would make it hard to
  tell which one to blame if the result still looks off. Left as a
  specific thing to re-examine once thin walls are actually seen in a
  browser.
- Chose camera-FX-only for the boss entrance (no particle system, no new
  sprite/animation) - Phaser's `flash`/`shake` needed zero new assets and
  directly matches "lightning / screen blinking" as asked. A particle-
  based lightning bolt would look better but is real asset/effect work,
  not a small addition; flagged as a possible upgrade later, not attempted
  now.
- The "how do I add real graphics" question is answered in conversation,
  not written into a doc, because it's general guidance rather than a
  decision about this project's assets specifically - the short version:
  every entity (`Player`, `Enemy`, `Boss`, `Projectile`, `Pickup`,
  `MazeView`'s wall tiles) currently draws a Phaser primitive shape
  (`scene.add.circle`/`scene.add.rectangle`); collision/movement math is
  entirely independent of what's drawn (works off `radius`/`Rect` values,
  not the shape), so swapping in real sprite images later is a rendering-
  only change, isolated to each entity's constructor. No image-generation
  tool exists in this environment, so any real art has to be supplied by
  the user (dropped into `src/assets/`, following the same pattern already
  used for the splash/menu PNGs) rather than generated here.

### Verified

- `npm run lint` — clean.
- `npm run test` — 64/64 passing.
- `npm run build` — succeeds.
- `npm run dev` — serves and returns 200.
- **Not verified**: whether 10px actually reads as "thin" at real gameplay
  scale, or whether it's now so thin walls are hard to see/read as
  obstacles at all - `wallThickness` is a single constant, easy to retune
  either direction once viewed. The boss flash/shake timing (three flashes
  ~150ms apart, 500ms shake) is also an unverified guess at "feels like
  lightning" vs. "feels like a bug/lag spike." Same standing limitation as
  every visual change so far - no browser tool in this session.

### Not done yet

- Confirm wall thickness and re-examine `braidChance` together once seen.
- Confirm the boss VFX timing/intensity reads as intended.
- Actual sprite/tile art for any entity (still all primitive shapes).
- Roadmap items 8-12 (polish, Docker, Kubernetes, Electron, co-op) remain
  open and are unrelated to this entry.

---

## 2026-08-03 — Three biomes: environment palette cycling (roadmap item 7)

### What was built

- `GameConfig.ts` adds a `BiomeTheme` interface (`name`, `background`,
  `wall`) and `BIOMES`, three entries: Obsidian Depths (the existing
  default look), Sapphire Vault, Violet Sanctum - all mixed from the
  palette already documented in `docs/art_direction.md`
  (obsidian/gold/sapphire/violet), not new colors invented for this.
- `src/systems/BiomeSelection.ts`: `biomeIndexForClearCount(mazesCleared,
  biomeCount)` (a plain modulo, pulled out on its own for testability) and
  `selectBiome(mazesCleared, biomes)`. Cycles by `ProgressionStorage`'s
  existing `mazesCleared` counter - reused rather than adding a new
  counter, since it already tracks exactly "how many times has this player
  finished a maze this session."
- `MazeView` generalized (same pattern as `Enemy`/`Projectile` earlier)
  to take an optional `wallColor` param, defaulting to `COLORS.wall` so
  nothing breaks if a caller doesn't pass one.
- `GameScene.create()` now loads progression *before* building the maze
  (previously it loaded progression after), computes
  `selectBiome(progression.mazesCleared, BIOMES)`, sets the camera
  background and maze wall color from it, and shows a 1.8s banner with the
  biome's name - reusing the same transient-text pattern as the boss's
  "THE GUARDIAN AWAKENS" intro and the menu's "Coming soon" toast.
- Player, enemy, projectile, and pickup colors are untouched by biome -
  deliberately out of scope, see decisions below.
- New tests: `tests/biomeSelection.test.ts` (index starts at 0, cycles
  correctly past the biome count, `selectBiome` returns the right entry
  including the wraparound case). Suite is now 61 tests, all passing.

### Key decisions

- Biomes are **palette-only** in this pass - background and wall color
  cycle, nothing about maze size, braid chance, enemy count, or music
  changes per biome. `docs/gameplay.md` and `docs/level_design.md` have no
  multi-floor/descent system to actually hang biome-specific *gameplay*
  off of yet (winning still just restarts into a new maze, flat). Building
  gameplay-varying biomes before that system exists would mean guessing at
  a structure (per-floor? per-biome-visit?) that doesn't have a home yet.
  Palette variation is the smallest real slice of "three biomes" that's
  buildable today without that guess.
- Cycling by `mazesCleared` (already-tracked, persists via `localStorage`
  same as the permanent-lives-bonus unlock) rather than randomizing biome
  per run - a deterministic cycle means the *n*-th clear always looks the
  same, which reads more like "descending through three distinct realms in
  order" than a random palette swap would, and costs nothing extra to
  implement over random selection.
- Explicitly kept player/enemy/projectile/pickup colors constant across
  biomes. `docs/enemy_design.md` established the boss's gold-ring accent
  as the way a player learns "this is dangerous/different"; letting biome
  reskin those colors too would make that visual language inconsistent
  from encounter to encounter. Environment can vary; gameplay-coded colors
  don't.

### Verified

- `npm run lint` — clean.
- `npm run test` — 61/61 passing.
- `npm run build` — succeeds.
- `npm run dev` — serves and returns 200.
- **Not verified**: whether the three palettes are actually legible/
  distinct against the existing entity colors (e.g. does the player's
  cyan still read clearly against the Sapphire Vault's blue-toned
  background and walls, or does it start to blend in?), and whether the
  biome-name banner text is readably positioned against all three
  backgrounds. Same standing limitation as every visual entry so far - no
  browser tool in this session. The Sapphire biome in particular is worth
  a specific look, since it's the one biome whose wall/background hue is
  closest to the player's own accent color.

### Not done yet (see `docs/roadmap.md`)

- Any actual gameplay variation per biome (this is explicitly deferred,
  see decisions above).
- General polish (item 8).
- Docker/Kubernetes wiring for this game, Electron port, local co-op
  (items 9-12).

---

## 2026-08-03 — Braided maze: loops and open rooms instead of a single path (not a roadmap item; direct correction against reference art)

### What was built

- User supplied a screenshot of the original arcade maze and pointed out
  that the current generator produces a single-path labyrinth, while the
  reference is open and loop-heavy - multiple routes, short obstacle walls
  rather than continuous corridors, no dead-end-everywhere feel. This
  matches the exact concern already flagged (but left unresolved) in
  `docs/level_design.md`'s previous entry.
- `braidMaze(maze, extraConnectionChance, rng)` added to
  `MazeGenerator.ts`: takes an already-generated perfect maze and, for each
  internal wall, independently knocks it down with probability
  `extraConnectionChance`. Pure and immutable (returns a new `Maze`,
  deep-copies cells first) - doesn't touch the input.
- `MazeView` now calls `braidMaze(generateMaze(...), MAZE.braidChance,
  rng)` instead of using the raw perfect-maze output. New config:
  `MAZE.braidChance = 0.6`.
- No changes needed anywhere else - `computeDistanceField`/`nextStepToward`
  (pathfinding) and `openNeighbors` operate on the same `Maze`/`MazeCell`
  shape regardless of whether it's a tree or has loops, so enemy/boss
  chase behavior works unmodified against the new, loopier layout.
- New tests in `tests/mazeGenerator.test.ts`: `extraConnectionChance = 0`
  leaves the maze byte-for-byte unchanged and doesn't mutate the input;
  `extraConnectionChance = 1` opens every internal wall (every cell's
  non-border-facing sides all become open); a mid-range chance (0.6) still
  produces a fully connected maze (braiding only adds edges, so this holds
  for any input maze and any chance value - not just this one case, but
  it's the one actually exercised). Suite is now 58 tests, all passing.

### Key decisions

- Picked `braidChance = 0.6` (60% of extra walls removed) as a first
  guess at matching the reference screenshot's openness, not a measured
  fit - there was no way to render this build and compare side-by-side
  against the image in this session. It's a single named constant
  specifically so it's a one-line change to retune once someone actually
  looks at both side by side.
- Applied braiding uniformly across the whole maze rather than varying
  openness by region (e.g. tighter corridors near spawn, more open rooms
  toward the edges, matching how the reference art seems to have distinct
  denser and more open areas). Uniform openness was the smallest change
  that fixes the specific complaint (single-path-only); regional variation
  is a reasonable next refinement, not something to build speculatively
  before anyone's confirmed the basic openness level is even right.
- Did not change `MAZE.cols`/`MAZE.rows`/`tileSize` (maze size or grid
  resolution) - the complaint was specifically about path topology (one
  route vs. many), not about the maze being too big, too small, or too
  fine-grained. Changing size now would confound whether a future look at
  the build is judging the openness fix or an unrelated size change.

### Verified

- `npm run lint` — clean.
- `npm run test` — 58/58 passing.
- `npm run build` — succeeds.
- `npm run dev` — serves and returns 200.
- **Not verified**: whether the maze actually looks like the reference
  screenshot now. This entire change is a response to a visual complaint
  and was made without being able to render and compare the two side by
  side - same standing limitation as every prior visual entry, but worth
  restating plainly here since the whole point of this change was visual
  correction. `braidChance` is the number to adjust if it's still not
  open enough (or has become too open / lost its maze feel) once viewed.

### Not done yet

- Confirm the braided maze against the reference screenshot in an actual
  browser and retune `braidChance` if needed.
- Regional variation in openness (tight vs. open areas) rather than one
  global chance.
- Roadmap items 7-12 (biomes, polish, deployment, Electron, co-op) remain
  open and are unrelated to this entry.

---

## 2026-08-03 — Boss encounter: tankier chaser + ranged attack (roadmap item 6)

### What was built

- `Enemy` generalized to take `radius`, `color`, and `speed` as optional
  constructor params (all still default to the existing `ENEMY.*`
  constants, so regular enemy spawning is unchanged). This is purely so
  `Boss` can subclass it and reuse the same maze-aware chase movement at a
  different size/color/pace, instead of duplicating that logic.
- `Projectile` generalized to take an optional `color` param (defaults to
  `COLORS.projectile`, unchanged for player shots), so boss-fired shots can
  render in a different color than the player's.
- `src/entities/Boss.ts` (`extends Enemy`): bigger (radius 22 vs 14),
  slower (speed 90 vs 110), takes 5 hits instead of 1 (reuses
  `HealthSystem.applyHit`/`isGameOver` for the hit-point math rather than
  duplicating "decrement, floor at zero, defeated at zero" under a new
  name), and fires a projectile straight at the player's current position
  every 1.4s via a `canAttack`/`recordAttack` pair built on the existing
  `CombatSystem.canFire` cooldown check.
- `GameScene` now spawns the boss automatically the instant the last
  regular enemy dies (not alongside them from the start - fighting through
  the regular enemies first, then a distinct "the boss appears" beat,
  reads better than dumping every threat in at once). A one-line "THE
  GUARDIAN AWAKENS" banner announces it. Winning now requires the boss
  dead, not just the regular enemies - `enemies.length === 0` alone no
  longer ends the maze.
- Regular enemies and the boss share one `activeChasers` list for movement/
  pathing (the boss is just another `Enemy` for that purpose - no separate
  pathing code), but are handled separately for combat: a projectile hit
  on the boss calls `takeHit()` (may or may not kill it), the same hit on a
  regular enemy calls `destroy()` (always kills it) - branched via
  `instanceof Boss`.
- `HUD.update()` gained a third parameter, boss hits remaining (`number |
  null`) - shows a "Guardian: N" line once the boss exists, hidden
  otherwise.
- No new tests this entry - the boss's own logic (hit-point math, attack
  cooldown) is entirely built from already-tested `HealthSystem`/
  `CombatSystem` functions, and the rest (spawning, movement, HUD wiring)
  is Phaser-entity glue in `GameScene`/`Boss`, consistent with how
  Player/Enemy/Projectile/Pickup have never been unit-tested directly
  either - only the pure systems underneath them are. Suite is still 55
  tests, all still passing.

### Key decisions

- Picked **one** boss mechanic (aimed ranged shot on a cooldown) rather
  than attempting several from `docs/game_ideas.md`'s wishlist (summon
  minions, alter the maze, break walls, force positioning). A single,
  working, distinct-from-regular-enemies behavior beats a half-built
  attempt at three. `docs/enemy_design.md` now says explicitly that
  attack-pattern variety is still open design work, not implemented.
- The boss has no name, no lore, no unique sprite - it's a reskinned
  `Enemy` (bigger, red, gold ring) with a banner reading "THE GUARDIAN
  AWAKENS." That word choice is the only lore this entry introduces, and
  it's a placeholder, not a decision about the game's actual mythology -
  `docs/lore.md` still says "almost no explicit story," and this doesn't
  contradict that.
- Made the boss spawn *after* clearing regular enemies rather than at
  maze start alongside them. Reasoning: a "boss" should read as a distinct
  encounter, not one more enemy in the mix from the first second - and
  mechanically, 3 chasers + a projectile-firing tank all live from the
  opening moment would likely be an unreasonable difficulty spike for a
  game with no difficulty settings or telegraphing yet.
- Reused `ENEMY_SPAWN_CELLS[0]` as the boss's spawn point instead of adding
  a dedicated boss-spawn constant - by the time the boss spawns, every
  regular enemy is already dead, so there's no actual collision risk in
  reusing that corner. Simpler than plumbing through a new spawn-point
  concept for a single fixed location.

### Verified

- `npm run lint` — clean.
- `npm run test` — 55/55 passing (unchanged count - see above for why no
  new tests were added).
- `npm run build` — succeeds.
- `npm run dev` — serves and returns 200.
- **Not verified**: in-browser feel, more than usual this time. Specific
  open questions: does 5 hits feel like a boss or just a bullet sponge?
  Is the 1.4s attack cooldown fair or does it feel like getting sniped
  from across the maze given the maze's sightlines are usually short
  corridors? Does the visual distinction (bigger red circle + gold ring)
  read as "boss" at actual gameplay speed, or does it blend in with
  regular enemies until you're already close? None of this can be
  assessed without playing it - same standing caveat as every prior entry,
  no browser tool available in this session.

### Not done yet (see `docs/roadmap.md`)

- Three biomes, general polish (items 7-8).
- Docker/Kubernetes wiring for this game, Electron port, local co-op
  (items 9-12).
- Everything flagged above in `docs/enemy_design.md`: the other 4 enemy
  types, non-chase enemy behaviors, boss attack-pattern variety, and any
  real name/lore for the boss.

---

## 2026-08-03 — Real splash + main menu screens from concept art (not a roadmap item; requested directly)

### What was built

- The user added `godspeed/artwork/godspeed-start-screen.png` and
  `godspeed/artwork/godspeed-mockup.png` (1672x941 concept art) to the repo
  and asked for them to become the actual start screen and main menu,
  replacing the placeholder `TitleScene` text screen.
- Copied both into `game/src/assets/` (the game's actual asset bundle,
  distinct from `godspeed/artwork/`, which reads as a source/press-kit
  folder outside the buildable game - left untouched).
- `src/vite-env.d.ts` added (`/// <reference types="vite/client" />`) so
  TypeScript recognizes `import x from '*.png'` as a module.
- `src/utilities/ImageFit.ts` — `containScale(contentW, contentH, boundsW,
  boundsH)`, a pure letterbox-fit calculation. The art is 16:9-ish
  (1672x941); the game canvas is 3:2 (960x640). Contain (not cover) was
  chosen deliberately so nothing in the art gets cropped - it letterboxes
  with ~50px bars top/bottom instead, which blend into the canvas since
  both the art's backdrop and `COLORS.background` are near-black.
- `BootScene` now preloads both images, then starts a new `SplashScene`
  (full-bleed start-screen art, "Press any key" prompt, any keydown or
  pointerdown advances) which leads into a new `MenuScene` (full-bleed
  mockup art as the background, with a transparent interactive overlay for
  the five menu rows already drawn into that art - NEW GAME / CONTINUE /
  SETTINGS / CREDITS / EXIT). Old `TitleScene.ts` deleted; `main.ts`'s scene
  list is now `[BootScene, SplashScene, MenuScene, GameScene]`.
- Only **NEW GAME** is functional (starts `GameScene`). The other four are
  navigable (arrow keys / mouse hover move the highlight, matching the
  art's arcade-menu feel) and clickable, but clicking one shows a
  transient "Coming soon" instead of doing nothing silently - there's no
  continue-a-run save state, settings screen, credits screen, or
  meaningful browser "exit" to wire them to yet.
- New test: `tests/imageFit.test.ts` (width-constrained case, height-
  constrained case, exact-match case). Suite is now 55 tests, all passing.

### Key decisions

- The five menu-item hit zones are positioned by **eyeballed pixel
  fractions** of the source art (`ITEM_LEFT_FRAC`/`FIRST_ITEM_Y_FRAC`/etc.
  in `MenuScene.ts`), read off the mockup image, not measured precisely
  against the real 1672x941 file. They're expressed as fractions of the
  art's own dimensions specifically so they stay aligned regardless of
  final letterbox scale - but the fractions themselves are an
  approximation. This is the single most likely thing to be visibly
  wrong (zones shifted a few pixels off the drawn boxes) once someone
  actually looks at it in a browser.
- Didn't redraw the menu labels, the "VISION" box, the version tag, or the
  social icons as separate Phaser text/image objects - they're already
  rendered into the mockup art itself. Only an invisible interactive layer
  was added on top. Duplicating them as live text would either double up
  visually or require pixel-matching the art's exact font/position, which
  isn't worth it for static content that's already correct in the image.
- Deliberately did **not** make the Discord/GitHub/website icons in the
  art clickable. They're baked into the image with no known real target
  URL for this project, and guessing/fabricating a Discord invite or repo
  link isn't something to do silently - if real links exist, they should
  be supplied explicitly rather than inferred from a mockup image.
- Did not compress or resize the two PNGs (2.24MB and 2.27MB - both now
  shipped verbatim in the production bundle per the build output below).
  They're user-supplied concept art and recompressing them without the
  right tooling (no image-optimization tool available in this session)
  risked visibly degrading them. Flagging this as a known follow-up: ~4.5MB
  of images on top of a ~1.2MB JS bundle is heavy for a browser game's
  first load and should be optimized (resize to actual display resolution,
  convert to a compressed format) before this is treated as
  production-ready.

### Verified

- `npm run lint` — clean.
- `npm run test` — 55/55 passing.
- `npm run build` — succeeds; output confirms both images are bundled
  (`godspeed-mockup-*.png` 2,239.80 kB, `godspeed-start-screen-*.png`
  2,266.43 kB alongside the JS bundle).
- `npm run dev` — serves; confirmed both the app shell and the raw image
  path return 200.
- **Not verified** (same standing caveat, now more load-bearing than ever
  since this entire entry is visual): whether the letterbox bars look
  intentional or like a bug, whether the five interactive zones actually
  line up with the drawn menu rows, whether "Coming soon" reads as
  helpful or cheap, and whether load time on the ~4.5MB of art is
  noticeable. No browser/screenshot tool exists in this session - this
  build has not been looked at. A manual check is essential here, not
  optional, before assuming the menu overlay alignment is usable.

### Not done yet

- Verify/nudge the menu item hit-zone alignment against the real art in a
  browser.
- Optimize the two PNGs for web delivery.
- Any actual functionality behind Continue / Settings / Credits / Exit.
- Roadmap items 6-12 (boss, biomes, polish, deployment, Electron, co-op)
  are all still open and unrelated to this entry.

**2026-08-03 follow-up:** confirmed in a real browser - the menu hit-zone
alignment is off (as flagged above; the eyeballed fractions were an
approximation, not a measurement). User asked to park this rather than
chase it right now. `MenuScene.ts`'s `ITEM_LEFT_FRAC`/`ITEM_RIGHT_FRAC`/
`FIRST_ITEM_Y_FRAC`/`ITEM_SPACING_FRAC` constants are the place to fix it -
whoever picks this up next should re-measure against the actual
1672x941 PNG (e.g. open it in an image editor and read pixel coordinates
directly) rather than eyeballing a rendered preview again.

---

## 2026-08-03 — Roguelite upgrades: run pickups + one permanent unlock (roadmap item 5)

### What was built

- `src/systems/UpgradeSystem.ts` — pure `UpgradeState` (`speedMultiplier`,
  `fireCooldownMultiplier`) and `applyUpgrade(state, type)` for `'speed'` /
  `'rapidFire'` (multipliers stack multiplicatively across pickups of the
  same type). `'extraLife'` is a no-op here by design — it's a one-shot
  effect, not a persistent multiplier, so it's applied directly via
  `HealthSystem.grantExtraLife` instead.
- `src/systems/ProgressionStorage.ts` — the actual "permanent unlocks
  between runs" piece from `docs/progression.md`. `loadProgression`/
  `saveProgression` take an injectable storage interface (not a hard
  `localStorage` dependency), so `recordMazeCleared`/`bonusStartingLives`
  are unit-testable with an in-memory fake instead of a real browser API.
  Persists to `localStorage['godspeed:progression']` in the actual game.
- `src/systems/PickupPlacement.ts` — `chooseSpawnCells(rows, cols, exclude,
  count, rng)`, a partial Fisher-Yates shuffle over every non-excluded
  cell, used to place pickups away from the player/enemy spawn cells.
- `src/entities/Pickup.ts` — a small circle, colored per `UpgradeType`
  (turquoise/amber/violet, from the existing accent palette in
  `docs/art_direction.md`).
- `Player.move()` gained an optional `speedMultiplier` parameter (default
  1); `GameScene` multiplies `PROJECTILE.fireCooldownMs` by
  `upgrades.fireCooldownMultiplier` before the `canFire` check. Neither
  `MovementSystem` nor `CombatSystem` needed to change - the multiplier is
  just a different number going into the same pure functions.
- `GameScene.create()` now loads progression from `localStorage`, applies
  `bonusStartingLives`, and spawns one pickup of each type
  (`PICKUP.count = 3`) at cells chosen by `chooseSpawnCells`, excluding the
  player and enemy spawn cells. `enterVictory()` calls
  `recordMazeCleared` + `saveProgression` before showing the win screen.
- New tests: `tests/upgradeSystem.test.ts` (multiplier direction and
  stacking, extraLife no-op, non-mutation), `tests/progressionStorage.test.ts`
  (empty/corrupt-JSON fallback, save/load round-trip via a fake storage
  object, the bonus-life threshold), `tests/pickupPlacement.test.ts` (count,
  exclusion, clamping when fewer open cells exist than requested,
  determinism for a fixed rng). Suite is now 52 tests, all passing.

### Key decisions

- Went with 3 concrete pickup types (speed, rapid fire, extra life) rather
  than a generic "upgrade" abstraction with more variants, because
  `docs/game_ideas.md`'s longer wishlist (shields, radar, dash, weapon
  variety) is still just a bullet list, not a spec — building a generic
  system for upgrades that don't exist yet would be speculative. Extending
  `UpgradeType`/`applyUpgrade`/`PICKUP_COLOR` is a small, additive change
  when a new one is actually designed.
- The one permanent unlock (`+1` starting life after your first-ever
  clear) is intentionally minimal — it exists to prove the
  persists-across-`scene.restart()` mechanism works, not as considered
  meta-progression. `docs/progression.md` says explicitly not to read it as
  a design decision about what unlocks *should* exist.
- Kept `extraLife` out of `UpgradeState` entirely rather than modeling it
  as, say, `livesBonus: number` inside the same object - it's consumed
  once at pickup time, whereas the object's other two fields are ambient
  modifiers read every frame. Mixing the two shapes into one object would
  have made `applyUpgrade` do two different kinds of things depending on
  the branch.

### Verified

- `npm run lint` — clean.
- `npm run test` — 52/52 passing.
- `npm run build` — succeeds.
- `npm run dev` — serves and returns 200.
- **Not verified**: in-browser feel, same standing caveat as every entry
  above (no browser tool available this session). Specifically unverified
  here: whether 3 pickups per maze feels generous or stingy, whether the
  speed/rapid-fire multiplier magnitudes (1.35x / 0.6x per pickup) feel
  impactful without trivializing the enemies, and whether
  `localStorage` persistence actually survives a real reload in a real
  browser (the read/write logic is unit-tested against a fake storage
  object, not against an actual browser's `localStorage`).

### Not done yet (see `docs/roadmap.md`)

- Boss, three biomes, general polish (items 6-8).
- Any UI/menu surface for progression - no shop, no unlock list, no
  indication to the player that the permanent bonus exists at all beyond
  noticing they started with 4 lives instead of 3.
- Docker/Kubernetes wiring for this game, Electron port, local co-op
  (items 9-12).

---

## 2026-08-03 — Complete gameplay loop: lives, game over, win, restart (roadmap item 4)

### What was built

- `src/systems/HealthSystem.ts` — pure rules: `isInvulnerable(lastHitAtMs,
  nowMs, durationMs)`, `applyHit(lives)` (floors at 0), `isGameOver(lives)`.
- `Player.teleportTo(position)` — instant reposition, used for respawn (as
  opposed to `move()`, which is velocity-based).
- `src/ui/HUD.ts` — plain text readout of lives and enemies remaining,
  updated every frame. First thing living in the previously-empty `ui/`
  folder.
- `GameScene` now tracks `lives`, `lastHitAtMs`, and a `state: 'playing' |
  'gameover' | 'victory'`. On enemy contact (outside the invulnerability
  window): lose a life, respawn at the maze's center cell, reset the
  invulnerability timer. At 0 lives, or when the last enemy dies, the scene
  enters `gameover`/`victory`, shows a message + "Press SPACE to continue",
  and calls `this.scene.restart()` on SPACE — which reruns `create()` and
  therefore builds a fresh maze via `MazeView`'s constructor, for free.
  `update()` short-circuits entirely once `state !== 'playing'`, so nothing
  moves or fires during the end screen.
- New tests: `tests/healthSystem.test.ts` (invulnerability window edges,
  hit floors at 0, game-over threshold). Suite is now 36 tests, all passing.

### Key decisions

- 3 lives with a respawn-in-place + brief invulnerability, not "one touch =
  instant game over." Chose this over strict classic-arcade lethality
  because the player has no way to see an enemy coming from around a
  corner yet (no fog-of-war/vision system exists) — a single accidental
  corner-turn death felt like it'd read as unfair rather than tense. Revisit
  once there's some warning mechanic; `docs/gameplay.md` and
  `docs/game_ideas.md` both imply this is still an open direction, not a
  settled one.
- "Win" is simply "kill every enemy in the current maze," and winning just
  restarts into a new maze rather than advancing a floor counter or
  increasing difficulty. There's no descent/floor-progression system to
  hook into yet — that's `docs/progression.md`, which is still just a
  one-line stub. Don't read the current restart-on-win behavior as the
  intended final loop; it's the minimum that makes "win" and "lose" both
  reachable and distinct, per roadmap item 4's literal ask.
- Caught a real TypeScript footgun while wiring this up: `private lives =
  PLAYER.lives` inferred the *literal* type `3` (not `number`), because
  `GameConfig.ts`'s exported objects use `as const`. Reading a `const`-
  asserted property doesn't widen the way a fresh literal does. Fixed with
  an explicit `private lives: number = PLAYER.lives`. Worth remembering if
  future code assigns a mutable field from any `GameConfig` value.

### Verified

- `npm run lint` — clean.
- `npm run test` — 36/36 passing.
- `npm run build` — succeeds (after fixing the literal-type build error
  above; a plain `tsc --noEmit` run without watching for exactly this
  failure mode would have silently shipped a class field that could never
  legally be decremented).
- `npm run dev` — serves and returns 200.
- **Not verified**: in-browser feel — is 3 lives + this invulnerability
  window (1200ms) the right tuning? Does the HUD read clearly at a glance?
  Does restart-into-a-new-maze feel like progress or like nothing happened?
  Same standing caveat as the last two entries: no browser/screenshot tool
  in this session. This is logic-verified, not playtested — a manual pass
  is still owed, and is more due now than ever, since this entry is the
  first one that touches game *feel* (lives, invulnerability, restart
  pacing) rather than pure mechanics.

### Not done yet (see `docs/roadmap.md`)

- Roguelite upgrades, boss, three biomes, general polish (items 5-8).
- Multi-floor descent / difficulty progression — winning currently just
  restarts flat.
- Docker/Kubernetes wiring for this game, Electron port, local co-op
  (items 9-12).

---

## 2026-08-03 — Enemy AI: maze-aware chaser (roadmap item 3)

### What was built

- `src/ai/Pathfinding.ts` — `openNeighbors(maze, cell)` (walkable
  neighbors of a cell per its wall flags) and `computeDistanceField(maze,
  target)`, a BFS distance-from-target field over every maze cell. Computed
  once per repath tick and shared across all enemies, instead of each enemy
  re-searching its own path every frame.
- `src/ai/ChaseBehavior.ts` — `nextStepToward(maze, from, distanceField)`:
  picks whichever open neighbor cell is strictly closer to the target;
  returns `null` at the target cell or when no closer neighbor exists (e.g.
  an unreachable component — doesn't happen with a `generateMaze` output
  since it's always fully connected, but the function handles it rather
  than assuming).
- `src/entities/Enemy.ts` — moves in a straight line from cell-center to
  cell-center toward a target handed to it by `GameScene`; snaps exactly
  onto the target when within one frame's movement, so it never
  overshoots/jitters at arrival.
- `MazeView` now exposes the underlying cell graph (`.maze`) and
  `cellFromPosition(pixel)`, so `GameScene` can map the player's continuous
  position back onto the cell the distance field is measured from.
- `GameScene` spawns `ENEMY.count` (3) enemies at the maze's four corners,
  recomputes the distance field from the player's current cell every
  `ENEMY.pathUpdateIntervalMs` (300ms), and re-targets any enemy that has
  arrived at its previous target cell. Enemies die on projectile contact via
  the new `circlesIntersect` in `CollisionSystem.ts`.
- New tests: `tests/pathfinding.test.ts` (hand-built mazes — a straight
  corridor's distance gradient, arrival returning `null`, an intentionally
  disconnected cell staying at `Infinity` distance with no valid step) and
  `circlesIntersect` cases appended to `tests/collisionSystem.test.ts`
  (clear miss, overlap, and the exactly-touching boundary being a non-hit).
  Suite is now 30 tests, all passing.

### Key decisions

- Enemy speed (`ENEMY.speed = 110`) is deliberately slower than the player
  (`PLAYER.speed = 220`), so the chaser is outrunnable by design rather than
  by AI weakness — matches "the player should always feel in control" in
  `docs/ai_development_guide.md`.
- Repathing on a fixed interval (not every frame) rather than a live A*/BFS
  per enemy per frame — cheap for a small maze either way, but the interval
  approach is the pattern to keep once there are more enemies or bigger
  mazes, so it's set up that way now rather than optimized later.
- Enemy contact with the player currently does nothing — no damage, no
  game over. That's explicitly scoped to roadmap item 4 (complete gameplay
  loop / lives), not this one; see `docs/enemy_design.md`.
- Only one enemy "type" (a chaser) exists. The other four types and the
  boss aren't just unbuilt, they're **undesigned** — `docs/enemy_design.md`
  had no names/roles/stats to build from. Flagged there as open design work
  for whoever picks up the next enemy.

### Verified

- `npm run lint` — clean.
- `npm run test` — 30/30 passing.
- `npm run build` — succeeds.
- `npm run dev` — serves and returns 200.
- **Not verified**: in-browser feel (does the chase read as threatening?
  does 3 enemies at fixed corners make sense visually? does the repath
  interval look smooth or stuttery?). Same caveat as the previous entry —
  no browser/screenshot tool was available this session. This is
  logic-verified, not playtested.

### Not done yet (see `docs/roadmap.md`)

- Complete gameplay loop: lives, game over, restart (item 4) — includes
  deciding what enemy contact does to the player.
- The other 4 enemy types + boss, and any non-chase behaviors (flank,
  ambush, retreat) — design work, not just implementation.

---

## 2026-08-03 — Procedural maze + wall collision (roadmap item 2)

### What was built

- `src/systems/MazeGenerator.ts` — pure, Phaser-free maze generation:
  `generateMaze(cols, rows, rng)` builds a "perfect" maze (every cell
  reachable, no loops) with an iterative randomized depth-first backtracker;
  `mazeToTileGrid(maze)` expands it into a uniform `(rows*2+1) x (cols*2+1)`
  boolean tile grid (`true` = wall) so floor cells and walls become
  same-size tiles instead of needing separate wall-segment geometry.
- `src/systems/CollisionSystem.ts` — pure circle-vs-axis-aligned-rect
  functions: `circleIntersectsRect`/`circleIntersectsAnyRect` (boolean hit
  test, used to destroy projectiles on wall contact) and
  `resolveCircleRectCollision`/`resolveCircleRectCollisions` (push-out
  resolution, used to stop the player at walls). Sequential per-rect
  resolution, not a full physics solver — sufficient for arcade movement
  against a static tile grid.
- `src/entities/MazeView.ts` — builds one maze per `GameScene.create()`,
  renders wall tiles as flat rects (same placeholder-art approach as the
  player/projectile circles), and exposes `wallRects` plus `cellCenter(row,
  col)` for spawn placement.
- `Player.move()` now takes the wall rect list and resolves collisions after
  the arena-bounds clamp; `GameScene` destroys any projectile that touches a
  wall tile.
- Maze size is configured in `GameConfig.ts` (`MAZE.cols/rows/tileSize`;
  currently 11x7 cells, 40px tiles) — the player spawns at the maze's center
  cell rather than a fixed arena position.
- New tests: `tests/mazeGenerator.test.ts` (grid dimensions, full
  connectivity from a flood-fill check with a seeded deterministic RNG,
  cell-centers-always-floor / border-always-wall invariants) and
  `tests/collisionSystem.test.ts` (hit tests, push-out math, the
  circle-exactly-on-rect degenerate case, multi-rect resolution). Total
  suite is now 23 tests, all passing.

### Key decisions

- Chose a uniform-tile-size representation (wall tiles and floor tiles are
  the same square size) over variable-thickness wall segments — makes both
  rendering and collision trivial AABB rects instead of needing a separate
  line/segment collision routine. Revisit if thinner walls are wanted for
  visual density later.
- Generation produces a "perfect" maze (spanning tree, zero loops) for now.
  `docs/level_design.md` flags this as an open gameplay-feel question — a
  loopless maze can dead-end a lot — to revisit once enemies exist and the
  loop can actually be played, not just looked at.
- No maze regeneration/floor-transition yet — one maze is built at
  `GameScene` startup and that's the whole run. Multi-floor descent is a
  later roadmap concern (progression / gameplay loop items).

### Verified

- `npm run lint` — clean.
- `npm run test` — 23/23 passing.
- `npm run build` — succeeds.
- `npm run dev` — serves and returns 200 with the expected HTML shell.
- **Not verified**: actual in-browser rendering/feel (maze visuals, movement
  against walls, projectile-wall impacts). No browser/screenshot tool was
  available in this session to drive a real browser — correctness here
  rests on the unit tests (connectivity, collision math) and a human/browser
  pass is still owed before calling this "played and confirmed fun." Do that
  before building further on top of it if it's been a while since the last
  manual check.

### Not done yet (see `docs/roadmap.md`)

- Enemy AI (item 3) — `src/ai/` is still empty.
- Complete gameplay loop: lives, game over, restart (item 4).
- Loops/chokepoints/secret rooms in the maze, biome variety (see
  `docs/level_design.md`).

---

## 2026-08-03 — Project scaffold + vertical slice (player movement & shooting)

### What was built

- `godspeed/game/` — a Vite + TypeScript + Phaser 3 project. `npm install`,
  `npm run dev`, `build`, `lint`, `format`, `test`, `test:watch` are all wired
  and verified working.
- Folder structure follows the Architecture section of
  `docs/ai_development_guide.md`:
  `src/{core,scenes,entities,components,systems,ai,ui,assets,config,utilities}`.
  `core/`, `components/`, `ai/`, `ui/`, `assets/` are currently empty —
  reserved for later roadmap items.
- Roadmap item 1, "Player movement & shooting," as a vertical slice:
  - Scene flow: `BootScene` → `TitleScene` (press SPACE) → `GameScene`.
  - `Player` (`src/entities/Player.ts`): circle placeholder sprite, WASD/arrow
    movement, clamped to the arena bounds.
  - Shooting: SPACE fires a projectile in the last-faced movement direction
    (no mouse aiming yet), fixed cooldown, projectiles self-destroy after a
    lifetime.
  - Core rules — `computeNextPosition`, `clampToBounds` (`MovementSystem.ts`),
    `canFire`, `projectileVelocity`, `isExpired` (`CombatSystem.ts`) — are
    plain functions with no Phaser dependency, unit tested in `tests/` with
    Vitest.
- ESLint (`typescript-eslint` flat config) and Prettier configured; both run
  clean on the current source.
- Dev server registered in the root `.claude/launch.json` as `"godspeed"`
  (port 5174, `npm run dev --prefix godspeed/game`).

### Key decisions

- No mouse aiming yet — fire direction is derived from the last movement
  input, matching the arcade/no-mouse-dependency feel implied by
  `docs/gameplay.md`. Revisit if a dedicated aim scheme is wanted later.
- Placeholder art is flat-colored Phaser primitives (circles, a rectangle
  outline for the arena walls), per the "Assets" section of
  `docs/ai_development_guide.md`. Don't couple gameplay logic to these shapes
  once real sprites arrive.
- The arena is a single static rectangle — no procedural maze yet (that's
  roadmap item 2).
- Pinned `vite@^8` / `vitest@^4`, not the first minors resolved by `npm
  install`, after `npm audit` flagged known CVEs in `vite<=6.4.2` and
  `vitest<=3.2.5` (one critical, one high). Audit is clean (0 vulnerabilities)
  as of this entry.

### Verified

- `npm run lint` — clean.
- `npm run test` — 11/11 passing.
- `npm run build` (`tsc --noEmit && vite build`) — succeeds.
- `npm run dev` — serves on `http://localhost:5174`, confirmed with an HTTP
  request returning the expected HTML shell.

### Not done yet (see `docs/roadmap.md` for order)

- Procedural maze generation (item 2).
- Enemy AI (item 3) — `src/ai/` is empty.
- Complete gameplay loop: lives, game over, restart (item 4).
- Roguelite upgrades, boss, biomes, polish (items 5-8).
- Docker/Kubernetes wiring for this game specifically, Electron port, local
  co-op (items 9-12). Godspeed is not yet added to the repo's root
  `Dockerfile`/`nginx.conf`/`web/` portal — those currently only serve
  HyperOut.
- No real art or audio assets — `src/assets/` and `src/ui/` are empty.
