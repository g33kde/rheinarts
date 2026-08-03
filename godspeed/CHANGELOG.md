# Changelog

A running log of implementation work on Godspeed, written for AI coding agents
(and humans) picking up the project cold. Read the newest entry before starting
work, then check `docs/roadmap.md` for the next planned item.

Add a new entry — newest at the top — whenever you complete a feature or
milestone, per the Documentation Rule and Definition of Done in
`docs/ai_development_guide.md`.

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
