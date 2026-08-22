# Changelog

A running log of implementation work on Debris, written for AI coding agents
(and humans) picking up the project cold. Read the newest entry before
starting work, then check `docs/roadmap.md` for the next planned item.

Add a new entry — newest at the top — whenever you complete a feature or
milestone, same convention as Godspeed's `CHANGELOG.md`.

---

## 2026-08-22 — Portal cabinet + k8s deployment wiring

### What was built

Debris now has a real cabinet on the `rheinarts.de` portal and builds
into the shared image, exactly mirroring Godspeed's own deployment
pattern (`node:22-alpine` build stage → `nginx:1.27-alpine` final stage)
rather than inventing a new one:

- **Root `Dockerfile`**: new `debris-build` stage
  (`FROM node:22-alpine`, `npm ci`, `npm run build`), `debris/music/`
  copied in as a sibling of `debris/game/` so `vite.config.ts`'s
  `publicDir: '../music'` resolves the same way in Docker as it does
  locally (identical trick to Godspeed's own music stage). Final stage
  gained `COPY --from=debris-build /app/dist/ /usr/share/nginx/html/debris/`.
- **`nginx.conf`**: `/debris` → `/debris/` redirect, same pattern as the
  existing HyperOut/Godspeed ones (the trailing-slash-less bare path
  needs to resolve to the game's own `index.html`).
- **`web/index.html`**: Debris now fills the portal's last remaining
  "coming soon" slot - `<span class="badge">PLAYABLE</span>` (the
  default badge style, cyan, no `.beta` modifier class) so it reads
  identically to HyperOut's badge, not Godspeed's orange `BETA` one.
  Thumbnail is `debris/artwork/splash.png` copied to `web/img/debris.png`
  - the same splash art already used in-game, not a new asset. Site
  `<meta description>`/Open Graph tags updated to mention all three
  games instead of just two.
- **`.dockerignore`**: added `debris/game/dist` alongside the existing
  `godspeed/game/dist` exclusion - a locally-built `dist/` (or
  `node_modules`, already covered by the generic `**/node_modules`
  pattern) must never leak into the image's own fresh
  `npm ci && npm run build`.
- **Docs**: root `README.md` (games list, project tree, run-locally
  section - also fixed a stale claim that Godspeed "isn't yet on the
  portal," which was no longer true independent of this work),
  `ROADMAP.md` ("Grow the arcade" - no "coming soon" slots remain now),
  `DEPLOYMENT.md` (serves-list, the Vite-build explanation now covers
  both Godspeed and Debris), `.claude/launch.json` (a `debris` dev-server
  config, port 5175, matching the `godspeed` entry's shape), and
  Debris's own `docs/technical_design.md` (its "not yet wired up for
  Debris specifically" deployment note was true until this entry -
  updated, along with confirming the UFO's score stays at 200 rather
  than still reading as an open question).
- **`k8s/rheinarts.yaml` needed no changes** - one shared image, one more
  served path under it, same as when Godspeed was added.

### Verified

This is the first Debris entry to verify an actual Docker build rather
than just `tsc`/`eslint`/`vitest`/`vite build` in isolation:

- `docker build --platform linux/amd64 -t rheinarts:debris-test .` from
  the repo root succeeded end-to-end - both the `godspeed-build` and new
  `debris-build` stages ran `npm ci && npm run build` cleanly (Debris:
  39 modules transformed, `tsc --noEmit` clean, all expected assets in
  the manifest), copied into the final nginx image.
- Ran the built image locally (`docker run`) and curled it: portal `/`
  (200), `/debris` → `/debris/` redirect (301), `/debris/` index (200),
  the bundled JS entry and a bundled SFX asset (`laser2-*.wav`, 200),
  both `debris/music/` tracks served via `publicDir`
  (`menu.mp3`/`neon-horizon.mp3`, 200), the portal's Debris card markup
  and its `img/debris.png` thumbnail (200), `/healthz` (200), and
  confirmed `/hyperout/` and `/godspeed/` still resolve unaffected (200
  each). Not just eyeballed the Dockerfile/nginx.conf - actually built
  and curled the running container, same standard Godspeed's own portal
  addition set.
- Test container and image removed after verification
  (`docker rm`/`docker rmi`) - nothing left running locally.

### Not done yet

- **Not pushed to GHCR, not applied to the cluster.** Building and
  verifying the image locally is as far as this goes unprompted -
  pushing to the registry and rolling the live Deployment needs
  credentials only the user has and touches shared/live infrastructure,
  exactly the kind of action this project's standing instructions say
  to leave to an explicit ask. `DEPLOYMENT.md`'s existing runbook (build
  → push → edit `k8s/rheinarts.yaml`'s tag → `kubectl apply`) covers the
  remaining steps.
- No screenshot-based thumbnail - `web/img/debris.png` reuses the splash
  art since there's no way to capture actual gameplay footage in this
  environment (no browser tool, same standing limitation as every other
  "not seen running" note in this changelog).

---

## 2026-08-22 — Volume settings persist across reloads

### What was built

Read `hyperout/game.js`'s actual `saveSettings`/`loadSettings` functions
directly (not going from memory) and replicated the same pattern in
`systems/AudioSettings.ts`: one JSON blob under a namespaced
`localStorage` key (`rheinarts.debris.v1`, matching HyperOut's own
`rheinarts.hyperout.v1` naming), loaded once when the module first
initializes (a plain module-level singleton - there's exactly one audio
session per page load), saved on every `setMusicVolume`/`setSfxVolume`
call. Both the load and save paths are wrapped in try/catch, same as
HyperOut's - a disabled/unavailable `localStorage` (private browsing,
quota, or simply not existing in this file's own Node-environment test
run) degrades to session-only instead of throwing, rather than crashing
the module at import time.

No call-site changes needed anywhere else - `MenuScene`'s sliders,
`GameScene`'s SFX/music playback, `SplashScene`'s menu-music start all
already went through `getMusicVolume`/`getSfxVolume`/`setMusicVolume`/
`setSfxVolume`, so persistence is a property of those functions now, not
something every caller had to opt into.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (35/35, unchanged
  - `AudioSettings`' existing 4 tests already exercise the clamping logic
  that persistence sits on top of, and pass in the Node test environment
  whether or not a `localStorage` global exists there), `npm run build`
  all clean.

### Not done yet

- **Not confirmed in an actual browser** that a value set, then reloaded,
  actually comes back - reasoned from matching HyperOut's proven pattern
  exactly, not observed here.
- Nothing else persists (high scores, last-picked mode, P1/P2 input
  source) - those remain separate, undecided roadmap items, not swept in
  under this one just because the mechanism now exists.

---

## 2026-08-22 — The UFO

### What was built

`docs/gameplay.md` had already decided the UFO's broad strokes (enters
from an edge, drifts on a fixed heading, wraps, fires a rough lead on the
nearest player, destroyable by shots/asteroids, "200+ points"), but left
several real implementation questions open. Asked before building
(`AskUserQuestion`, not guessed) and answered:

- **No cap on concurrent UFOs** - the spawn timer (`UFO.spawnIntervalMs`)
  fires regardless of whether an earlier UFO is still alive, so they can
  stack up if nothing kills them.
- **Ramming a UFO with a ship destroys both**, not just the ship - the
  ship's shield can still save the *ship* half of that (same shield
  semantics as an asteroid hit), but the UFO dies either way.
- **Aim spread is moderate**: the UFO's shot is a real single-pass
  lead-the-target prediction, then a uniform-random ±18° error
  (`UFO.aimSpreadRad`) on top - noticeably imperfect, dodgeable with
  movement, still a real threat standing still.
- **Score bonus stays at 200** - the original scaffold placeholder,
  confirmed rather than raised.

Built:

- **`entities/Ufo.ts`**: the "Classic Saucer" visual from
  `docs/art_direction.md` - a wide flattened body ellipse
  (`Graphics.fillEllipse`/`strokeEllipse`, no manual point math needed),
  a dome drawn as a manually-constructed top-half-ellipse polygon (Phaser
  has no built-in ellipse-arc primitive, so it's 16 parametric points
  from angle π to 2π - the top half in screen coordinates - closed by
  `closePath()`), and three under-lights pulsing on independent phase
  offsets. "Gently bob/tilt during flight" from the doc is implemented as
  a rotation wobble only (`setRotation` sine wave) - not literal position
  bobbing, which would mean fighting the Matter-tracked y position every
  frame for a subtle effect not worth that risk. Solid (non-sensor)
  Matter body, same pattern as `Ship`, category `UFO`, mask
  `SHIP | ASTEROID | PROJECTILE`.
- **`entities/UfoShot.ts`**: structurally identical to `Projectile`
  (constant velocity, wraps, expires, sensor) but deliberately its own
  class, not a generalized/shared one - a UFO shot only ever targets a
  ship (never an asteroid, never `ownerIndex`-scoped like a player shot),
  different enough collision semantics that sharing a class would mean
  threading UFO-only concerns through player-shot logic.
- **`systems/UfoTargeting.ts`**: two pure, tested functions -
  `computeLeadAimHeading` (single-pass intercept prediction: aim where
  the target *will be* after the shot's travel time, given its current
  velocity - "rough lead," not a full physics solve) and
  `applyAimSpread` (the ±18° random error). Pure rule logic gets tested
  per this project's established boundary (`tests/ufoTargeting.test.ts`).
- **New collision category, `UFO_SHOT` (0x0020)**, separate from `UFO`
  itself (0x0008) - keeps "something touched the UFO's body" and
  "something touched the UFO's shot" as distinct collision pairs.
  `Projectile`'s own mask gained `CATEGORY.UFO` (player shots can now
  actually hit it) alongside its existing `CATEGORY.ASTEROID`.
  `Ship` gained a `velocity` getter, needed for the lead calculation.
- **`GameScene` wiring**: `spawnUfo()` (random edge, heading within ±45°
  of straight-across, not a razor-straight cardinal line),
  `updateUfos()` (moves every UFO, then has each fire independently off
  its own cooldown via `nearestAliveShip()`), and two more deferred-
  processing queues (`pendingUfoHits`, `pendingUfoShotHits`) following
  the same "never mutate the Matter world inside the collision callback"
  discipline as every other entity type in this file.
- **No dedicated UFO SFX yet** (spawn, its own shot, a distinct
  destruction sound) - destroying one currently reuses
  `SHIP_DESTROYED_SFX_KEY` (a downed UFO is a bigger deal than a regular
  asteroid, so the bigger explosion sound, not silence or the asteroid
  one). Now the one remaining SFX gap, per `docs/roadmap.md`.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (35/35 - 5 new
  tests for `UfoTargeting`'s lead prediction and spread bounds), `npm
  run build` all clean.

### Not done yet

- **Not seen/played in an actual browser.** The dome's manually-built
  half-ellipse geometry, the under-light pulse timing, the aim-spread
  feel, and whether "no cap on concurrent UFOs" reads as escalating
  tension or overwhelming chaos are all reasoned through, not observed -
  this last one in particular was a real design call (the user picked
  "UFOs can stack up" over a max-1-at-a-time option) worth watching
  closely once it's actually playable.
- Dedicated UFO sound effects (see above).
- The UFO doesn't yet interact with Cooperative/Competitive mode logic
  (neither exists) or with `MenuScene`'s still-unconsumed selections.

---

## 2026-08-22 — Player 2 (keyboard)

### What was built

`GameScene` was built around a single `ship`/`input$` field pair since
the very first playable slice - this replaces both with a `players:
PlayerSlot[]` array (`{ ship, input, lastFiredAtMs }`), populated with
two entries in `create()`: P1 (`P1_BINDINGS`) spawns 150px left of
center, P2 (`P2_BINDINGS`) 150px right, so they don't start overlapping.
`update()`'s per-frame input/turn/thrust/fire logic now runs in a loop
over `players` instead of touching one ship directly.

- **Per-player fire limits, not shared.** The old single-ship code
  capped `this.projectiles.length` globally at `SHIP.maxOnScreenShots`;
  with two ships that would've meant one aggressive player could starve
  the other's ability to fire, which isn't a real design decision, just
  an accident of the old single-player code. `Projectile` gained a real
  `ownerIndex`, and each player's own fire-rate/on-screen-cap check now
  filters to `p.ownerIndex === ownerIndex` - each ship gets its own
  independent budget.
- **No friendly fire, by construction, not by a mode check.**
  `Projectile`'s collision mask was already `CATEGORY.ASTEROID` only (a
  shot has never been able to hit a ship, including your own) - so
  Cooperative-style "no friendly fire" just falls out of existing
  collision filtering with zero new code. Ships can still physically
  bump each other (harmless Matter collision response, no special
  handling needed - `handleCollision`'s ship/asteroid/shield branches
  simply don't match a ship-vs-ship pair).
- **The round now ends only once *both* ships are destroyed**, not the
  first one - `processPendingShipHits` (renamed from the singular
  `processPendingShipHit`) destroys individual ships as their hits come
  in, and only calls `enterGameOver()` once
  `players.every(p => !p.ship.isAlive)`. A ship that dies just vanishes;
  the surviving player keeps playing solo for the rest of the round -
  the simplest thing that works without inventing lives/respawn logic
  that isn't built yet (roadmap item 5).
- **Shield pickups now grant to whichever ship actually touched them.**
  `pendingShieldPickups` changed from `Shield[]` to
  `{ ship: Shield }[]` - the old code always granted to `this.ship`
  (there was only ever one), which would've been a real bug the moment
  a second ship existed.
- **One shared thrust-sound loop, not per-ship.** Tried and discarded a
  per-player version - two independent engine-hum instances would just
  overlap into noise for two ships sitting near each other, which is how
  the sound already reads regardless. `wasAnyThrusting` (renamed from
  `wasThrusting`) now tracks whether *any* alive ship is currently
  thrusting and edge-detects the shared loop's play/stop off that
  aggregate, same idempotent-restart behavior as before.
- Score stays a single shared value - no per-player split, matches the
  one `SCORE` HUD readout already there.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (30/30, unchanged
  - this is Phaser scene wiring, no new pure rule logic), `npm run build`
  all clean.

### Not done yet

- **Not seen/played in an actual browser.** Two-ship collision handling,
  the shared thrust sound with two ships thrusting at once, and the
  "round ends only when both are dead" flow are all reasoned through,
  not observed.
- Both ships are keyboard-only regardless of `MenuScene`'s P1/P2
  gamepad toggle - that selection still isn't consumed anywhere
  (roadmap item 9's remaining gap, and item 11 for gamepad input itself).
- No Cooperative/Competitive mode *logic* - what's here is closest to
  Cooperative by default (see the class doc comment), but there's still
  no actual mode switch, and Competitive's "friendly fire on, last ship
  standing" isn't built at all.

---

## 2026-08-22 — Menu crash fixed, real black-border root cause, functional volume, trimmed background

### What was built

Five requested items, the first being an actual bug hunt:

- **Fixed the "Main Menu" crash.** Root cause: `MenuScene`'s
  `cardStatusTexts`/`cardBorders` arrays were never reset in `create()`.
  This scene instance persists across `scene.start()` cycles (no fresh
  constructor call), and `createPlayerCards()` **pushes** onto those
  arrays every time it runs - so the second time `MenuScene` ran (the
  first time anything ever returned to it, via the new "Main Menu"
  button), the old already-destroyed Text/Rectangle objects stayed at
  indices 0-3 while the new ones landed at 4-7, and `refreshCardStatus()`
  (called every frame) kept calling `.setText()`/`.setColor()`/
  `.setAlpha()` on those destroyed indices-0-3 objects - the same class
  of bug as GameScene's restart-state-leak fix from a few entries back,
  just in a scene that had never had a way back into it until now. Fixed
  by resetting both arrays at the top of `create()`.
- **Found the real "black borders" cause.** Not a color/style typo -
  Phaser's `Text` `backgroundColor` renders as a canvas texture, and
  canvas textures bleed a dark fringe at their edges once the game
  canvas is scaled (`Phaser.Scale.FIT` always scales it here). Fixed at
  the root, not patched: every button in `MenuScene` and `GameScene`'s
  pause menu now uses an explicit `Rectangle` + `Text` pair instead of
  `Text`'s `backgroundColor` - a vector shape, no texture-edge bleeding
  possible. This was already the pattern the player cards used
  successfully; generalized to the mode toggle, Start button, pause-menu
  buttons, and quit-confirm buttons.
- **`MenuScene` redesigned for the current 1920×1200 arena.** Its layout
  was still sized for the original 960×600 design (title at `y: 60`,
  200×150 player cards, etc.) - tiny and clustered in the corner of the
  now-4x-larger canvas. Rebuilt at a clean 2x scale throughout (title
  128px at `y: 120`, 400×300 cards, etc.), filling the arena properly
  instead of leaving most of it dead space.
- **Menu volume sliders are now functional**, not inert placeholders.
  New `systems/AudioSettings.ts` - a small module-level singleton (one
  audio session per page load, nothing to construct) holding
  `musicVolume`/`sfxVolume` (defaults 50%/70%, matching HyperOut's own
  pause-menu slider defaults), session-only (no `localStorage` yet).
  `MenuScene`'s sliders are real drag targets (Phaser's native
  `setInteractive({ draggable: true })` + `input.setDraggable`, plus a
  click-to-jump rail) that persist the value and update whatever's
  currently playing live. `LoopingSound.ts` gained a `setVolume` helper
  (a `Phaser.Sound.BaseSound` → `WebAudioSound` cast lives in exactly one
  place now, since `BaseSound`'s own type has no `volume`/`setVolume` at
  all - only its concrete subclasses do, which is what every sound
  actually is at runtime) and `playLoopingSound` now takes a required
  `volume` parameter. Every `this.sound.play(...)` one-shot in
  `GameScene` now passes `{ volume: getSfxVolume() }` too.
- **Background trimmed**: the nebula wash is gone entirely, and the
  procedural moon is replaced by a second real photo, `jupiter.jpg`
  (640×640, copied into `src/assets/` and circular-clipped exactly like
  Earth, smaller radius, lower-left - same slot the moon used to occupy).
  `entities/Background.ts` lost `drawNebula`/`drawMoon` and gained a
  shared `drawPlanetPhoto` helper that both Earth and Jupiter now call.
  `docs/art_direction.md`'s "Twin Planets + Nebula Haze" section heading
  (and its one other cross-reference, in the Start-screen section) is
  now just "Twin Planets" - renamed rather than left stale.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (30/30 - 4 new
  tests for `AudioSettings`' clamping/independence), `npm run build` all
  clean.
- Confirmed `dist/assets/jupiter-*.jpg` exists post-build alongside the
  other bundled assets.

### Not done yet

- **Not seen/heard in an actual browser.** The Main Menu crash fix and
  the black-border root cause are both traced to specific, confident
  causes (not guessed), but "confident from code" isn't "confirmed by
  looking at it." The new menu layout's proportions, the slider drag
  feel, and Jupiter's size/position are all reasoned, not observed.
- No `localStorage` persistence for volume settings - resets to 50%/70%
  on every page load.

---

## 2026-08-22 — Escape-key menu navigation, replicated from HyperOut

### What was built

Read `hyperout/game.js`'s actual Escape handler and `hyperout/index.html`'s
`pauseMenu`/`quitMenu` panel markup directly (not going from memory or
guessing at the UX) and replicated the same state-machine exactly:

| HyperOut state | Escape does | Debris equivalent |
| --- | --- | --- |
| `MENU` | `openQuitConfirm()` | `MenuScene`, not confirming quit → show "QUIT GAME?" |
| `QUIT_CONFIRM` | `closeQuitConfirm()` | `MenuScene`, confirming quit → hide it |
| `PLAYING` | `pauseGame()` | `GameScene`, `'playing'` → `'paused'` |
| `PAUSED` | `resumeGame()` | `GameScene`, `'paused'` → `'playing'` |

- **`MenuScene`**: a persistent `keydown-ESC` listener toggles a new
  `confirmingQuit` flag, showing/hiding an opaque full-screen backdrop +
  "QUIT GAME?" / YES / NO (YES navigates to `/`, same "only resolves once
  deployed behind the portal" caveat as HyperOut's own `quitToPortal()`).
  The backdrop is `setInteractive()` so it also blocks clicks reaching
  the mode toggle/player cards/Start underneath - since MenuScene's
  elements aren't grouped in one container to hide/show as a unit, unlike
  HyperOut's actual DOM panels. Also added `if (this.confirmingQuit)
  return;` guards to every other click/Enter/Space handler, since a
  visual backdrop alone doesn't block keyboard shortcuts.
- **`GameScene`**: a new `'paused'` `SessionState`, entered by the same
  persistent Escape listener (only acts when `state` is exactly
  `'playing'` or `'paused'` - no effect during `'stageClear'`/
  `'gameOver'`, which still only respond to "any key" advancing them,
  unchanged). `enterPaused()` mirrors HyperOut's `pauseGame()` closely:
  `this.matter.world.pause()` (a real Phaser/Matter API - "a paused
  world will not run any simulations" - actually freezes physics, not
  just my own per-frame bookkeeping), stops the thrust-sound loop and
  resets `wasThrusting` (mirrors `muteEngines()` + the `boostHeld` reset,
  so resuming can't inherit a stuck thrust sound), and pauses (not stops)
  the gameplay music track. Shows "PAUSED" with Continue/Restart/Main
  Menu buttons - matching HyperOut's `pauseMenu` panel, deliberately
  skipping its live music/SFX volume sliders (Debris has no working
  volume system anywhere yet; real sliders here would be misleadingly
  the one functional control on the screen). Continue/Restart/Main Menu
  are click-only, matching HyperOut exactly (it has no keyboard
  shortcuts for them either).
- **`this.matter.world.pause()`/`.resume()` also added to the existing
  `enterStageClear()`/`beginNextLevel()`/`enterGameOver()`** - not
  strictly requested, but the same reasoning applies: those states were
  already meant to freeze gameplay, but Matter's own simulation doesn't
  know about a scene's custom state flag and would keep silently
  stepping (asteroids drifting, stale collision pairs still possible)
  during what's supposed to be a frozen overlay. Actually pausing the
  physics world is what makes "frozen" true, not just "my code stopped
  calling `.update()` on things."
- **`audio/LoopingSound.ts` gained `pauseSound`/`resumeSound`**, ported
  from Godspeed's original `MusicController.ts` (which had them; Debris's
  port deliberately left them out early on as "nothing calls them yet" -
  now something does). Distinct from `stopSound`: resuming picks back up
  from where it paused, not from the beginning - what pausing gameplay
  music actually needs, unlike the thrust sound's "always restart"
  requirement from a few entries ago.
- **`docs/controls.md`'s "Menu / system" section** - previously a
  placeholder ("not fixed here since there's no menu screen built yet") -
  now documents the actual `Esc` table above, replacing the placeholder
  with what's real. `docs/roadmap.md` item 9 updated to note it landed.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (26/26, unchanged
  - this is all Phaser scene/state wiring, no new pure rule logic), `npm
  run build` all clean.

### Not done yet

- **Not seen/heard in an actual browser.** In particular: whether
  `matter.world.pause()` mid-frame (called from inside `update()`, not a
  Matter event callback) has any visible hitch, whether the pause-menu
  backdrop's opacity reads well over frozen gameplay, and whether the
  quit-confirm backdrop actually blocks every click it's supposed to are
  all reasoned from the API docs and code, not observed.
- No keyboard/gamepad shortcuts for Restart/Main Menu or quit YES/NO -
  matches HyperOut's own scope exactly (click-only), not an oversight,
  but worth reconsidering given Debris already supports gamepad menus
  more broadly than HyperOut ever did.
- `window.location.href = '/'` on quit is unverified outside a real
  portal deployment, same standing caveat HyperOut's own code carries.

---

## 2026-08-22 — Ship destruction, stage-cleared flow, Shield power-up, play-field background

### What was built

Four requested pieces landed together, since the first two share a new
session-state machine:

- **A `SessionState` (`'playing' | 'stageClear' | 'gameOver'`) in
  `GameScene`.** All normal per-frame gameplay logic (input, ship/
  asteroid/projectile/shield updates, firing, wave-clear detection) is now
  gated behind `state === 'playing'` - during the other two states,
  everything freezes and a centered two-line overlay (`showOverlay`/
  `hideOverlay`) shows instead, waiting on the first keypress, gamepad
  button, or click (`waitForKeyPress`, mirroring `SplashScene`'s "any
  input" pattern).
- **Ship destruction**: an unshielded ship touching an asteroid now
  destroys the ship, plays `explosion2.wav`
  (`SHIP_DESTROYED_SFX_KEY`), stops the thrust loop if it was playing,
  and enters `'gameOver'` - "GAME OVER / PRESS ANY KEY TO RESTART",
  restarting via `this.scene.restart()`. Detected the same
  deferred-processing way as asteroid hits (`pendingShipHit`, processed
  in `update()`, never inside the Matter collision callback) for the
  same reason - see the last several entries' crash-fix lessons.
  **This is not the lives/respawn/invulnerability system from
  `docs/roadmap.md` item 5** - it's a simpler single-life stand-in
  (destroyed = round over), explicitly noted as such in the roadmap so
  it doesn't get mistaken for that item being done.
- **Stage cleared**: clearing all asteroids now pauses instead of
  instantly spawning the next wave - "STAGE CLEARED / PRESS ANY KEY FOR
  NEXT LEVEL" - and only spawns the next (larger) wave once a key/button/
  click advances past it.
- **`scene.restart()` surfaced a latent bug**: `GameScene`'s instance
  persists across a restart (no fresh constructor call), so several
  fields that were only ever set once, in the original `create()`, would
  have silently carried stale values (`lastFiredAtMs`, `wasThrusting`,
  the three pending-hit queues, `overlayTexts`) into a "fresh" restarted
  round. Added an explicit reset block for all of them in `create()`,
  since this is the first time `restart()` is ever actually called.
- **Shield power-up** (`src/entities/Shield.ts`): the "Diamond Core"
  visual decided in `docs/art_direction.md` (rotating diamond outline,
  independently pulsing center dot, both redrawn every frame since Matter
  handles the rotation transform but not the pulse), a sensor body
  (category `PICKUP`, mask `SHIP`) that drifts and wraps like everything
  else, spawning periodically (`SHIELD.spawnIntervalMs`, already
  configured; added `SHIELD.speed` for its drift). `Ship` gained
  `hasShield`/`grantShield`/`consumeShield` plus a thin sapphire ring
  drawn around the hull while charged. Semantics confirmed against
  Godspeed's actual `consumeShieldCharge` call site (not guessed): the
  shield absorbs exactly one hit, the ship survives with no life lost,
  the *asteroid* is unaffected (not destroyed) - a redundant pickup while
  already charged is still consumed (removed, SFX plays) but doesn't
  stack. `shield-up.wav` on pickup, also deferred-processed like the
  other collision outcomes.
- **Play-field background** (`src/entities/Background.ts`,
  `PlayfieldBackground`): the "Twin Planets + Nebula Haze" composition
  from `docs/art_direction.md` - two star layers, a low-opacity violet/
  cyan nebula wash (drawn from the existing player-color palette, not new
  colors), `earth.jpg` as a circular-clipped (Phaser `GeometryMask`)
  primary planet, and a small layered-circle procedural moon.
  **Redirected from the menu to the play field per explicit
  instruction** - `docs/art_direction.md` and `docs/roadmap.md` updated
  to describe this accurately rather than silently diverging from what
  they said. Instantiated first in `GameScene.create()` so it renders
  behind every gameplay entity (Phaser's display-list order), and
  `.update()`s every frame regardless of session state (cosmetic, no
  reason to freeze it during a pause overlay).
  **Simplified from the full spec**: only the near star layer actually
  drifts; both planets are static. The doc calls for "slow independent
  drift" on the planets too, but doing that for the real-photo Earth
  means moving its circular mask in lockstep with the image every frame
  - an extra per-frame failure mode for a subtle effect that couldn't be
  visually verified here anyway. Noted as a real gap in the roadmap, not
  swept under a "done."

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (26/26, unchanged
  - all four features are Phaser/Matter-integration code, not pure rule
  logic, matching this project's established testing boundary), `npm run
  build` all clean.
- Confirmed `dist/assets/earth-*.jpg`, `explosion2-*.wav`, and
  `shield-up-*.wav` all exist post-build alongside the earlier SFX/image
  assets.

### Not done yet

- **Not seen/heard in an actual browser** - same standing caveat as
  every entry so far, and this is the largest single batch of unverified
  visual/audio work yet: the background composition's actual balance
  (whether the nebula reads as "quiet enough to fight in front of," per
  the original design doc's stated risk), the stage-cleared/game-over
  overlay's readability and timing, the shield ring's visibility against
  the ship's own stroke color, and the earth mask's clip quality are all
  reasoned from code, not observed.
- Real lives/respawn/invulnerability (roadmap item 5) still doesn't
  exist - ship destruction is single-life-and-restart, as noted above.
- Planet/moon drift, the CRT scanline overlay, and screen shake/particle
  bursts on destruction are still open (see roadmap item 12's updated
  note).

---

## 2026-08-22 — Thrust sound effect, tied to the actual key state

### What was built

- **`debris/sfx/drive.wav`** is now the ship's engine sound: plays while
  thrust is held, stops the instant it's released, and always restarts
  from the beginning on the next press rather than resuming. Copied into
  `src/assets/`, loaded in `BootScene.preload()` (`THRUST_SFX_KEY` in
  `systems/Sfx.ts`), same bundling approach as the other two SFX.
  `GameScene.update()` tracks a new `wasThrusting` field and compares it
  against `this.input$.isThrusting` each frame to detect the press/release
  *edges* (not just the held state) - `stopSound` then `playLoopingSound`
  on the press edge (the `stopSound` first guards against a fresh press
  landing before a very recent release's stop has taken effect),
  `stopSound` alone on the release edge. Also stopped on scene `shutdown`
  so it can't keep looping into whatever scene comes next.
- **Renamed `audio/MusicController.ts` → `audio/LoopingSound.ts`**
  (`playLoopingMusic`/`stopMusic` → `playLoopingSound`/`stopSound`,
  updated at all three call sites: `SplashScene`, `MenuScene`,
  `GameScene`). It was already generic under the hood (just Phaser's
  Sound Manager, `loop: true`, an `isPlaying` guard) - the thrust sound
  needing exactly the same play/stop-and-reset behavior, just triggered
  by key state instead of scene lifecycle, was a second real use case
  that justified the more accurate name rather than importing a
  "music" function for an engine sound.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (26/26, unchanged),
  `npm run build` all clean.
- Confirmed `dist/assets/drive-*.wav` exists post-build (5.3 MB - a
  much bigger file than the other two SFX; worth a compression pass
  later if load time becomes a concern, not addressed here).

### Not done yet

- **Not heard in an actual browser.** In particular, the exact
  press/release timing (whether the `stopSound`-before-`playLoopingSound`
  guard is even necessary in practice, whether restarting instantly reads
  as abrupt vs. natural) is reasoned, not felt.
- No fade-out on release - it's a hard stop, matching the "once released
  stop it" ask literally, but worth revisiting if it sounds jarring.

---

## 2026-08-22 — Fixed ship spinning forever after bumping an asteroid

### What was built

Bug: the ship would start spinning on its own after colliding with an
asteroid, and never stop. Cause: turning was designed to be 100%
kinematic (`docs/gameplay.md`: only `setRotation()` from player input
changes heading), but the ship's Matter body was never told that -
a physical collision that hits it off-center imparts a real angular
impulse, same as any other Matter body would get. With
`SHIP.frictionAir: 0` (set two entries ago, deliberately, so the ship
never loses *linear* speed on its own) that impulse also never damped
back out, since the same `frictionAir` value governs angular velocity
too in Matter's integration - so one off-center bump left it spinning
at a constant rate forever.

Fixed in `Ship.ts`'s constructor: `this.visual.setFixedRotation()` right
after the body is created - a real Phaser/Matter API (`Transform`
component, already part of the `MatterGameObject<T>` type this project
uses) that sets body inertia to `Infinity`, so collisions physically
cannot rotate the ship at all. `setRotation()` is unaffected by this -
it sets angle directly regardless of inertia - so player-driven turning
still works exactly as before.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (26/26, unchanged),
  `npm run build` all clean.

### Not done yet

- Not confirmed in a real browser, per every entry so far - reasoned from
  reading Phaser's `Transform` component types and Matter's own angle-
  integration code, not observed.

---

## 2026-08-22 — First sound effects: shot and asteroid-hit; longer shots

### What was built

- **SFX**: `debris/sfx/laser2.wav` (shot) and `debris/sfx/explosion1.wav`
  (asteroid destroyed by a shot), picked from several options already
  sitting in that folder. Copied into `src/assets/` and loaded via ES
  import in `BootScene.preload()`, same bundling approach as
  `splash.png` (Vite's default asset extension list already covers
  `.wav`) - unlike `Music.ts`'s tracks, these aren't going through the
  `debris/music/` `publicDir`, so a new `src/systems/Sfx.ts` holds just
  the two texture-key-style constants, not URLs. Played as one-shot,
  non-looping sounds via `this.sound.play(key)` (no shared/idempotent
  instance needed the way looping music needs - unlike
  `playLoopingMusic`, overlapping plays are fine and expected for rapid
  fire) - `GameScene.fireProjectile()` plays the shot SFX,
  `destroyAsteroid()` plays the hit SFX.
- **Longer shots**: `PROJECTILE.lifetimeMs` doubled, `900` → `1800` -
  shots travel/persist twice as long before expiring. `SHIP.maxOnScreenShots`
  was already `4` (set in the very first playable-slice pass), so the
  "only 4 shots" half of the ask needed no code change, just confirming
  it's already true.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (26/26, unchanged
  - no new pure logic here), `npm run build` all clean.
- Confirmed `dist/assets/laser2-*.wav` and `dist/assets/explosion1-*.wav`
  exist post-build (hashed, matching source file sizes).

### Not done yet

- **Not heard in an actual browser** - same standing caveat as every
  audio-related entry so far.
- No volume control wired to these SFX either (matches music - the
  start-screen sliders are still inert/visual only).
- The other 6 files in `debris/sfx/` (`laser1.wav`, `laser3.wav`,
  `explosion2-4.wav`, `boss.wav`, `drone.wav`) aren't wired to anything -
  `boss.wav`/`drone.wav` in particular read like they're meant for
  Debris's own future enemy roster (`docs/roadmap.md`'s "Future ideas"
  section) or possibly carried over from Godspeed by mistake, not
  something to guess about and wire in unprompted.

---

## 2026-08-22 — Ship no longer decelerates on its own (crash confirmed fixed)

### What was built

Crash confirmed fixed by the previous entry's changes. New feedback: the
ship was still bleeding speed after thrust let off, when it shouldn't
lose any - there's no air in space. `SHIP.frictionAir` was `0.02`
(deliberately close to Matter's small default air-drag, per
`docs/technical_design.md`'s "realistic drift" framing, but not actually
zero). Set to `0`: velocity now only changes from `applyForce` while
actively thrusting, never decays on its own. Matches
`docs/technical_design.md`'s "the original ship really does carry
momentum... with very little friction" more literally than the previous
"close to default" compromise did.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (26/26, unchanged),
  `npm run build` all clean.

### Not done yet

- Not felt in a real browser - zero friction plus the retuned
  `thrustForce` together are what determine actual "hard to control"
  feel, and that combination still hasn't been played.

---

## 2026-08-22 — Actual crash root cause found; thrust force fixed

### What was built

Second round of feedback: shooting itself no longer crashed, but hitting
an asteroid with a shot still did, and the ship accelerated far too fast.
Both traced to real bugs, not just tuning.

- **The real "crash on hit" bug**: the previous entry's `pendingHits`
  deferral fixed a genuine risk (mutating the Matter world mid-step) but
  missed the actual cause. `GameScene.update()` calls
  `processPendingHits()` (which destroys the hit asteroid and spawns its
  split children) *before* the per-entity `forEach(update)` loops - but
  the dead-entity filter (`this.asteroids.filter(a => a.isAlive)`) ran
  *after* those loops, at the bottom of `update()`. So in the same frame
  an asteroid died, its `update()` still ran on it - calling Phaser
  `Graphics`/GameObject methods on an object that had already had
  `.destroy()` called on it, which throws. Fixed by moving both filters
  to run immediately after `processPendingHits()`, before anything else
  touches that frame's entity list (the original end-of-`update()`
  filters stay too, for projectiles that expire from their own lifetime
  mid-`update()`).
- **Ship accelerating far too fast**: a Matter.js integration detail I'd
  missed entirely. `Body.update()`'s Verlet integration does
  `velocity += (force / mass) * deltaTimeSquared`, and `deltaTime` there
  is in **milliseconds** (~16.67 by default) - so `deltaTimeSquared` is
  ~278, not ~1. `SHIP.thrustForce: 0.0018` was already probably too
  strong even before this session, but the arena-rescale's `SHIP.radius`
  16→8 quartered the ship's mass (`mass = density * area`, area ∝
  radius²) on top of that, quadrupling acceleration for the same force -
  reaching `maxSpeed` in roughly one frame. Fixed: `thrustForce` →
  `0.00003`, now reaching max speed over roughly 2-3 seconds of
  continuous thrust instead of instantly. Documented both gotchas
  directly in `GameConfig.ts` next to `SHIP`, same as the earlier
  velocity-units note.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (26/26, unchanged),
  `npm run build` all clean.

### Not done yet

- **Still not confirmed in a real browser.** Both fixes are reasoned from
  actually reading Matter's integration code this time (not inference
  from symptoms alone), so confidence is higher than the previous
  entry's crash fix - but "reasoned from source" isn't "seen working."
  If the crash or the acceleration feel is still off, the DevTools
  console (F12) remains the fastest way to pin down what's actually
  happening rather than another round of code-reading.
- `thrustForce: 0.00003` is a first estimate for "roughly 2-3s to max
  speed," not validated by feel - may still need retuning once played.

---

## 2026-08-22 — First real playtest fixes: arena size, a Matter velocity-unit bug, shoot crash

### What was built

First feedback from an actual browser session (everything before this was
structural verification only), three reported issues:

- **"Area must be 4x as big, scale ships and rocks down accordingly."**
  `ARENA_WIDTH`/`ARENA_HEIGHT`: 960×600 → 1920×1200 (2x each axis = 4x
  area). `SHIP.radius` 16→8, `SHIP_HULL_SCALE` 22→11, `ASTEROID` radii
  46/28/15 → 23/14/8. `spawnWave`'s spawn-ring distance in `GameScene.ts`
  scaled 2x (150-400 → 300-800) to match, so waves still spawn in a
  sensible ring around a now-bigger center instead of bunching near the
  old-arena-sized origin.
- **"Rocks are way too fast."** Root cause, not just retuning: Matter's
  `Body.update()` does `position += velocity` once per **physics tick**,
  and `setVelocity(x, y)` assigns that vector directly (confirmed by
  reading `node_modules/phaser/src/physics/matter-js/lib/body/Body.js`) -
  so a value fed into `setVelocity` is pixels-per-tick, and at Phaser's
  default 60 ticks/sec, real on-screen speed is roughly `value * 60`.
  `SHIP.maxSpeed` was already documented correctly ("px/step"); the
  `ASTEROID`/`UFO`/`PROJECTILE` speed constants weren't - they were sized
  as if `px/sec` and fed straight into `setVelocity`, making rocks ~60x
  faster on screen than intended (e.g. `large.speed: 40` meant ~2400
  px/sec across a then-960px-wide arena). Fixed by converting every one
  of those constants to real per-tick units (divide the old, intended
  px/sec by ~60) and documenting the gotcha directly in `GameConfig.ts`
  so `UFO`/`SHIELD` don't inherit it when they're actually wired in later.
- **"When I shoot, the game crashes."** Two independent contributing
  factors, both fixed:
  1. The velocity-unit bug above meant `PROJECTILE.speed: 480` was
     actually ~28,800 px/sec - an extreme value plausible enough to
     produce `NaN`/`Infinity` positions on collision resolution, which
     would then crash `Graphics`/`Arc` rendering (canvas APIs throw on
     non-finite coordinates). Fixed by the same unit correction
     (`PROJECTILE.speed` → `8`, ~480 px/sec, matching its old comment's
     *intended* value).
  2. Independent of that: `GameScene`'s `'collisionstart'` handler was
     directly calling `destroyAsteroid()`, which destroys Matter bodies
     and creates new ones (the split children) - synchronously, while
     Matter is still mid-step iterating its own collision pairs. Matter
     doesn't reliably tolerate the world being mutated from inside its
     own event dispatch. Fixed by queuing hits in a new `pendingHits`
     array during the event and only actually destroying/spawning bodies
     in `update()`, one frame layer removed from Matter's internals - a
     one-tick (~16ms) delay, imperceptible, but no longer mutating the
     world mid-step.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (26/26, unchanged),
  `npm run build` all clean.

### Not done yet

- **Still not confirmed in a real browser** - the crash fix is a
  well-reasoned code-review fix for the two most plausible causes I could
  find reading the collision/physics code, not a confirmed root-cause
  from an actual stack trace (this environment has no browser tool). If
  it still crashes, the browser DevTools console (F12 → Console) will
  show the actual uncaught error and stack trace, which would pin this
  down precisely instead of by inference.
- Ship speed/thrust/friction constants weren't touched in this pass -
  only what was reported (arena size, rock speed, the crash). Worth a
  separate look once the arena-size change is felt in a real session.

---

## 2026-08-22 — Splash screen and start menu (Boot → Splash → Menu → Game)

### What was built

The game no longer drops straight into gameplay. New flow:
`BootScene` (preload) → `SplashScene` → `MenuScene` → `GameScene`.

- **`SplashScene`**: user-provided `debris/artwork/splash.png` (copied to
  `src/assets/splash.png`, bundled/hashed by Vite like Godspeed's own
  image assets) rendered full-bleed with a cover-fit scale (`Math.max` of
  the two axis ratios, so a 1536×1024 source fills the 960×600 canvas
  without letterboxing). "PRESS ANY KEY" blinks at the bottom via a
  `Phaser.Tweens` alpha yoyo. Any keyboard key, gamepad button, or click
  advances to `Menu` (`this.input.keyboard/.gamepad/.` `once(...)`, each
  guarded by a single `advancing` flag so only the first input fires).
- **`MenuScene`**: the screen decided in `docs/art_direction.md` —
  glowing "DEBRIS" title, a control legend, a Cooperative/Competitive
  toggle, 4 player-status cards, inert volume-slider visuals, and an
  ungated Start (works for a solo P1, per the decided design). Each
  player card shows a small `SHIP_HULL`-based ship icon in that player's
  color; P1/P2 have a `[change]` toggle between keyboard and gamepad
  (default keyboard), P3/P4 are gamepad-only with no toggle shown.
  Real Gamepad-API connection detection (`this.input.gamepad.getAll()`,
  polled every `update()`) drives each card's READY/WAITING status via a
  new pure function, `computeGamepadReadiness` (`systems/
  GamepadAssignment.ts`, tested in `tests/gamepadAssignment.test.ts`) —
  claims connected controllers in P1→P2→P3→P4 order among only the
  slots currently set to gamepad, per `docs/controls.md`.
- **`main.ts`**: registers both new scenes and turns on
  `input: { gamepad: true }` (off by default in Phaser) so the menu's
  connection detection actually receives events.
- **Music**: `menu.mp3` now starts in `SplashScene` and carries through
  `MenuScene` unchanged (`playLoopingMusic`'s `isPlaying` guard prevents
  a restart on the scene switch); `GameScene.create()` now calls
  `stopMusic(this, MENU_MUSIC_KEY)` before starting the gameplay track.
- New `src/utilities/Color.ts` (`toCssHex`) converts the numeric hex
  colors in `GameConfig.COLORS` to CSS hex strings for Phaser text/stroke
  styling — several scenes needed this, worth the one shared helper.

**Deliberately not built in this slice**, to keep scope honest:

- The Twin-Planets/nebula/`earth.jpg` background from `docs/art_direction.md`
  — `MenuScene` uses a flat `COLORS.background` fill for now. That's
  roadmap item 12 (visual-polish pass), not this one.
- **The mode toggle and per-slot input source picked in `MenuScene` are
  cosmetic only.** `startGame()` just calls `this.scene.start('Game')`
  with no data — `GameScene` still always builds the same single
  P1-keyboard ship regardless of what was selected. Wiring the menu's
  choices into actual gameplay is roadmap items 7/8/10/11 (Cooperative/
  Competitive logic, P2 keyboard, real gamepad gameplay input), each a
  separate, larger piece of work than the menu screen itself.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (26/26 — 4 new
  tests for `computeGamepadReadiness`), `npm run build` all clean.
- Confirmed `dist/assets/splash-*.png` exists post-build (hashed,
  ~2.4 MB, as expected for a full splash image).
- Dev server smoke-checked via `curl`: `/`, `/src/main.ts`, `/menu.mp3`,
  and `/src/assets/splash.png` (dev-mode Vite resolution) all return
  `200`.

### Not done yet

- **Not seen/heard in an actual browser** — same standing caveat as
  every entry so far. In particular: the blinking-prompt timing, whether
  "cover fit" crops splash.png acceptably at 960×600, whether the
  player-card layout reads well, and whether real hardware gamepads are
  actually detected by `this.input.gamepad` the way the code assumes —
  none of this has been seen running, only reasoned about and
  structurally verified.
- No `Esc`-to-go-back from Menu to Splash, no pause menu — out of scope
  for this ask.
- See "Deliberately not built" above for the two known gaps in menu
  fidelity/wiring.

---

## 2026-08-22 — Background music wired in (gameplay track playing, menu track staged)

### What was built

Un-defers background music from `docs/roadmap.md`'s "Explicitly deferred
past v1" list (sound *effects* stay deferred). Ported Godspeed's audio
architecture exactly:

- `debris/music/` (sibling to `debris/game/`, same as
  `godspeed/music/`) holds `menu.mp3` and `neon-horizon.mp3` (user-
  provided tracks — menu music and in-game music respectively).
- `vite.config.ts`: `publicDir: '../music'` so both files are served
  as-is (dev) and copied into `dist/` (build) without an import.
- `src/systems/Music.ts`: track keys/URLs (`MENU_MUSIC_KEY`/`_URL`,
  `GAMEPLAY_MUSIC_KEY`/`_URL`).
- `src/audio/MusicController.ts`: `playLoopingMusic`/`stopMusic` helpers
  over Phaser's game-global sound manager — ported from Godspeed's
  identical file, trimmed to the two functions actually used so far
  (no `pauseMusic`/`resumeMusic` yet, nothing calls them).
- `BootScene.preload()` loads both tracks via `this.load.audio(...)`.
- `GameScene.create()` calls `playLoopingMusic(this, GAMEPLAY_MUSIC_KEY)`
  — the in-game track now loops during play.
- `menu.mp3` is loaded and keyed but **nothing plays it yet** — there's
  no menu scene to trigger it from (`docs/roadmap.md` item 9, still
  unbuilt). It'll get wired to that scene's `create()` when it exists.

Also added `src/vite-env.d.ts` (`/// <reference types="vite/client" />`)
— missing from the original scaffold, needed for `import.meta.env`
to type-check; Godspeed has the equivalent file and this was a gap in
otherwise mirroring its config.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (22/22, unchanged
  — no new pure logic to test here), `npm run build` all clean.
- Confirmed `dist/menu.mp3` and `dist/neon-horizon.mp3` exist after
  build (proves `publicDir` copying actually works, not just configured).
- Dev server smoke-checked via `curl`: both `/menu.mp3` and
  `/neon-horizon.mp3` return `200`.

### Not done yet

- **Not heard playing in an actual browser** — same standing caveat as
  the rest of this project so far, no browser tool in this environment.
  Browser autoplay policy may block the very first `play()` call until
  a user gesture; Phaser's sound manager auto-unlocks on the first
  keydown/pointerdown so this should self-resolve once a player touches
  a control, but that's untested, not verified.
- No fade in/out, no volume control wired up (matches Godspeed — it has
  neither either). The start-screen mockup's volume sliders are still
  inert/scaffolded only.
- `menu.mp3` doesn't play anywhere yet, pending the menu scene itself.

---

## 2026-08-22 — First playable slice: `debris/game/` scaffolded, P1 ship + asteroid field

### What was built

Project scaffolding for `debris/game/`, mirroring Godspeed's tooling
exactly: Vite + TypeScript + Phaser 3, ESLint flat config, Prettier,
Vitest (`package.json`, `tsconfig.json`, `eslint.config.js`,
`.prettierrc.json`, `vitest.config.ts` all byte-identical or adapted only
where necessary — dev port 5175, `base: '/debris/'` on build).

On top of that, a first playable slice proving out the physics and
collision architecture `docs/technical_design.md` decided ahead of time:

- **Matter.js integration** (`src/main.ts`): `physics.matter.gravity =
  {x:0,y:0}`, scenes `[BootScene, GameScene]`.
- **Ship** (`src/entities/Ship.ts`): Matter-body-driven, "realistic drift"
  per the technical-design decision — thrust is a real `applyForce`
  impulse, turning is direct/kinematic (`setRotation` from input, no
  torque), matching `docs/gameplay.md`'s "Turn... does not move it."
  Circular collision hitbox decoupled from the drawn Interceptor hull
  (`SHIP_HULL` in `GameConfig.ts`), same pattern as Godspeed's entities.
- **Asteroid** (`src/entities/Asteroid.ts`): procedural jagged polygon
  (`systems/AsteroidShape.ts`, pure/seedable), circular Matter body,
  per-tier speed/radius/score (`smaller-is-faster`, "Classic inverse-size"
  scoring), splits large→medium→small on hit via
  `systems/AsteroidSplit.ts` (randomized spread, `SPLIT_SPREAD_RAD =
  Math.PI/3`). No rock-on-rock collision — enforced structurally via the
  Matter collision mask in `systems/CollisionCategories.ts`, not a manual
  per-pair check.
- **Projectile** (`src/entities/Projectile.ts`): constant-velocity,
  `isSensor: true` (Matter still owns hit *detection*, no physics
  *response* needed — the "pragmatic mix" testing-boundary decision),
  expires after `PROJECTILE.lifetimeMs`.
- **Screen-wrap** (`systems/MovementSystem.ts`): ship, asteroids, and
  projectiles all wrap once fully offscreen.
- **Keyboard input** (`src/input/KeyboardInput.ts`): tracks raw
  `KeyboardEvent.code` strings rather than Phaser's `KeyCodes` enum —
  required because Phaser can't distinguish left/right Ctrl, which is
  what makes the P2 "Right Ctrl" binding in `docs/controls.md` actually
  implementable later, not just a documented risk. `P1_BINDINGS` is wired
  into `GameScene` now; `P2_BINDINGS` exists but isn't instantiated yet.
- **GameScene** (`src/scenes/GameScene.ts`): wires all of the above
  together — one P1 ship, a procedural asteroid field that respawns
  (growing) once cleared, shooting with a fire-rate/on-screen-shot cap,
  collision-driven splitting and scoring, shown live via a simple score
  readout.

This is a deliberate first slice, not an attempt at all of v1 — same
incremental pattern Godspeed was built in. See `docs/roadmap.md` for what
this does and doesn't cover yet.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run` (22/22 across
  `asteroidShape`, `asteroidSplit`, `movementSystem`, `combatSystem`),
  `npm run build` all clean.
- Dev server (`npx vite --port 5175`) smoke-checked via `curl`: `/` and
  `/src/main.ts` both return `200` and serve the expected HTML/module.

### Not done yet

- **Not seen running in an actual browser** — this environment has no
  browser tool, only structural/serving verification (tsc, tests, build,
  curl). Ship "feel" (thrust force, max speed, friction — all flagged
  `unverified starting point` in `GameConfig.ts`) has not been playtested
  and should be expected to need retuning.
- P2 keyboard, any gamepad input, UFO, Shield pickup, lives/respawn/game
  over, Cooperative/Competitive mode logic, the already-designed
  HyperOut-style start menu, the synthwave/CRT visual pass, and
  deployment wiring are all still unbuilt — see `docs/roadmap.md`.
