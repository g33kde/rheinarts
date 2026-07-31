# Rhein Arts — Roadmap & Improvement Backlog

Ideas and planned work, captured for later. Unchecked = not started.

## HyperOut

- [ ] **Music on the splash screen.**
  The title/splash screen currently has no music (music starts once you reach the
  menu). Add a track to the splash. Caveat: browsers block audio until a user
  gesture, so it can only start after the first key/tap — which is also what
  advances splash → menu. Options: begin the track on that first input, or play a
  short intro sting. Decide whether to reuse `menu.mp3` or add a dedicated splash
  track.

- [ ] **Smarter CPU boost usage.**
  Today the CPU spends all 3 boosts immediately on the opening straightaway. It
  should hold boosts in reserve and only fire one when a crash is otherwise
  **inevitable** (defensive phase-escape through a wall), or for a genuinely
  decisive cut-off. Work in `aiDecide()` in `hyperout/game.js`: gate/remove the
  "offensive boost down a long clear runway" heuristic and strengthen the
  "boxed-in → phase out to survive" branch.

- [ ] **Level layouts with obstacles.**
  Design arena variants beyond the empty grid and the shrinking arena: pre-placed
  walls/blocks, central pillars, symmetric obstacle patterns, corridors/mazes.
  Add a level selector to the menu. Keep every layout symmetric so neither player
  is advantaged.

- [ ] **Announcer voice.**
  Audio for the `3 · 2 · 1` countdown and the result callouts — "BLUE WINS" /
  "RED WINS" (P1 = cyan, P2 = orange). Either recorded VO clips in `music/sfx/`
  or a synthesized retro voice. Hook into the countdown and `endRound()`.

## Platform

- [ ] **iOS / touch fork (touchscreen controls).**
  A touch-controllable build for phones: on-screen D-pad or swipe-to-turn plus
  tap-to-boost, responsive in portrait and landscape. Ship first as an installable
  PWA (cheapest path), or wrap with Capacitor for the App Store. Two-players-on-one
  phone is awkward — make single-player-vs-CPU the mobile default.

## More gameplay

- [ ] **Online 2-player (netcode).** Play across two devices. The sim is already
  deterministic + fixed-timestep, which suits lockstep/rollback; simplest first
  cut is host-authoritative over WebSocket (or WebRTC data channel for P2P).

- [ ] **CPU difficulty levels.** Easy / Medium / Hard, exposed on the menu, by
  tuning the flood-fill depth, turn jitter, and how aggressively it defends —
  `AI_FLOOD_LIMIT` / `aiDecide()` in `hyperout/game.js`.

- [ ] **3–4 player local mode.** More start positions + key maps (e.g. IJKL, arrows,
  numpad) for a party/arcade feel. Grid is already big enough.

- [ ] **Extra modes / power-ups.** Optional pickups (speed pad, one-shot wall break,
  short teleport) or a "trail decays over time" snake-style variant. Keep as
  opt-in modes so the pure game stays intact.

- [ ] **Tunable speed & round length.** Menu options for starting speed / ramp and
  the arena size, for faster or more tactical matches.

## UX & accessibility

- [ ] **Persist settings (localStorage).** Music/SFX volume, mute, mode, "first to",
  and shrinking-arena all reset on every load today — remember them.

- [ ] **Respect `prefers-reduced-motion`.** Dial back CRT scanlines, grid scroll,
  logo float, and screen shake for motion-sensitive players (portal + game).

- [ ] **Colorblind support + help screen.** Add shapes/labels alongside the
  cyan/orange coding, and a controls/help overlay from the menu and pause screen.

## Audio & visual

- [ ] **More in-game tracks.** The random playlist already supports it — just add
  files to `music/game/` and list them in `tracks.json`.

- [ ] **Round polish.** A "GO!" flash when the countdown ends and a short winner
  celebration (derezz confetti in the winner's color) on `endRound()`.

## Portal (rheinarts.de)

- [ ] **README + LICENSE.** A landing `README.md` (what Rhein Arts is, how to run
  locally, deploy pointer) as the public repo's front page, plus a license.

- [ ] **Metadata & sharing.** Favicon, page title/description, and Open Graph tags
  so links to the site preview nicely. A retro-styled 404 page.

- [ ] **Grow the arcade.** Replace the "coming soon" cabinets with real games as
  they land; add a short "About Rhein Arts" blurb. Optional DE/EN toggle.

## Tech, build & ops

- [ ] **Asset cache-busting.** `nginx.conf` caches JS/CSS/images for 7 days, so a
  redeploy can serve stale files to returning visitors. Add content-hashed
  filenames or a version query so updates take effect immediately.

- [ ] **Multi-arch image.** Build with `docker buildx` for `amd64` + `arm64` so the
  image runs regardless of node architecture.

- [ ] **CI pipeline.** GitHub Actions to build and push to GHCR on tag/release
  (build-only runner is fine; deploy stays manual for the LAN cluster).

- [ ] **Automated sim tests.** A headless harness over the deterministic engine
  (the `#debug` hook already allows stepping) to guard boost timing, collisions,
  and CPU survival against regressions.

- [ ] **Decide the `#debug` hook's fate for prod.** It's hash-gated (inert without
  `#debug`) — keep it, or strip it from the built image.

- [ ] **Public domain + TLS.** Wire `www.rheinarts.de` with HTTPS when ready — see
  DEPLOYMENT.md (Cloudflare Tunnel, or port-forward + cert-manager).
