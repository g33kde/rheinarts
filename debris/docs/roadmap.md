# Roadmap

Nothing here is built yet — this is the plan, not a status report. Update
checkboxes as work actually lands, same convention as Godspeed's roadmap.

## v1 scope

1. [x] Ship: turn, thrust (momentum-based), shoot — first playable slice,
   see CHANGELOG. Matter-driven thrust/drift, kinematic turn, cooldown-
   limited fire; wired to both P1 and P2 ships in `GameScene` now (see
   CHANGELOG - each with an independent fire cooldown/on-screen-shot cap)
2. [x] Screen-wrap arena — ship, asteroids, and projectiles all wrap
3. [x] Asteroids: spawn wave, drift, split large → medium → small on hit,
   smaller-is-faster, randomized split spread, procedural shape generation
   (decided — see `docs/art_direction.md`, no art assets needed) — all
   landed and playtested (several rounds of real bug fixes since, see
   CHANGELOG), plus a "stage cleared, press any key for next level" pause
   between waves that wasn't originally scoped here but fits naturally
4. [x] UFO: periodic spawn, drifts across arena, fires at nearest player
   — landed (see CHANGELOG): "Classic Saucer" visual per
   `docs/art_direction.md`, enters from a random edge on a roughly-
   cross-arena heading, wraps like everything else, fires a lead-the-
   target shot (single-pass prediction + moderate random spread,
   `systems/UfoTargeting.ts`, tested) at the nearest live ship on its own
   cooldown. Several behaviors resolved via `AskUserQuestion` rather than
   guessed: no cap on concurrent UFOs (the spawn timer doesn't check
   whether one's still alive), ramming a UFO with a ship destroys both
   (not just the ship - the ship's shield can still save the ship half),
   destroying it with a shot is worth `UFO.score` (200, kept at the
   original placeholder), aim spread is `±18°` uniform random on top of
   the predicted lead angle. UFO SFX (spawn, its own shot, a dedicated
   destruction sound) are still the one remaining sound gap - destroying
   one currently reuses the ship-destruction explosion
5. [x] Lives, respawn-with-invulnerability, scoring — landed (see
   CHANGELOG). Each `PlayerSlot` now tracks its own `lives` (starts at
   `LIVES_PER_PLAYER`, 3), independent of score - true even in
   Cooperative, where score is still pooled but lives never were. An
   unshielded hit destroys the ship, spends one life, and (if any remain)
   queues a respawn: explode → `SHIP.respawnDelayMs` (1000ms, a starting
   guess) dead beat → reappear at the player's own original spawn point,
   already invulnerable for `SHIP.respawnInvulnerabilityMs` (2000ms,
   pre-existing config value). Decided via `AskUserQuestion`: invulnerable
   ships can move/turn freely but can't fire; the flicker (blink every
   100ms while invulnerable, `Ship.draw()`) is the only visual tell.
   Round-outcome logic (`aliveFlagsBySlot`) now keys off "has lives left"
   rather than "has a ship on screen this exact frame" - a player
   mid-respawn-delay hasn't lost, in either mode; a life-0 hit is what's
   actually permanent for the round now, not the first hit. New HUD line
   (`P1 ●●●   P2 ●○○` etc., filled = held / hollow = spent) shows every
   active player's remaining lives at a glance, separate from the score
   line since Cooperative pools one but not the other.
6. [x] Shield power-up: pickup, single non-stacking charge, absorbs one hit
   — Diamond Core visual (`docs/art_direction.md`), drifts and wraps like
   everything else, spawns on `SHIELD.spawnIntervalMs`, absorbs exactly
   one asteroid hit (ship survives, charge consumed, asteroid untouched -
   same semantics as Godspeed's Shield, confirmed by reading its
   `consumeShieldCharge` call site), `shield-up.wav` on pickup, a thin
   sapphire ring on the ship while charged
7. [x] Cooperative mode (shared arena, no friendly fire, individual lives)
   — landed as the default mode (see CHANGELOG): no friendly fire is
   enforced structurally, not just by convention - `Ship`'s own Matter
   collision mask excludes other ships entirely in this mode (they pass
   through each other, not just "no damage"), and `Projectile`'s mask
   never carries `CATEGORY.SHIP`. **"Individual lives" is still the
   item 5 simplification**: each ship is destroyed independently (one
   player dying doesn't end the round for the other), but there's no
   3-lives counter or respawn - a destroyed ship is gone for the round,
   same gap item 5 already documents
8. [x] Competitive mode (shared arena, friendly fire on, last ship standing)
   — landed (see CHANGELOG): player shots and ship-to-ship ramming are
   both mutually lethal (a shooter is immune to their own shot via
   `ownerIndex`, since a shot spawns exactly at its firing ship's
   position), each player's score is tracked and shown separately
   instead of pooled, and the round ends the instant only one ship
   remains - `systems/RoundOutcome.ts`'s `evaluateRoundOutcome`, tested,
   also handles the draw case (last two ships destroyed in the same
   instant). **Not done**: Best-of-N round structure (explicitly a v1
   nice-to-have per docs/gameplay.md, not required for the mode to
   work) and the same lives/respawn gap as item 7
9. [x] Start screen / menu (decided — see `docs/art_direction.md`): title,
   mode-select toggle, 4 live player-status cards, Start (no gating,
   solo P1 allowed), functional volume sliders — `SplashScene`
   (user-provided `artwork/splash.png`, blinking "PRESS ANY KEY", any
   key/gamepad button/click advances) and `MenuScene` (title,
   Cooperative/Competitive toggle, 4 player cards with real Gamepad-API
   connection detection in `docs/controls.md`'s priority order, P1/P2
   keyboard⇄gamepad toggle, ungated Start) both landed this slice,
   `asteroid-field.mp3` now plays across both (was `menu.mp3`, swapped
   on request) — see CHANGELOG. Music/SFX volume
   sliders are no longer inert either: draggable, live, backed by
   `systems/AudioSettings.ts`, applied everywhere a sound plays (not just
   this screen), and persisted across reloads via `localStorage` (same
   pattern as HyperOut's own settings persistence). `Esc` navigation also
   landed, replicating HyperOut's
   exactly (see `docs/controls.md`'s "Menu / system" table and CHANGELOG):
   quit-confirm from the menu, pause (Continue/Restart/Main Menu) from
   play. The mode toggle is consumed now too (`scene.start('Game', {
   mode })`, see items 7/8 and CHANGELOG) - the one piece still not
   consumed is the P1/P2 keyboard⇄gamepad toggle, which is really item
   11's gap (gamepad input doesn't exist to switch to yet), not this
   item's. The Twin-Planets background is no longer this item's
   blocker either: per explicit instruction it was built for the *play
   field* instead of the menu (see item 12 and CHANGELOG) - the menu's
   background stays a flat color deliberately, not as a gap
10. [x] Keyboard input: Player 1 (WASD+Space), Player 2 (Arrows+RCtrl) —
    both wired into `GameScene` now (see CHANGELOG): two `Ship`s, two
    independent `KeyboardInput` instances, per-player fire cooldown and
    on-screen-shot cap (`Projectile` gained `ownerIndex` so P1's shots
    don't eat into P2's budget or vice versa), one shared engine-sound
    loop across however many ships are actually thrusting. **Not** the
    "switchable to gamepad" half of this item, nor `MenuScene`'s P1/P2
    keyboard⇄gamepad toggle being consumed - both ships are keyboard-only
    regardless of what's selected on the menu; that's item 11's gap
    (gamepad input doesn't exist to switch to yet), not this one
11. [x] Gamepad input: any of the 4 slots (Gamepad API, stick/D-pad +
    trigger + face button), connection-order assignment across up to
    4 simultaneous controllers, not just 2 — landed (see CHANGELOG):
    `input/GamepadInput.ts` implements the same `PlayerInput` interface
    `KeyboardInput` does, reading the Standard Gamepad API mapping from
    `docs/controls.md` (left stick X or D-pad left/right to turn — D-pad
    wins on disagreement — right trigger to thrust, bottom face button to
    fire; `systems/GamepadInputMapping.ts`'s `computeGamepadTurnDirection`,
    tested). `MenuScene` now actually passes its per-slot `sources`
    selection into `GameScene` via `scene.start('Game', { mode, sources
    })` (previously collected but unused past item 9's display cards).
    `GameScene.buildPlayers()` builds up to 4 ships from `sources` +
    however many gamepads are connected *right now* at round start, via
    `systems/GamepadAssignment.ts`'s `computeSlotAssignments` — the same
    connection-order-priority function the menu's own READY/WAITING cards
    already used, so a slot the menu shows as WAITING never silently gets
    a ship. This made the player roster genuinely variable-size (1-4, not
    always exactly 2) for the first time, which exposed a real bug caught
    before it shipped: `winnerIndex`, fire-budget filtering, self-hit
    immunity, and the score HUD were all keying off array position instead
    of actual player number, which breaks the moment any slot is inactive
    (e.g. only P1 and P3 active). Fixed by introducing `PlayerSlot.slotIndex`
    as the one stable "which player" identity and auditing every consumer.
    **Known simplification, matches `docs/controls.md`'s own accepted
    gap**: a `GamepadInput` binds to one specific `Gamepad` object at round
    start and doesn't try to recover from a mid-round disconnect/reconnect.
12. [x] Synthwave/CRT visual pass (see `docs/art_direction.md`) — the
    "Twin Planets" background (name no longer includes "+ Nebula Haze" -
    that wash was removed on request) landed on the play field (star
    layers, `earth.jpg` and `jupiter.jpg` both circular-clipped - see
    CHANGELOG), redirected there from the menu per an earlier explicit
    instruction (doc updated), then trimmed further per a later one: no
    nebula wash, the procedural moon replaced by `jupiter.jpg` instead of
    kept. Simplified from the full spec: both planets are static, only
    the near star layer actually drifts.

    The remaining four pieces (see CHANGELOG), scoped via `AskUserQuestion`:
    - **CRT scanline/vignette overlay** — landed, a direct port of
      HyperOut's own `.crt` div (`hyperout/style.css`) into `index.html`,
      fixed over the whole viewport rather than scoped to the canvas so
      it still covers FIT-mode letterbox bars.
    - **Screen shake + particle bursts on destruction** — landed for
      ship, asteroid, and UFO destruction. Decided: bigger deaths shake
      harder (ship/UFO get `EFFECTS.majorShake`, an asteroid gets the
      lighter `EFFECTS.minorShake`, not one flat intensity), and burst
      particles are colored to match what died (a player's own color for
      their ship, the neutral asteroid grey, the UFO's red) rather than a
      uniform spark color. `entities/DestructionBurst.ts` is a hand-managed
      `Graphics` object (same pattern as every other entity here), not
      Phaser's `ParticleEmitter`. Camera shake respects
      `prefers-reduced-motion`, same courtesy HyperOut's own shake extends;
      particle bursts aren't gated by it.
    - **Rhein Arts logo on `SplashScene`** — landed, matching HyperOut's
      own splash screen exactly (`hyperout/index.html`'s
      `.splash-credit`/`.splash-logo`): bottom-right, `right: 12%; bottom:
      2.5%; width: 15%` of the splash art's own box (the full arena canvas,
      since `splash.png` is cover-scaled to fill it), ~0.95 opacity, not
      interactive. `debris/game/src/assets/rhein-arts.png` is now its own
      copy (previously only `web/img/` had one).
    - **Polish pass on the ship/asteroid/UFO shapes** — explicitly
      **skipped this pass**, per the answer to `AskUserQuestion`: too
      open-ended to scope without a clearer brief (the roadmap's own text
      never specified more than "any polish pass"). **Landed later, see
      item 24** - got the real brief this pass was missing, via a
      live-rendered concept sheet.

    All tuning values (shake intensity/duration, particle count/speed/
    lifespan) are starting guesses in `GameConfig.ts`'s new `EFFECTS`
    block, not playtested - no way to feel out "punchy vs. excessive" in
    this environment.
13. [x] Deploy alongside HyperOut/Godspeed, cabinet listing on the portal
    — see CHANGELOG. Root `Dockerfile` has a `debris-build` stage
    (mirrors Godspeed's exactly), served at `/debris/`; `nginx.conf` gets
    a `/debris` → `/debris/` redirect; `web/index.html` has a real
    Debris cabinet (labeled `PLAYABLE`, not `BETA` - matches HyperOut,
    not Godspeed) replacing the last "coming soon" slot, thumbnail is
    `splash.png` reused as `web/img/debris.png`. Local build + curl
    verified end-to-end (portal, `/debris` redirect, index, JS bundle,
    both music tracks, a bundled SFX asset, `/healthz`, HyperOut/Godspeed
    unaffected). **Not yet pushed to GHCR or applied to the cluster** -
    that's the user's call to make (credentials + a shared/live
    cluster), not something to do unprompted, same standing pattern as
    Godspeed's own deploy
14. [x] Single Player mode — not originally scoped (added after the
    initial v1 list, on request), landed as a third mode-toggle option
    alongside Cooperative/Competitive (see CHANGELOG). Scoped via
    `AskUserQuestion` rather than guessed: a third segmented button on the
    existing toggle (not a separate entry point), **locked to exactly one
    ship** (`GameScene.buildPlayers()` slices `sources` to length 1
    regardless of what P2-P4's cards show; `MenuScene` reflects the same
    lock, showing LOCKED on those cards and dimming P2's now-inert
    keyboard⇄gamepad toggle). **Uses the standard 3-lives/respawn system,
    the same one Competitive uses** - not Cooperative's own ruleset,
    which later diverged into its own Emergency Ejection & Rescue
    mechanic (item 15) with nobody around to rescue a solo player anyway.
    `evaluateRoundOutcome` didn't need a new branch either way: it just
    reads `!eliminated` uniformly, and Single Player sets that the same
    way Competitive does (lives hitting 0). The actual distinguishing
    feature at the time: a personal high score, persisted via
    `localStorage` - **since superseded by item 16's global leaderboard**,
    see that entry (this one's own `systems/HighScore.ts` no longer
    exists). Solo play also spawns dead-center rather than at P1's usual
    diamond corner - the corner positions exist to keep simultaneous
    players apart, which doesn't apply with one ship.
15. [x] Emergency Ejection & Rescue (Cooperative-only) — not originally
    scoped; implements and resolves the "Co-op rescue mechanics" Future
    Idea below (see that entry for how the open questions there were
    actually decided, several differently than speculated). Landed on
    request, full detail in `docs/gameplay.md`'s section of the same
    name and `docs/art_direction.md`'s "Commander"/"Space Station"
    entries - see CHANGELOG. Summary: an unshielded Cooperative hit
    ejects the pilot as a drifting `Commander` instead of costing a life
    (lives stop mattering in this mode entirely); pickup is automatic on
    touch and alone saves the life; the rescuer tows them to a
    fixed-center `SpaceStation` to respawn them there; not rescued within
    `COMMANDER.rescueWindowMs` (10s), or caught by an asteroid/UFO while
    adrift, permanently eliminates that player. New pure logic in
    `systems/CommanderRescue.ts` (window-expiry check, tow-position
    geometry, drop-off distance check), tested.
16. [x] Global top-10 high score leaderboard (Single Player) — not
    originally scoped; requested as "make the Single Player best score
    permanent even if the server reboots," which turned out (via
    `AskUserQuestion`) to mean a real shared leaderboard with
    classic-arcade 3-letter initials entry, not just a storage-location
    swap for the personal best item 14 had. **Rhein Arts' first backend
    service** - `debris/highscore-api`, a small standalone `node:http`
    server (no framework), its own `Deployment`/`Service`/
    `PersistentVolumeClaim` in `k8s/rheinarts.yaml` (deliberately
    `replicas: 1`, separate from the `rheinarts` Deployment's `replicas: 2`
    - see that manifest's comment for why two pods can't safely share
    one `ReadWriteOnce` volume), reached through nginx's new
    `/api/debris/` proxy rather than a local process. See CHANGELOG for
    the full build, including two real bugs caught by actually running
    the built Docker image rather than trusting the config on paper: a
    literal upstream hostname in `nginx.conf` made nginx refuse to start
    *at all* if the API wasn't resolvable yet (would have taken down the
    entire portal, not just the leaderboard), and Vite's dev proxy
    doesn't strip a path prefix by default the way nginx's `proxy_pass`
    does. `systems/HighScore.ts` (item 14's `localStorage` version) is
    gone, fully replaced.
17. [x] Gravity Well (mode-agnostic black hole) — not originally scoped;
    requested directly as "Black hole that can appear," which implements
    the "Gravity anomalies" hazard the speculative Chaos Meter idea below
    already sketched (that idea remains unbuilt - this landed as its own
    standalone hazard instead of gated behind it, since the Chaos Meter
    itself doesn't exist). Full detail in `docs/gameplay.md`'s section of
    the same name and `docs/art_direction.md`'s "Black Hole" entry - see
    CHANGELOG. Scoped via `AskUserQuestion` on the core mechanic before
    any visual work, then a live-rendered concept comparison (four
    options, the fourth added mid-review after the user linked
    [NASA's own black hole visualization](https://svs.gsfc.nasa.gov/13326)
    as a reference) before implementation. Summary: three concentric
    radii - an outer force-based pull a ship can out-thrust, an event
    horizon past which nothing (not even thrust) gets you back out, and a
    tiny lethal center a Shield still saves you from (ejecting you back
    out past the event horizon instead). Pulls ships, asteroids, the UFO,
    Shield pickups, and adrift Commanders alike. New pure logic in
    `systems/BlackHoleGravity.ts` (force/capture/lethal calculations),
    tested. **Follow-up, requested directly**: retimed - "not before 2
    min into any stage, gives players time to clear the rocks first,"
    decided (`BLACK_HOLE.minStageElapsedMs`, measured against
    `stageElapsedMs` so every stage gets its own fresh grace period, not
    just the round's first one); active duration shortened from 30s to
    15s (`activeDurationMs`); and a 5-second warning
    (`BLACK_HOLE.approachWarningMs`) now plays `black-hole-approaching.mp3`
    once, timed off whichever of the post-despawn pause or the stage
    grace period is more restrictive at that moment
    (`GameScene.update()`'s black-hole spawn check).
18. [x] Score popup on hit — not originally scoped; requested directly.
    A small `+<points>` number appears where a shot lands, in the
    scoring player's own HUD color, drifts/fades away
    (`entities/ScorePopup.ts`). Full detail in `docs/gameplay.md`'s
    Asteroids section and `docs/art_direction.md`'s "Score popup" entry.
    Reviewed as three live-rendered motion concepts before
    implementation, then the chosen one (Drift & Glow) re-reviewed at
    true 1:1 pixel scale against a real small-rock silhouette after a
    follow-up request to size it down to "the smallest rocks" -
    `GameConfig.ts`'s `SCORE_POPUP`.
19. [x] The Fracture — not originally scoped; requested directly, built
    in two passes. **Pass 1** (entry sequence): after the very first
    stage clear of a round (all three modes), a 3-second "THE FRACTURE"
    banner (`GameScene.showFractureAnnouncement()`, the game's first
    non-interactive timed overlay - every other one waits for a
    keypress), then it fades/scales in at top-middle together with 4
    large asteroids (`FRACTURE.spawnAsteroidCount`, spawned via the
    existing `spawnWave()`). "Shard Cluster," chosen via a live concept
    review - jagged crystal shards tethered to a pulsing core, reusing
    `systems/AsteroidShape.ts`'s existing jagged-polygon generator rather
    than a new one. **Pass 2** (the actual Core → Fragment → Swarm
    escalation from "The Fracture" below, on request): the Core
    (`entities/Fracture.ts`, `FRACTURE.maxHits` = 20) splitting on death
    into 3 Fragments (`entities/FractureFragment.ts`,
    `fragmentMaxHits` = 10 each, one per role - 🔴 aggressive, 🔵 gravity
    reusing the Black Hole's own violet, 🟡 launcher in a new gold -
    visual/idle-animation flavor only, not distinct gameplay behavior
    yet), each of those splitting on death into
    `FRACTURE.swarmCountPerFragment` (6) Swarm bits
    (`entities/FractureSwarmBit.ts`, `swarmMaxHits` = 1 - one-shot, like
    every other enemy in the game). Debris's first multi-hit enemy at
    every tier (`systems/FractureCombat.ts`, tested) - everything else
    dies in one shot. Fragments and Swarm bits actually move (unlike the
    stationary Core), decided directly - plain constant-velocity drift,
    "smaller is faster" across the three tiers, same convention
    `docs/gameplay.md` already uses for asteroid size tiers. The
    stage-clear condition requires every tier dead, not just the rocks
    ("must defeat The Fracture fully," decided via `AskUserQuestion`
    back in Pass 1) - extended to cover Fragments/Swarm too, not just the
    Core. **Also decided in Pass 2**: the Black Hole no longer spawns for
    the duration of the whole encounter (`GameScene.
    isFractureEncounterActive()`) - a boss fight and an unrelated
    screen-wide hazard piling on top of each other wasn't the intent.
    **Pass 3** (real attacks + ship contact + Swarm redesigned as a
    pickup, on request, `AskUserQuestion`d on the load-bearing forks
    first): the Core now spawns off-screen above top-center and drifts
    down to arena-center before stopping (`FRACTURE.driftSpeedPxPerStep`),
    then fires a long laser in a random direction every 2s
    (`entities/FractureLaser.ts` - not Matter-backed, a pure point-to-
    segment hit-test in `systems/BeamGeometry.ts`, tested). Each Fragment
    role is now a real attack instead of a cosmetic flourish: 🔴
    aggressive fires a pulsing ring out to 3x its own radius every 5s
    (`systems/FractureRing.ts`, tested); 🔵 gravity pulls everything
    (ships/asteroids/UFOs/Shields/adrift Commanders) within 3x its own
    radius, reusing `systems/BlackHoleGravity.ts`'s force math directly;
    🟡 launcher fires a gold shard (`entities/FractureShard.ts`) at a
    random living ship every 3s. **The Core and every Fragment now kill
    an unshielded ship on contact** ("behave like rocks," decided) - the
    same `pendingShipHits` path an asteroid ram already uses; the
    Fracture side takes no damage from it, same as an asteroid doesn't
    either. **Swarm is no longer shootable at all - always safe to
    touch, decided**: collecting one adds 1 to that player's `scrap`
    count, shown in their HUD once nonzero. Once the last Fragment dies,
    a 10-second on-screen countdown starts
    (`FRACTURE.scrapCollectionMs`); whatever's uncollected when it ends
    is just gone - clearing the stage never required collecting it, only
    defeating the Core/Fragments. **Also decided in Pass 3**: an
    already-active Black Hole is now force-despawned the instant the
    Core materializes, not just blocked from spawning fresh.
    **Deliberately still not built**: asteroid contact (still only ships
    and a player's own shot can touch any tier), and the death/implosion
    sequence - a lethal hit at the Core/Fragment tiers still just
    destroys/splits it outright. **Pass 4** (Swarm's visual redesign,
    requested directly, mockup reviewed first - "floating parts," not a
    small rock): the plain jagged-shard look is gone, replaced by a
    blocky tetromino-shaped fragment (one of the 7 standard Tetris
    layouts, picked randomly per spawn, scaled to a consistent footprint
    regardless of the shape's own natural bounding box) - dark metal
    plating with a pulsing muted-jade glow (`COLORS.scrap`, chosen over
    gold/copper/green candidates compared live - pure green was ruled
    out outright, too close to Player 4's own acid-green), plus a slow
    scale-breathing pulse and a small floating bob layered on top of the
    existing spin/drift. Also shrunk - "smaller than or the same size as
    the little rocks," decided: `FRACTURE.swarmRadius` went from 12 (24px
    across, bigger than the smallest asteroid's own 16px) to 7 (14px,
    safely under it). This same redesign automatically applies to The
    Cardinal's own arm-scrap too (item 22) - both reuse
    `entities/FractureSwarmBit.ts` as-is.
20. [x] High score screen + main-menu-after-game-over — not originally
    scoped; requested directly, two related changes.
    - **Mode-select screen's leaderboard trimmed to the top 3** (was
      top-10 in two columns), now a single clickable bordered panel
      (`MenuScene.openHighScores()`) - matching every other "button" on
      that screen (`Rectangle` + `Text`, `pointerdown`).
    - **New `HighScoreScene`** (`scenes/HighScoreScene.ts`, registered
      in `main.ts`): the full top 10, "in the style of an 80s arcade
      high score screen, in Debris's own colors," decided - see
      `docs/art_direction.md`'s "Arcade Marquee" entry for the exact
      treatment. Any key or a click returns to the main menu - the click
      listener attaches on a short delay rather than immediately, so the
      same click that opened this screen can't also be the one that
      closes it (see that entry for the exact mechanism).
    - **GAME OVER's "press any key" now goes to the main menu, not a
      fresh round** - decided, applies to every game-over path alike
      (Competitive win/draw/loss, Single Player loss, Cooperative loss)
      since they all funnel through the one shared `enterGameOver()`.
      Reuses `goToMainMenu()` (the pause menu's own "MAIN MENU" button
      logic) rather than duplicating its cleanup. The Pause menu's own
      explicit "RESTART" button is untouched - a deliberate manual
      restart is a different thing from what happens automatically
      after a round ends.
    - **Follow-up, requested directly: separately-tracked leaderboards
      for Cooperative and Competitive too** - was Single Player only at
      first landing (see the two bullets above); this closes the open
      questions the "Future ideas" section used to carry here (now
      resolved and removed). Per-mode leaderboards, not one shared board
      with a mode column - `debris-highscore-api` gets a sibling JSON
      file per mode (`leaderboard.ts`'s `filePathForMode`; Single
      Player's file path is unchanged, so no migration risk to
      already-live data), selected via a `mode` query param (`GET`) or
      body field (`POST`), validated by `isValidMode`. **What each mode
      ranks**: Cooperative ranks the pooled team score; Competitive
      ranks the winner's score - see `docs/gameplay.md`'s "Global high
      scores" section for the full table. **Who enters initials**:
      Single Player, the player themself; Competitive, the winner;
      Cooperative, whichever player was still alive last (tracked via
      new `lastEliminatedSlotIndex`, since Cooperative's own
      `evaluateRoundOutcome` has no "alive at round end" case to read
      that from directly - it only ever resolves to `loss` or
      `continue`). `MenuScene` now renders three panels, one per mode,
      each aligned under its own mode-toggle button rather than one
      shared Single-Player-only panel; `HighScoreScene` takes a `mode`
      param and titles itself with `GAME_MODE_LABELS[mode]` plus a
      "HIGH SCORES" subtitle, replacing the old single "HIGH SCORES"
      headline. `GameScene`'s initials-entry flow (previously Single
      Player-only) is now one shared parameterized path
      (`mode`/`input`/`baseOverlayLines`) reused by all three
      round-outcome branches instead of being duplicated per mode.
21. [x] Dev-only stage timer — not originally scoped; requested directly.
    Top-center, just below the mode label, `MM:SS.mmm` of time elapsed in
    the *current stage*, resetting to zero on every stage transition
    (`beginNextLevel()`'s normal next-wave path and `materializeFracture()`'s
    Fracture-stage path, both of which set `state = 'playing'`). Pauses
    for free across every non-playing state (paused, stage-clear overlay,
    the Fracture announcement, initials entry, game over) because it's
    accumulated frame-by-frame only while `state === 'playing'`
    (`GameScene.stageElapsedMs`), not read off a wall-clock timestamp that
    would otherwise keep advancing while the game is paused. Formatting
    (`utilities/StageTimer.ts`'s `formatStageTimer`) is pure and unit
    tested, same convention as the rest of this codebase's rule logic.
    **Explicitly a dev aid, not a shipped feature** — see "Remove the
    dev stage timer" below, added at the same time per direct request.
22. [x] The Cardinal (Debris's second boss) + the boss-stage rotation
    structure — not originally scoped; requested directly, full design
    spec + visual mockup reviewed first (see "The Cardinal" under
    "Future ideas" below for the complete spec this implements). A
    permanent four-armed rotating fixture at exact arena-center, three
    phases:
    - **Phase 1 - Armed**: 4 arms, 20 HP each (`CARDINAL.armHp`),
      destroyed independently - `entities/Cardinal.ts`'s `takeArmHit`.
      A destroyed arm explodes into scrap (reuses `FractureSwarmBit`,
      pushed straight into the existing `fractureSwarm` array/pickup
      flow - no separate array needed, and deliberately never calls
      `beginScrapCountdown()` so it has no expiry, per the decided
      "collectible until the boss finally exploded"), goes dark, stays
      attached. The whole structure rotates continuously clockwise
      (`CARDINAL.rotationPeriodMs`, 20s/revolution); every 3 seconds
      (`laserCooldownMs`) all still-alive arms charge (0.7s, a gold
      telegraph reusing `COLORS.fractureLauncher`) then fire together
      for exactly 1 second (`COLORS.ufo` red, reused) - the cross
      visibly degrades to 3/2/1 beams as arms die. A single consolidated
      health bar (`GameScene.createCardinalHealthBar`/
      `updateCardinalHealthBar`) sums all 4 arms into one bar below the
      boss.
    - **Phase 2 - Core exposed**: once every arm is down, the bare
      octagonal core (decided over circular, via the visual mockup) has
      its own 20 HP and fires a plasma ball at the nearest player every
      2 seconds (`CardinalPlasmaBall`, lead-aim reusing
      `systems/UfoTargeting.ts`).
    - **Phase 3 - Critical**: once the core is destroyed, a 5-second
      detonation countdown - the structure pulses red, a countdown
      number renders inside the core, and a danger ring grows in real
      time to its full blast radius (`CARDINAL.detonationMaxRadius`,
      480px) exactly as the timer hits zero. Any ship still inside when
      it goes off dies (`resolveCardinalDetonation`) - "players need to
      take distance," decided.
    - **Not Matter-backed at all**, unlike The Fracture - a rotating
      cross with independently-destructible, continuously-moving hit
      zones doesn't fit Matter's category/mask model, so every
      interaction (ship-vs-core ram, projectile-vs-arm, projectile-vs-
      core, the laser-vs-ship beam) is a plain per-frame distance/
      segment check (`GameScene.updateCardinalAttacks`), the same "plain
      math hazard" pattern `BlackHole` and `FractureLaser` already
      established. The one exception is the plasma ball, a normal small
      Matter-backed projectile (own `CATEGORY.CARDINAL` mask).
    - **The boss-stage rotation structure itself, also landed**: replaces
      the old one-time `fractureIntroduced` latch with `lastStageWasBoss`
      - every normal stage clear now triggers a randomly-picked boss
      (`GameScene.pickRandomBoss()`, 50/50 between The Fracture and The
      Cardinal today), and a boss's own clear triggers a normal stage
      next, alternating for the rest of the round. `beginFractureAnnouncement`
      generalized into `beginBossAnnouncement(boss)` +
      `showBossAnnouncement(name)`, and `isFractureEncounterActive`
      renamed `isBossEncounterActive` to cover Cardinal too (see item
      21's neighboring CHANGELOG entry on the cross-boss conventions
      this builds on: name announcement, no Black Holes during a boss
      stage, UFO cap of 4, per-stage-type music).
    - **Available in all three modes** - Single Player, Cooperative,
      Competitive alike, decided.
    - Pure logic (`applyHit`/`determinePhase`) extracted to
      `systems/CardinalCombat.ts` and unit tested, same convention as
      `FractureCombat.ts`.
23. [x] Weapon upgrade system + stage-clear shop — not originally
    scoped; requested directly with a full spec (three upgrades,
    composable stacking, Scrap-funded purchases, shop interfaces/hooks
    without a full UI on the first pass), then a follow-up requesting
    the shop UI itself. Both passes reviewed via live-rendered/drawn
    mockups before any code was written, and confirmed via several
    rounds of `AskUserQuestion` on every load-bearing fork - see
    CHANGELOG for the full build.
    - **Base weapon vs. upgrades, kept separate, per the brief**: every
      player starts on the unchanged base weapon (`PROJECTILE`); three
      purchasable, composable upgrades layer on top via
      `systems/WeaponUpgrades.ts`'s pure `computeShotSpecs`/
      `computeFireCooldownMs`/`computeMaxOnScreenShots` -
      **Splitshot** (3-pellet fan, configurable spread via
      `WEAPON_UPGRADES.splitshot.spreadRad`, also scales a player's own
      on-screen-shot cap so the volley isn't silently throttled by v1
      tuning picked before upgrades existed), **Rapid Fire** (reduced
      cooldown plus an optional, on-by-default heat/overheat system,
      `systems/WeaponHeat.ts`, one config flag to disable), and
      **Heavy Shot** (bigger/slower/higher-damage projectile with a
      real kinetic push - `computeImpulseVelocity`, confirmed via
      `AskUserQuestion` to reach nearby debris as an area effect, not
      just the asteroid directly destroyed). All three stack in every
      combination, including all three at once, exactly per the
      brief's own SPLITSHOT+RAPIDFIRE+HEAVYSHOT example.
    - **Damage only matters against Fracture/Cardinal's HP** (confirmed
      via `AskUserQuestion`) - asteroids/UFO still die in one hit
      regardless of damage, same as always. `FractureCombat.applyHit`/
      `CardinalCombat.applyHit` gained an optional `damage` parameter
      (default 1, fully backward compatible with every existing call
      site/test) to carry Heavy Shot's bonus through.
    - **The shop** (`GameScene`'s new `'shop'` session state,
      `enterShop()`/`updateShop()`/`exitShop()`): appears at every stage
      clear, replacing the old "PRESS ANY KEY FOR NEXT LEVEL" prompt.
      One shared screen, a panel per active player (not always 4, only
      players actually in the round), each navigated with that player's
      own existing controls - turn cycles a per-panel cursor through
      their 3 upgrades then a trailing READY row, fire confirms (an
      immediate purchase via `purchaseWeaponUpgrade()`, or a ready-state
      toggle) - no new input bindings. No timer; the stage only advances
      once every non-eliminated player is ready. An eliminated player
      gets a permanently-ready, non-interactive "OUT" panel so they can
      never block the others.
    - **Scrap costs**: 5 each (`WEAPON_UPGRADES.costs`), spent from the
      same per-player `PlayerSlot.scrap` balance Fracture/Cardinal scrap
      pickups already fund. Available in all three modes.
    - Implements the "Weapons" half of the "Salvage" future idea below
      in scoped-down form (3 fixed upgrades, not the original 5-weapon
      swap/stack-loadout pitch) - see that section's own updated note;
      the "Engines" half remains fully open.
24. [x] Ship/asteroid/UFO shape polish pass — item 12's one remaining
    piece, explicitly skipped at the time for lacking a real brief (see
    that item's own note above). Got one this time: a live-rendered
    concept sheet comparing two axes per entity (glow/bloom vs.
    geometry detail, neither changing the confirmed silhouettes from
    `docs/art_direction.md`), reviewed via `AskUserQuestion` before any
    of it was built - see that doc's own "Polish pass, landed" notes on
    the Ship/Asteroid/UFO sections for the full per-entity detail this
    entry summarizes.
    - **Different treatment per entity, decided** - not the same
      recipe applied uniformly. Ship: glow (layered strokes + a bright
      inner core line, the same "neon tube" technique The Fracture's
      laser already uses) **and** geometry detail (canopy, wing panel
      lines, engine notch) - safe to combine, since at most 4 ships
      exist at once. UFO: **glow only** - the geometry-detail concept
      (rivet dots, a dome rim highlight) was reviewed but not landed,
      judged too subtle to earn its tuning cost at the UFO's actual
      on-screen size. Asteroid: **no glow at all** - explicitly kept
      off asteroids specifically, the one entity where a dozen-plus can
      be on screen at once and a glow that reads well on one rock in
      isolation risks becoming visual noise at that density: an open
      risk flagged during scoping, not run to ground with a live
      density test, so the decision to skip glow there was the
      conservative one, not a measured one.
    - **Asteroid geometry pass, two parts** - per-rock surface detail
      (procedural craters + crack lines, `systems/AsteroidShape.ts`'s
      new `generateCraters`/`pickCrackTargets`, both pure/tested) scaled
      down by size tier (small rocks get none - too tiny to read, and
      the numerous-after-splits tier the density concern above was
      really about), and **shape families**
      (`ASTEROID.shapeFamilies` - rounded/jagged/spiky, one picked at
      random per rock via the new `pickShapeFamily`, replacing the
      single fixed vertexCountRange/jaggedness pair every rock used to
      share) - a separate, cheap idea folded into the same pass on
      request, addressing "more varied asteroid silhouettes" from item
      12's own original framing directly.
    - Verified live against the running dev server at real gameplay
      scale, not just the enlarged concept sheet - caught and worked
      around a headless-Chromium-specific rendering quirk affecting
      `Ship`'s Matter-wrapped Graphics object in this test environment
      specifically (confirmed unrelated to this change by reproducing
      it against the pristine pre-polish `Ship.ts` too) by rendering
      the identical draw code through a plain `Graphics` object instead
      - not a real bug, but flagged honestly rather than skipped past.
    - **Follow-up, requested directly: Ship and UFO glow both
      reverted.** The outer-glow layers + (on the ship) the bright
      inner core line are gone from both `entities/Ship.ts` and
      `entities/Ufo.ts` - confirmed live (real gameplay scale and
      enlarged) that both are back to their plain outlined look. Ship's
      **geometry detail stays** (canopy, wing panel lines, engine
      notch) - only the glow half of the ship's own two-part pass was
      pulled. Asteroid's shape families + per-rock craters/cracks are
      untouched by this - they never had glow to begin with. See
      `docs/art_direction.md`'s Ship/UFO sections for the corresponding
      "landed, then reverted" notes.
25. [x] Bigger destruction particles + stackable Shield (max 2) - not
    originally scoped, two independent requests landed together, both
    reviewed live before implementation (see CHANGELOG for full detail).
    - **Particle size**: `entities/DestructionBurst.ts`'s previously
      hardcoded 2px dot is now `EFFECTS.*Burst.sizePx`, sized per burst
      type after a live 2-6px comparison - asteroid 4px, ship 5px, UFO
      6px, following the same "bigger death = bigger effect" logic
      `count`/`speedRange` already used.
    - **Shield stacking**: `SHIELD.maxCharges` (2) - resolves the
      "stacking shield charges" example the "Power-ups beyond Shield"
      deferred-item explicitly named. `Ship`'s `shielded: boolean` became
      `shieldCharges: number`; `hasShield`/`grantShield()`/
      `consumeShield()` kept their existing signatures, so every call
      site elsewhere needed no changes. Visual: reviewed as a published
      Artifact mockup comparing a rotating-dashed vs. a pulsing outer
      ring for the second charge - **pulsing chosen**. First charge is
      the original static ring, unchanged; the second adds an
      independently-breathing outer ring, no new HUD element added.
26. [x] Scrap pickup enlarged again - not originally scoped, requested
    directly after item 19 Pass 4's own "smaller than or the same size
    as the little rocks" sizing turned out to read as too small in
    practice. `FRACTURE.swarmRadius`/`TARGET_SPAN_PX` went 7/12px to
    11/20px (see CHANGELOG for the full before/after), chosen from a live
    size comparison against the smallest asteroid rather than guessed -
    deliberately bigger than that rock now, reversing Pass 4's own call.
    Applies identically to The Cardinal's arm-scrap, same entity.

## Future ideas

Bigger speculative systems — not scoped, not scheduled, but worth
preserving in full rather than compressed into a one-line bullet.

### The Chaos Meter

A single escalating tension meter, shown top-of-screen (`DEBRIS LEVEL`,
a percentage bar), that **fills from every explosion** — asteroids, the
UFO, ships, all of it feeding one number. As it climbs, it unlocks
tiers of escalating hazard, stacking on top of each other rather than
replacing one another:

| Level | Adds |
| --- | --- |
| 1 | Normal asteroid field (baseline) |
| 2 | Faster debris — a global speed multiplier kicks in |
| 3 | Enemy ships arrive — UFO spawns begin |
| 4 | Gravity anomalies — **landed already, see item 17's Gravity Well**, but as a mode-agnostic standalone hazard on its own timer, not gated behind this (unbuilt) meter. Whoever picks up the Chaos Meter itself should decide whether to gate its spawn rate behind chaos level instead of reimplementing it |
| 5 | Screen shakes — persistent, climbing tension |
| 6 | **TOTAL DEBRIS** — the climax; the screen becomes nearly unsurvivable |

The appeal: it's a built-in pacing/climax mechanism, not just a
difficulty slider — a round has a natural shape (calm → escalating →
climax) without needing Godspeed-style floor/wave bookkeeping, and it
guarantees a round can't just drift on forever, which reinforces the
"fast rounds" pillar in `docs/vision.md` for free.

**Open questions for whoever picks this up** (not resolved now — this is
a future idea, not v1 scope):

- **Tension with v1's UFO design**: `docs/gameplay.md` currently has the
  UFO spawning periodically from the start of every wave. Chaos Level 3
  ("enemy ships arrive") implies the UFO is *gated behind* chaos instead —
  these two designs conflict and need reconciling, not just merging.
- **Does the meter reset** between waves/rounds, or is it a per-round
  one-way climb (fill → climax → round ends, start clean next round)?
  A one-way climb is what makes it feel like a climax; a per-wave reset
  makes it more like a difficulty-within-a-wave modifier. Different games.
- **Cooperative, Competitive, or a third "Chaos" mode of its own?** It
  could layer onto both existing modes as-is, or be interesting enough to
  justify being its own selectable mode rather than a modifier on the
  other two.
- **Does the meter only go up, or can it drain** (e.g. slowly decay if
  nothing's exploded in a while, rewarding/punishing pacing rather than
  pure total-kills-this-round)?

### Enemy roster (beyond the UFO)

Pitched to give **Cooperative** more personality — a varied cast to react
to as a team, not just an escalating pile of rocks. Whether these are
co-op-only or also appear in Competitive is an open question, not decided.

| Enemy | Behavior |
| --- | --- |
| 🤖 **Drone** | Simple enemy that hunts players — a baseline chaser, no gimmick. (Naming echo with Godspeed's own baseline "Drone" enemy is a coincidence worth deciding whether to keep or rename, not a conflict — different games, different repos.) |
| 🛸 **Miner** | Targets *asteroids*, not players — destroys them, but that means splitting them, which (per `docs/gameplay.md`) creates more, smaller, faster debris. Indirectly dangerous: ignoring it lets it make the field worse. |
| ☠️ **Saboteur** | Drops mines into the arena — a stationary/timed hazard rather than a direct chaser. Presumably wraps at arena edges like everything else, for consistency. |
| 🧲 **Collector** | Collects debris and grows larger the longer it survives — a risk/reward priority target: kill it early and small, or let it grow into a bigger threat. |
| 🌀 **Warp Ship** | Teleports unpredictably around the arena — hard to pin down or reliably avoid, an evasion/awareness threat rather than a raw damage one. |
| 👁️ **The Harvester** | A huge boss that slowly consumes the entire arena. Boss-tier, singular, arena-dominating — a natural fit as **the payoff for reaching Chaos Level 6 ("TOTAL DEBRIS")** rather than an enemy that can show up at any time; ties this roster directly to the Chaos Meter idea above instead of the two systems existing in parallel. |
| ⚡ **The Magnetar** | A huge electromagnetic boss that alternates between **PULL** and **PUSH** phases — drags every ship and asteroid in the arena together, then violently throws it all back outward. Boss-tier, arena-wide, requested directly. Distinct from the existing Gravity Well hazard (`docs/gameplay.md`) despite the surface similarity: Gravity Well is a passive, localized, pull-only environmental hazard on its own timer with no HP to fight; the Magnetar is an active, arena-wide, two-phase boss with hit points, more Harvester's sibling than Gravity Well's. |
| 💠 **The Fracture** | A crystalline boss that splits when damaged instead of just dying — Core → 3 Fragments → Swarm. Boss-tier, requested directly, full concept preserved in its own section below rather than compressed here. **Landed, see item 19** — the splitting/movement/multi-tier-HP core loop is built; real attacks, ship contact, and the death sequence are still open. |
| ✝️ **The Cardinal** | A stationary four-armed mechanical boss permanently anchored at arena-center — four laser cannons at N/E/S/W, the whole cross rotating continuously clockwise, firing all four simultaneously every few seconds. Boss-tier, requested directly, full concept preserved in its own section below rather than compressed here. **Landed, see item 22** — three-phase fight (armed → core exposed → critical detonation), all decided numbers built as spec'd. |

**Chaos Meter tie-ins worth remembering** (connecting this to the section
above, not deciding it now):

- The **Miner** actively feeds the Chaos Meter — it manufactures
  explosions/splits on its own, independent of player action.
- **The Harvester** reads as the natural climax encounter for Chaos
  Level 6, giving that tier an actual boss rather than just "the screen
  gets worse."
- **The Magnetar**, **The Fracture**, and **The Cardinal** are now the
  second, third, and fourth boss-tier candidates alongside The Harvester.
  **The Fracture/Cardinal pairing is resolved** (see "Bosses" below - a
  random pick between the two, every stage, not gated behind chaos level
  at all); Magnetar and Harvester remain unreconciled with that structure
  or with each other, decided by whoever picks them up.
- If the UFO ends up gated behind Chaos Level 3 (see the open question
  above), this whole roster likely wants similar chaos-gated introduction
  rather than all eight being possible from the start of every round -
  though The Cardinal/Fracture boss-stage structure below is now a
  competing, already-decided answer for those two specifically.

### The Fracture

A gigantic crystalline alien boss, originally pitched anchored at the
arena's center - requested directly with the full concept below,
preserved in full rather than compressed into the roster table's
one-liner, same reasoning as The Chaos Meter above. The pitch, verbatim
in spirit: "the more you damage it, the more of it there is."

**Landed, item 19**, in three passes: trigger/announcement/materialize,
then the Core → Fragment → Swarm splitting itself, then real attacks +
ship contact + Swarm redesigned as a scrap pickup. See item 19 for the
exact per-pass split. Remaining gaps: asteroid contact and the death
sequence below. A few deviations from the original pitch worth flagging
here specifically:

- **Positioning actually matches the pitch now, via a different route**:
  it spawns off-screen above top-center and drifts down to arena-center
  before stopping (Pass 3, `FRACTURE_SPAWN_OFFSCREEN_Y` in
  `GameScene.ts`) - a later, more specific instruction than a fixed
  top-middle spawn (Pass 1's own deviation, now superseded). Ends up in
  the same place this section's original "floating in the center of the
  arena" line described, just arrived at over a few seconds instead of
  instantly.
- The split counts are simpler than originally pitched: this section's
  "1 Large Core → 3 Medium Cores → 6 Small Cores → SWARM" implied four
  tiers; what's built is three (Core → 3 Fragments → Swarm, 6 Swarm bits
  per Fragment) - the "6 Small Cores" middle step was folded into the
  Fragment tier rather than kept as its own separate step, matching the
  three-phase shape the live concept review actually walked through and
  the user approved, not a fourth tier nobody had reviewed yet.
- **Swarm isn't a hazard at all, decided** (`AskUserQuestion`): the
  original pitch's "dozens of smaller hostile fragments... maybe
  destroying the boss was a mistake" framed Phase 3 as more danger. What
  shipped instead is the opposite tone - Swarm pieces are always safe,
  a scrap pickup, not a threat. The "maybe that was a mistake" feeling
  now comes from the fight itself (real attacks, ship-killing contact)
  peaking right as Phase 2 dies, not from the aftermath.

At first it reads as one large angular geometric entity with a glowing
core - deceptively simple for what's coming.

**Splitting is the whole mechanic**, following the same philosophy
asteroids already use (large → medium → small → gone,
`docs/gameplay.md`) but inverted into an escalating threat instead of a
shrinking one: 1 Large Core → 3 Medium Cores → 6 Small Cores → a
fragment swarm.

- **Phase 1 — The Core.** One huge, slow-moving entity. Attacks with a
  powerful laser and launches large crystal projectiles.
- **Phase 2 — Fractured.** Destroying the core splits it into three
  independent pieces, each with its own distinct behavior rather than
  three copies of the same threat:

  | Fragment | Behavior |
  | --- | --- |
  | 🔴 | Aggressive attacker |
  | 🔵 | Gravity manipulator |
  | 🟡 | Debris launcher |

- **Phase 3 — Swarm.** Destroying those three splits them again into
  dozens of smaller hostile fragments filling the arena - "maybe
  destroying the boss was a mistake." The escalation *is* the point:
  killing it faster makes the immediate threat worse, not over, right up
  until it actually is.

**Death.** The final fragments collide and implode - everything in the
arena gets pulled toward the center, a beat of silence, then one massive
explosion, leaving the whole arena a temporary debris storm.

**Visual identity**: neon crystal shards with glowing internal cracks
that spread as it takes damage, so its condition is readable before it
actually splits - fits Debris's existing "thin glowing outlines over
filled shapes" vector style (`docs/art_direction.md`) directly, no new
rendering technique needed, just a new silhouette.

**Open questions** (not resolved now — this is a future idea, not v1
scope):

- How this reconciles with The Harvester and The Magnetar - see the
  three-way boss-tier note above.
- Whether "the more you damage it, the more of it there is" needs a cap
  on total simultaneous fragments (a genuinely unbounded swarm could
  overwhelm the arena and the physics engine alike) or whether that
  overwhelm *is* the intended Phase 3 chaos.
- Whether Phase 2's three fragments must be destroyed together to
  trigger Phase 3, or whether each splits into its own sub-swarm
  independently as it dies - changes the pacing a lot (one big
  synchronized escalation vs. a rolling one).

### The Cardinal

Debris's second boss, requested directly with the full concept below,
same "preserve it in full rather than compress it" treatment as The
Fracture above. Unlike The Fracture (which drifts to center and then
moves as it splits), **The Cardinal never moves at all** - a permanent
fixture at the exact arena center for the entire fight, turning the
whole encounter into a positioning/timing puzzle instead of a chase.
Pitch, verbatim in spirit: *"Watch the rotation. Learn the rhythm. Find
the gap."* **Landed, item 22** - built exactly to this spec (visual
mockup reviewed and approved first, per explicit instruction to show
the visual before building it), including every follow-up decision made
while spec'ing it (octagonal core, per-arm HP + scrap, the Phase 2/3
core-exposed/critical structure, the growing detonation ring). The
numbered points (1-10) and "Open questions" below are kept as the
original design record - see item 22 for what actually shipped and
where it deviates from a "proposed" number below.

**How this fits the boss-stage structure**: resolved via
`AskUserQuestion` alongside this spec - see "Bosses" below. The Cardinal
and The Fracture are the two boss-tier encounters in the random
per-stage boss pool ("more bosses are added later" grows it further),
not an alternate/replacement for one another and not a harder second
phase stacked after The Fracture - they're peers, one picked at random
each time a normal stage clears. **This structure is also landed now**
(item 22) - `GameScene.pickRandomBoss()`.

1. **Visual appearance.** A dark, angular, mechanical structure - 1980s
   vector-arcade geometry (thin glowing outlines over near-black filled
   plates, Debris's existing house style, `docs/art_direction.md`) fused
   with modern neon sci-fi glow. Reads as ancient and slightly damaged,
   not pristine - an automated space-defense relic that's been running
   unattended for a very long time, not a shiny new warship. Small
   pieces of drifting debris orbit loosely around the whole structure
   (same silhouette language as the arena's own floating rocks, so it
   visually belongs to the DEBRIS field it sits in rather than looking
   pasted on top of it).
2. **Top-down silhouette.** A perfect four-point cross / plus-sign,
   dead centered, strongly symmetric under 90° rotation - the single
   most important readability property here, since the player's whole
   mental model ("where will the next gap be") depends on being able to
   predict all four arms from seeing just one. One large core hub in
   the middle; four identical arms extending out to N/E/S/W, each ending
   in a heavy cannon housing. Not humanoid, not creature-like, not a
   realistic spaceship - closer in spirit to a colossal industrial
   turret bolted to nothing, just floating.
3. **Individual components.**
   - **Central core**: one large hub - **octagonal, decided** (an
     octagon read more "ancient machine" than a circle's "energy
     reactor," picked after the mockup showed both). Glows intensely,
     brighter than anything else on the structure - the visual "heart"
     the charge-up telegraph originates from, and (Phase 2/3 below) what
     remains once every arm is gone.
   - **Four arms**: identical mechanical trusses/segments connecting the
     core to each cannon, with visible rotating rings and glowing energy
     conduits running along their length (so a charge visibly *travels*
     from core to cannon, not just appears at the tip).
   - **Four cannons**: heavy, blocky laser-weapon housings at the end of
     each arm - the widest, most physically "solid-looking" part of the
     structure, so they read as the actual weapons even at a glance.
   - **Damage/warning details**: visible scorch marks, a few dark
     non-glowing dead segments, small intermittent warning lights
     (amber/magenta, sparse, not dominant) - "ancient and slightly
     damaged," not falling apart.
4. **Animation states.** Four states, always exactly one active:
   **Idle-rotating** (default - see Rotation behavior) → **Charging**
   (~0.6-0.8s, proposed - shorter than The Fracture's 400ms single-laser
   telegraph since four simultaneous lines need slightly more warning
   time to track) → **Firing** (exactly 1 second, per spec) →
   **Cooldown** (back to idle-rotating, holds until the next attack 3
   seconds after the *previous fire ended* - proposed reading of "every
   3 seconds" as the repeat interval; needs confirming once this is
   actually built). Also two structure-wide states layered independently
   of the attack cycle: **Damaged** (see point 8) and **Destroyed**
   (point 9).
5. **Laser charging effect.** A bright pulse of light originates at the
   central core and visibly travels outward along all four arms toward
   their cannons simultaneously (a literal traveling glow along the
   energy-conduit lines from point 3, not just a flash) - proposed color:
   a warm amber/gold (reusing `COLORS.fractureLauncher`, already this
   game's "something's about to happen" gold, rather than inventing a
   third telegraph color). As the pulse reaches each cannon, a thin,
   dim targeting line snaps out along that cannon's firing axis - visible
   but clearly not-yet-lethal, same fairness telegraph philosophy as
   The Fracture's own laser (`FRACTURE.laserTelegraphMs`) and every
   other hazard in this game.
6. **Laser firing effect.** All four dim targeting lines simultaneously
   snap to full-width, full-brightness beams - proposed color: red,
   reusing `COLORS.ufo`, this game's one consistent "this will kill you
   right now" hue (already shared by The Fracture's laser and the Black
   Hole's event horizon; deliberately not a new color, same reuse
   philosophy this project's palette decisions keep favoring). Beams
   extend far enough to comfortably cross the arena from a central
   origin - The Fracture's own laser reaches 1400px on the 1920px-wide
   arena as precedent; The Cardinal's four at once likely want to be at
   least that long, possibly the full arena diagonal, to guarantee there's
   nowhere near the edges that reads as automatically safe. Active for
   exactly 1 second (per spec, non-negotiable per the brief), then a
   brief fade (proposed ~150-200ms, matching `FRACTURE.laserFadeMs`'s
   existing precedent) before cutting out entirely.
7. **Rotation behavior.** The entire structure - core, all four arms,
   all four cannons - rotates together as one rigid body, continuously
   clockwise, forever, at a constant speed (never speeds up, slows down,
   or reverses - predictability is the entire point). Proposed starting
   speed: slow enough that a full rotation takes somewhere in the
   15-25 second range - fast enough to feel alive and mechanical, slow
   enough that a player watching for even a few seconds can extrapolate
   where the arms will be when the next attack actually lands. **Keeps
   rotating during Charging and Firing too** - the danger zone from
   point 6 is a rotating cross, not a fixed one, per spec ("the four
   active lasers create a rotating cross-shaped danger zone").
8. **Damage states - a full three-phase fight, decided.** Unlike The
   Fracture (which *splits* into more, smaller threats as it's damaged),
   **The Cardinal steadily disarms itself** - each phase has strictly
   fewer active weapons than the last, the opposite escalation shape
   from Debris's first boss, deliberately:
   - **Phase 1 - Armed.** Each of the four arms has its own **20 HP**,
     tracked and destroyed independently - shoot the same arm
     repeatedly to snipe it off specifically, rather than damage being
     shared. A destroyed arm **explodes into scrap** (reusing The
     Fracture's own scrap-pickup mechanic and visual language,
     `systems/HighScoreApi.ts` neighbor `pendingScrapPickups`/
     `FRACTURE`'s scrap fields in `GameConfig.ts` - same reward loop,
     different trigger: Fracture's scrap drops once at the very end of
     its fight, The Cardinal's drops progressively, one burst per arm,
     while the fight is still very much live) and goes dark - no longer
     rotates its own targeting line out or joins the laser volley, but
     stays physically attached to the rotating body as inert wreckage
     (matches The Fracture's own "doesn't split into a separate hazard"
     precedent - a destroyed arm is debris, not a new threat). The
     4-beam cross visibly degrades to 3, then 2, then 1 beam as specific
     arms die, each still on the same shared 3-second cycle - reading
     the fight gets easier to see as an arm at a time is cleared, not
     just a health number ticking down. A single **consolidated health
     bar below the boss** sums all remaining arm HP into one bar (max
     80) rather than four separate small bars - "for all arms
     consolidated," decided. **Arm-scrap has no expiry timer** - unlike
     The Fracture's 10-second post-fight collection window
     (`FRACTURE.scrapCollectionMs`), decided directly: arm-scrap "can be
     collected until the boss finally exploded" - stays pickable through
     Phase 2 and the entire Phase 3 countdown, only actually gone once
     the boss's own final detonation (point 9) goes off. No countdown
     pressure stacked on top of an already-active fight.
   - **Phase 2 - Core exposed.** Once all four arms are gone, the bare
     octagonal core remains, still rotating (same constant clockwise
     speed as before - nothing left to differentiate a rotation change,
     and consistency matters more here than drama). Its own attack
     replaces the laser cross entirely: **every 2 seconds, it fires a
     plasma ball at the nearest player** - proposed to reuse this
     game's existing lead-the-target aim math
     (`systems/UfoTargeting.ts`, already built for the UFO's own shots)
     rather than a new targeting algorithm, though a straight
     nearest-player aim with no lead is a simpler fallback if that
     reuse doesn't fit cleanly. The core itself has **20 HP**, its own
     consolidated bar replacing the arms' one once Phase 2 begins.
   - **Phase 3 - Critical / detonation countdown.** Once the core's 20
     HP hits zero: a fixed **5-second timer** starts, the whole
     structure pulses red (reusing `COLORS.ufo`, the same "this will
     kill you" hue the lasers already used), and a visible countdown
     number appears inside the core, ticking 5→0. **"Players need to
     take distance," decided as genuinely lethal** - see point 9.
9. **Destruction sequence.** The Phase 3 countdown (point 8) *is* the
   destruction sequence - once it reaches zero, The Cardinal detonates
   with a **large lethal blast radius**, "roughly as far as the arms/
   lasers used to reach" per the decision behind this spec - proposed
   starting number: comparable to or exceeding the ~430px beam reach
   the visual mockup used, likely wanting to feel at least as
   dangerous as the fight itself was, not a token final hit. **The
   danger radius grows visibly in real time across the full 5 seconds**,
   decided - a ring expands from the core and reaches that full blast
   radius at the exact instant the countdown hits zero, rather than
   staying invisible/flat until the last moment - "the player is always
   shown precisely how much room is left," same fairness-telegraph
   philosophy as the laser's own charge-up (point 5) and every other
   hazard in this game. Any ship still inside that radius when it goes
   off is expected to die (exact damage/instant-kill vs. heavy-damage
   framing still a tuning call, not pinned down here) - mirrors The
   Fracture's own "everything pulled toward center, one massive
   explosion" arena-wide finale in scale, while staying mechanically
   distinct: no pull-in beat, no silence-then-boom, just a hard,
   visibly-closing countdown to clear the area - fits "ancient machine
   finally failing" better than reusing Fracture's own implosion beat
   would have. Any not-yet-collected arm-scrap (point 8) is presumably
   gone once this actually goes off - the boss "finally exploded" is
   the stated cutoff for collecting it.
10. **How it fits the DEBRIS universe.** The floating debris orbiting the
    structure (point 1) and the "ancient, damaged, automated" framing
    tie it directly into the same "these are the remnants of something"
    reading the whole game's asteroid field already implies - not an
    invading enemy, closer to a forgotten piece of the same wreckage
    field the player is already flying through, just one that's still
    switched on. Reinforces Debris's existing "moving asteroids +
    dangerous debris fragments + explosions + enemy projectiles" chaos
    (`docs/gameplay.md`) rather than introducing a foreign genre element -
    a "theoretically safe position becomes dangerous when debris drifts
    into it" is already true of the base game; The Cardinal just adds a
    second, rhythmic, predictable layer of danger on top of the existing
    unpredictable one, per the brief's own framing.

**Mode availability, decided**: The Cardinal (and the boss-stage
structure generally) applies to **Single Player, Cooperative, and
Competitive alike** - no mode restriction. In Cooperative specifically,
a ship destroyed by any of The Cardinal's attacks (laser, plasma ball,
or the Phase 3 blast) presumably still routes through the existing
Emergency Ejection & Rescue system (item 15) exactly like any other
Cooperative death, rather than needing a boss-specific exception - not
explicitly restated by the brief, but a direct consequence of a rule
that already applies arena-wide in that mode.

**Open questions for whoever picks this up** (not resolved now - a
design spec, not v1 scope):

- **Exact numeric tuning** (rotation speed, charge/fade duration, beam
  length, arm/cannon dimensions, plasma ball speed, the Phase 3 blast
  radius in actual pixels) - every number in this section is a proposed
  starting point following this codebase's existing config-constant
  conventions (see `FRACTURE` in `GameConfig.ts` for the precedent this
  leans on throughout), not a final decision.
- **Does the Phase 3 blast deal instant-kill damage or heavy damage**
  to a ship still caught inside it once the ring finishes closing?
- **Plasma ball specifics** (Phase 2): straight shot vs. this game's
  existing lead-the-target math, travel speed, whether it's dodgeable
  in the open or specifically threatens whoever's already closest to
  center.

### Co-op rescue mechanics — landed, see item 15

Built as "Emergency Ejection & Rescue" (`docs/gameplay.md`), on request.
Its own open questions, resolved - several differently than the original
speculation below assumed, worth noting for anyone comparing the two:

- **Replaces v1's respawn model outright, in Cooperative only** - not a
  layer on top of it. Lives stop mattering there entirely; Competitive
  and Single Player keep the original lives/respawn/invulnerability
  system exactly as it was, untouched by any of this.
- **Pickup is instant-on-touch, not a hold/channel** - simpler than the
  "sustained vulnerability" framing speculated below, and it's *pickup*
  that saves the life immediately, not reaching some destination. The
  drama is entirely in the 10-second race to reach them, not a channel
  that can be interrupted.
- **Yes, the drifting pilot (a "Commander," not a "pod") can be
  destroyed** by an asteroid or UFO while adrift, exactly as guessed.
- **Yes, there's a timeout** - 10 seconds, `COMMANDER.rescueWindowMs`,
  a fixed number rather than left open.
- **Not speculated at the time, but decided during implementation**: a
  rescuer must physically deliver the Commander to a fixed space station
  (docs/art_direction.md's "Space Station") to actually respawn them -
  simple pickup alone saves the life but doesn't return their ship on
  its own. And a rescuer who dies mid-delivery drops the Commander back
  into open space rather than losing them - already-rescued, so no new
  countdown, but vulnerable to hazards again while waiting for a second
  pickup.

### Bosses

Requested as its own development direction, not fully specified yet at
first. Two boss concepts exist in enough detail to have been built:
**The Fracture** (item 19) and **The Cardinal** (item 22). **Their
shared structure is landed** (item 22): **every normal stage clear is
followed by a boss stage, not just the first one** -
`GameScene.pickRandomBoss()` picks at random from whichever boss-tier
enemies exist (today: The Fracture, The Cardinal, 50/50; "more bosses
are added later," so the pool grows over time rather than being fixed
at two forever), and a boss's own clear triggers a normal stage next -
a strict alternation, tracked by `lastStageWasBoss`. This **replaced
The Fracture's old one-time trigger** -
`GameScene.beginNextLevel()`'s `fractureIntroduced` latch, which used to
divert into the boss sequence only "after ending stage one" and never
again for the rest of the round, is gone.

**The Harvester** (see "Enemy roster" above) - a huge, arena-consuming
boss gated behind Chaos Level 6 - is NOT part of this resolution.
It was originally pitched as the Chaos Meter's own climax payoff, a
different trigger model entirely (chaos-gated, not stage-gated); whether
it instead joins the same random boss-stage pool as The Fracture/The
Cardinal, stays reserved for a future Chaos Meter climax, or both systems
end up coexisting is still open, same for The Magnetar.

**Cross-boss stage conventions, decided and landed** (requested
directly, ahead of The Cardinal itself being built): rules meant to
apply to every boss stage, current and future, not just The Fracture's -
written generically from the start, now genuinely exercised by two
different bosses rather than only ever having had one to apply to.

- **Every boss is introduced by name before its stage**, the same big
  announcement treatment The Fracture already had -
  `showFractureAnnouncement()` generalized into
  `beginBossAnnouncement(boss)` + `showBossAnnouncement(name)`, called
  as `showBossAnnouncement('THE FRACTURE')` or
  `showBossAnnouncement('THE CARDINAL')` depending on `pickRandomBoss()`'s
  result.
- **Boss stages never spawn a Black Hole** - `isBossEncounterActive()`
  (renamed from `isFractureEncounterActive`) now also covers
  `this.cardinal !== undefined`, so this applies to both bosses.
- **Boss stages cap concurrent UFOs at 4** -
  `UFO.maxConcurrentDuringBoss` (`GameConfig.ts`), the one exception to
  item 4's deliberate "no cap on concurrent UFOs" rule for normal play.
  Gated by the same `isBossEncounterActive()` check, so it applies to
  both bosses automatically.
- **Boss stages get their own looped music, normal stages get their
  own** - `systems/Music.ts`'s `FRACTURE_MUSIC_KEY`
  (`the-fractured.mp3`) and `CARDINAL_MUSIC_KEY` (`the-cardinal.mp3`)
  are both actually triggered now (`materializeFracture()`/
  `materializeCardinal()`); normal stages keep the existing
  `GAMEPLAY_MUSIC_KEY` (`neon-horizon.mp3`, unchanged - already the
  existing gameplay track, not a new asset). `GameScene.playStageMusic(key)`
  swaps the currently-looping track and no-ops if it's already playing,
  called at every stage-begin point (`create()`, `beginNextLevel()`'s
  normal-wave branch, `materializeFracture()`, `materializeCardinal()`) -
  and the Pause menu's pause/resume/stop calls target whichever track is
  actually live (`this.currentStageMusicKey`) instead of assuming
  gameplay music specifically, so pausing mid-boss-fight doesn't leak
  the wrong track back in on resume.
- **Respawns move away from arena-center during a boss fight**,
  requested directly - "the respawn point needs to be out of boss
  position." The normal small diamond (`PLAYER_SPAWN_OFFSETS`) and
  Single Player's dead-center spawn both sit on or near arena-center,
  exactly where both bosses live; `spawnOffsetFor()` now checks
  `isBossEncounterActive()` first and, if true, uses one of 4 fixed
  screen corners instead (`BOSS_CORNER_POSITIONS`, same P1/P2/P3/P4
  quadrant order `PLAYER_HUD_CORNERS` already uses) - "per-player
  corners," decided over clustering everyone at the bottom edge. Applies
  to every mode with a lives/respawn system (Competitive, Single Player).
- **Cooperative's Space Station relocates too**, same request, resolved
  via `AskUserQuestion`: "moves before the boss fight to a random
  corner... moves back after, make the move visible." `SpaceStation`
  gained a real `travelTo(target, nowMs, durationMs)` - an eased glide
  (`SPACE_STATION.relocateTravelMs`, 2.5s), not a teleport, since a
  drop-off point silently jumping would be confusing and the request
  explicitly asked for a visible move. Triggered at the start of the
  boss announcement (`relocateSpaceStationForBoss()`, to a random entry
  in the same `BOSS_CORNER_POSITIONS` the respawn points use) and
  reversed the moment the stage actually clears
  (`enterStageClear()`, gated by a `spaceStationRelocated` flag so every
  other stage-clear is a safe no-op). Every existing distance check that
  already reads `station.position` (drop-off range, a rescued player's
  respawn point, Black Hole spawn clearance) keeps working correctly
  through the glide with no changes of its own - `position` is a live
  getter now, not a fixed field.

### Salvage (progression system / cooperative mode)

**The "Weapons" half is landed, see item 23** - Splitshot/Rapid Fire/
Heavy Shot, funded by the same per-player Scrap this section describes,
purchased via a stage-clear shop. Scoped down from the original pitch
below (3 fixed, composable upgrades rather than 5 swap-or-stack weapon
types - "swap or stack?" was one of this section's own open questions,
resolved as "stack, and only 3 of the 5 originally pitched"). **The
"Engines" half remains fully open** - none of faster acceleration/
turning, a boost mechanic, or braking exist yet, and this section's own
open questions about them (below) are all still unresolved.

Destroying the **smallest** asteroid tier (the one that doesn't split
further) leaves behind salvage to pick up - a third pickup type alongside
the Shield, presumably collected the same way (fly over it). Salvage is
spent on upgrades across two trees:

- **Engines** — faster acceleration, faster turning, better boost,
  stronger braking.
- **Weapons** — rapid fire, heavy cannon, ricochet bullets, mines, plasma
  balls.

**Open questions for whoever picks this up** (not resolved now — this is
a future idea, not v1 scope):

- **Real tension with `docs/vision.md`'s pillars, not just an
  implementation detail.** Vision explicitly says Debris is "not
  procedural/roguelite (that's Godspeed's territory)" and is a
  "pick-up-and-play arcade cabinet game" with "fast rounds" - a
  persistent upgrade tree is exactly the kind of run-to-run progression
  Godspeed does. Worth an explicit decision on whether Salvage upgrades
  reset every round (session-scoped power spike, closer to the existing
  pillars) or persist across sessions (meta-progression, a real pillar
  shift), not a silent assumption either way.
- **"Stronger braking" doesn't fit the current physics model at all.**
  `docs/technical_design.md` decided `frictionAir: 0` deliberately - "no
  air in space... the ship never decelerates on its own, only thrust
  changes velocity." There's no braking mechanic to make "stronger" today;
  this upgrade implies adding reverse-thrust or active deceleration as a
  new capability, not tuning an existing one.
- **"Better boost" is also a new mechanic, not a v1 one.** Nothing in
  `docs/gameplay.md` gives the ship a boost/dash - that's a HyperOut
  mechanic (3 charges/round, 2x speed, phases through trails). Does
  Debris's boost mean the same thing, something else, or does this
  upgrade line assume boost already exists and just wasn't written down?
- **Is this its own third mode (like Debris Delivery above) or a system
  layered onto existing Cooperative?** The prompt called it a
  "cooperative game mode," which reads as its own selectable thing, not
  a modifier - but that's inferred, not stated outright.
- **Weapons — swap or stack? Resolved for the 3 that landed, see item
  23**: they stack (all 3 at once is a real, working combination), not
  an equip-one-loadout choice. Heavy cannon/ricochet/mines never got
  built - only Splitshot/Rapid Fire/Heavy Shot did - so this answer
  doesn't necessarily extend to a future Engines-tree upgrade or any
  additional weapon type someone adds later.
- **Salvage drop rate and spend UI - resolved for Weapons, see item
  23**: 5 Scrap flat per upgrade (not per-kill-scaled), spent at the
  stage-clear shop - exactly the second option this bullet already
  named as open. Still genuinely open for any future Engines-tree
  currency/spend point, if that ends up using Scrap too or a different
  resource entirely.

### Debris Delivery (a third mode)

A team objective mode, not a Cooperative/Competitive variant — pitched as
its own thing: teams collect valuable space scrap and haul it to their
extraction zone, under real pressure the whole way there.

- **Debris is heavy** — towing it affects your ship's own momentum
  (thrust/turn), not a free stat-less carry. A natural extension of the
  existing momentum model in `docs/gameplay.md` rather than a bolted-on
  mechanic, but the actual feel (how much drag, does it cap your max
  speed) needs real tuning once it's playable.
- **Large debris needs two players** to move at all — forces coordination
  on the highest-value prizes rather than letting one player solo
  everything.
- **Enemies can steal it** — presumably by contesting a piece someone's
  already towing, or by destroying the towing ship and taking the now-
  loose cargo.
- **Everyone can shoot everyone** — friendly fire on, same as Competitive,
  but now layered onto a shared team goal: your own team's careless shot
  can wreck your own cargo run, not just an enemy's.
- The scenario that sells it: a huge prize asteroid drifting toward the
  extraction zone, two players pushing it, two enemies trying to steal it,
  someone's shot goes wide and hits it — and now there are 40 small,
  fast-moving pieces (per the smaller-is-faster rule) flying through the
  middle of a fight that was already crowded. The chaos is the point, not
  a bug to design away.

**Open questions for whoever picks this up:**

- **Are "enemies" here the opposing team's players, or AI creatures** (the
  enemy roster above), or both at once? "Teams must collect..." (plural)
  reads like team-vs-team PvP, but the scenario's "two enemies trying to
  steal it" could equally be AI. These are very different scopes — one's
  a PvP economy, the other's co-op-vs-AI with a delivery objective bolted
  on. Worth deciding explicitly, not assuming.
- **Team size/count**: most likely 2v2 given "large debris needs 2
  players" and the 4-player cap, but not fixed here.
- **Are prize asteroids a distinct object type** from the regular hazard
  asteroids in `docs/gameplay.md`, or just a large asteroid that happens
  to be worth delivering? The "40 smaller pieces" beat implies something
  bigger/different from a standard large→medium→small split, not a
  reskinned wave asteroid.
- **How is towing actually initiated and released** — automatic on
  contact, or a deliberate grab/release input? And can a lone player still
  move "large" debris at all (just much slower), or is it genuinely
  immobile without a second player?
- **Delivery**: instant on reaching the extraction zone, or does the
  cargo need to be held/parked there briefly?

## Explicitly deferred past v1

- **Power-ups beyond Shield** (rapid-fire, multi-shot, etc.) — Shield
  alone is v1 scope (see above); everything else in this space waits
  until v1 is proven fun without it. **Stacking shield charges, one of
  the examples originally listed here, has since landed - see item 25.**
- **A second UFO variant** (classic Asteroids has a large "dumb" saucer
  and a small "accurate" one — v1 ships with one).
- **Best-of-N round structure** for Competitive (play one round at a time
  until this is proven fun, then consider a match format like HyperOut's).
- **UFO sound effects** (spawn, its own shot, a dedicated destruction
  sound distinct from the ship's) - the only SFX gap left now that the
  UFO itself is built (item 4). Its destruction currently reuses the
  ship-destruction explosion rather than staying silent or getting its
  own placeholder.
- **Difficulty options / tunable wave scaling** beyond the built-in ramp.
- **Stage-scaled asteroid/UFO counts** — requested directly. Today's
  asteroid count is a flat step, not a curve: `ASTEROID.spawnCountPerWave`
  (5) on the very first stage, then a fixed `+ ASTEROID.waveGrowthPerLevel`
  (2) on every stage after that, forever (7, never climbing any further) -
  see `beginNextLevel()`. UFO spawn frequency doesn't scale by stage at
  all - `UFO.spawnIntervalMs` (12000ms) is a flat constant regardless of
  how far into a round the player already is. The idea: fewer of both on
  early stages, climbing per stage instead of jumping once and
  flattening out - gives a round its own difficulty ramp rather than
  hitting "full difficulty" after the very first stage. Not scoped: the
  actual growth curve (linear vs. something that tapers off), whether it
  has a ceiling, and whether it replaces the existing
  `spawnCountPerWave + waveGrowthPerLevel` formula outright or layers on
  top of it.
- **Touch/mobile controls.**
- **Online multiplayer.** Local input only for the foreseeable future —
  a real netcode project, not a natural extension of this one.

## Not yet started

- **Remove the dev stage timer before the final version** — explicit
  instruction from whoever requested item 21 above. The top-center
  `MM:SS.mmm` display is a dev aid only, never intended to ship;
  removing it means deleting `GameScene`'s `stageElapsedMs`/
  `stageTimerText` fields, the three reset sites, the `update()` accumulate-
  and-render lines, the `formatStageTimer` import, and (unless something
  else starts using it by then) `utilities/StageTimer.ts` +
  `tests/stageTimer.test.ts` themselves.
