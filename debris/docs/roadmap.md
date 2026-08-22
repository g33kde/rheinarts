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
5. [ ] Lives, respawn-with-invulnerability, scoring — scoring landed
   (destroying an asteroid awards points, tier-inverse per
   `docs/technical_design.md`). **Not** the lives/respawn/invulnerability
   system this item describes - what landed instead is simpler: an
   unshielded asteroid hit destroys the ship outright and ends the round
   ("GAME OVER, press any key to restart" - `this.scene.restart()`), no
   lives counter, no respawn-with-invulnerability window. `LIVES_PER_PLAYER`
   in `GameConfig.ts` still isn't read by anything. Revisit when this item
   is actually picked up.
6. [x] Shield power-up: pickup, single non-stacking charge, absorbs one hit
   — Diamond Core visual (`docs/art_direction.md`), drifts and wraps like
   everything else, spawns on `SHIELD.spawnIntervalMs`, absorbs exactly
   one asteroid hit (ship survives, charge consumed, asteroid untouched -
   same semantics as Godspeed's Shield, confirmed by reading its
   `consumeShieldCharge` call site), `shield-up.wav` on pickup, a thin
   sapphire ring on the ship while charged
7. [ ] Cooperative mode (shared arena, no friendly fire, individual lives)
8. [ ] Competitive mode (shared arena, friendly fire on, last ship standing)
9. [ ] Start screen / menu (decided — see `docs/art_direction.md`): title,
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
   play. Not yet checked off because one real piece is still missing:
   actual consumption of the mode/input selections — `GameScene` ignores
   them and always starts the same single-P1-keyboard slice regardless of
   what's picked. The Twin-Planets background is no longer this item's
   blocker: per explicit instruction it was built for the *play field*
   instead of the menu (see item 12 and CHANGELOG) - the menu's background
   stays a flat color deliberately, not as a gap
10. [x] Keyboard input: Player 1 (WASD+Space), Player 2 (Arrows+RCtrl) —
    both wired into `GameScene` now (see CHANGELOG): two `Ship`s, two
    independent `KeyboardInput` instances, per-player fire cooldown and
    on-screen-shot cap (`Projectile` gained `ownerIndex` so P1's shots
    don't eat into P2's budget or vice versa), one shared engine-sound
    loop across however many ships are actually thrusting. **Not** the
    "switchable to gamepad" half of this item, nor `MenuScene`'s P1/P2
    keyboard⇄gamepad toggle being consumed - both ships are keyboard-only
    regardless of what's selected on the menu; that's items 9's remaining
    gap and item 11 together, not this one
11. [ ] Gamepad input: any of the 4 slots (Gamepad API, stick/D-pad +
    trigger + face button), connection-order assignment across up to
    4 simultaneous controllers, not just 2
12. [ ] Synthwave/CRT visual pass (see `docs/art_direction.md`) — the
    "Twin Planets" background (name no longer includes "+ Nebula Haze" -
    that wash was removed on request) landed on the play field (star
    layers, `earth.jpg` and `jupiter.jpg` both circular-clipped - see
    CHANGELOG), redirected there from the menu per an earlier explicit
    instruction (doc updated), then trimmed further per a later one: no
    nebula wash, the procedural moon replaced by `jupiter.jpg` instead of
    kept. Simplified from the full spec: both planets are static, only
    the near star layer actually drifts. Still missing: the CRT scanline/
    glow overlay itself, screen shake and particle bursts on destruction,
    and any polish pass on the ship/asteroid/UFO shapes
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

### Co-op rescue mechanics

**Cooperative-only** (Competitive's whole identity is "last ship
standing" — a safety net there would undercut the mode, not enhance it).

A destroyed player isn't necessarily eliminated outright. Their pilot
ejects into a small, slow-drifting escape pod (wraps at arena edges like
everything else) instead of an instant respawn. Another player can fly
over and **rescue** them — but doing so leaves the rescuer exposed, which
is the whole point: it's a deliberate risk a teammate chooses to take,
not a free save. That's what produces the moment-to-moment drama —
*"GET HIM! GET HIM! GET HIM!"* — while the rest of the team is still
fighting off whatever killed the downed player in the first place.

**Open questions for whoever picks this up:**

- **Does this replace or sit alongside v1's respawn model?**
  `docs/gameplay.md` currently has destruction cost a life and auto-respawn
  after a brief invulnerability window, no rescue involved. The dramatic
  version of this idea implies rescue is what avoids losing a life at all
  — an un-rescued pod (destroyed, or timed out) is when the life actually
  gets spent, not the moment of the original explosion. That's a bigger
  stakes change than a cosmetic reskin of respawning, and needs an
  explicit decision, not a silent merge.
- **How is a rescue actually performed?** "While doing so, they're
  vulnerable" reads like a hold/channel over a short duration (fly close
  and stay there), not a drive-by touch-and-go — a touch-and-go wouldn't
  create sustained vulnerability. Leaning toward channel-based, but not
  decided.
- **Can the pod itself be destroyed** by an asteroid, the UFO, or (per the
  enemy roster above) something like a Saboteur's mine while waiting to
  be rescued? Almost certainly yes, for the same reason a timeout should
  probably exist — an un-rescued teammate needs to be genuinely at risk,
  not just parked safely until someone's free.
- **Is there a rescue timeout** independent of the pod being destroyed
  (pilot is lost if not rescued within N seconds), to stop a round
  stalling while everyone else just avoids danger to leave a rescue for
  later?

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
- **High-score persistence** (localStorage, same shape as Godspeed's
  `ProgressionStorage.ts`).
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
