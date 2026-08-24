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
   `menu.mp3` now plays across both — see CHANGELOG. Music/SFX volume
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
      never specified more than "any polish pass"). Still open - see
      "Explicitly deferred past v1" below.

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
| 4 | Gravity anomalies — a new hazard type: wells that pull ships and debris toward them |
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

**Chaos Meter tie-ins worth remembering** (connecting this to the section
above, not deciding it now):

- The **Miner** actively feeds the Chaos Meter — it manufactures
  explosions/splits on its own, independent of player action.
- **The Harvester** reads as the natural climax encounter for Chaos
  Level 6, giving that tier an actual boss rather than just "the screen
  gets worse."
- If the UFO ends up gated behind Chaos Level 3 (see the open question
  above), this whole roster likely wants similar chaos-gated introduction
  rather than all six being possible from the start of every round.

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

Requested as its own development direction, not fully specified yet. The
only boss concept already on this roadmap is **The Harvester** (see
"Enemy roster" above) - a huge, arena-consuming boss gated behind Chaos
Level 6. Whether "work on bosses" means building The Harvester first,
designing additional bosses beyond it, or a boss-fight structure
independent of the Chaos Meter entirely (a dedicated encounter, a
"boss wave," a Salvage-tree unlock target - see below) isn't decided -
flagged here as a real want, not expanded into a spec that wasn't given.

### Salvage (progression system / cooperative mode)

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
- **Weapons — swap or stack?** Rapid fire, heavy cannon, ricochet
  bullets, mines, and plasma balls read like distinct weapon *types*,
  not stacking modifiers on the one shot type v1 has. Is Weapons an
  equip-one-loadout choice, or do unlocks stack (e.g. ricochet + rapid
  fire together)? Very different scope either way.
- **Salvage drop rate and spend UI** aren't specified - how much per
  kill, and where/when players actually spend it (mid-round on the fly,
  or between rounds/stages at the "STAGE CLEARED" pause that already
  exists) is open.

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

- **Polish pass on the ship/asteroid/UFO shapes** (item 12's last
  remaining piece) — explicitly skipped when the rest of item 12 landed,
  since `docs/art_direction.md` never specified more than "any polish
  pass." Needs a real brief before picking up: a rendering-only pass (a
  soft outer glow/bloom on the existing outlined shapes) and an actual
  geometry pass (more detail on the ship hull, more varied asteroid
  silhouettes) are very different scopes, not decided which.
- **Power-ups beyond Shield** (rapid-fire, multi-shot, stacking shield
  charges, etc.) — Shield alone is v1 scope (see above); everything else
  in this space waits until v1 is proven fun without it.
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
- **Touch/mobile controls.**
- **Online multiplayer.** Local input only for the foreseeable future —
  a real netcode project, not a natural extension of this one.

## Not yet started

- Actual project scaffolding — `docs/technical_design.md` now exists
  (stack, physics/input/testing architecture, v1 tuning defaults all
  decided), so nothing's blocking a first `npm create vite` pass anymore.
- Deployment wiring in the shared `Dockerfile`/`nginx.conf` for Debris
  specifically (see `docs/technical_design.md`'s last note).
