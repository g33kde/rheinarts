# Roadmap

1. ~~Player movement & shooting~~ ✅ done
2. ~~Procedural maze~~ ✅ done
3. ~~Enemy AI~~ ✅ done, now with all 5 types (Drone, Sentinel, Seeker, Bulwark, Skirmisher) and per-floor roster composition, see docs/enemy_design.md
4. ~~Complete gameplay loop~~ ✅ done (lives, game over, win-by-clearing, restart; now multi-floor rather than flat restart, see docs/progression.md)
5. ~~Roguelite upgrades~~ ✅ done (run-scoped pickups incl. Shield + one permanent unlock; see docs/progression.md for what's still missing)
6. ~~Boss~~ ✅ done (tankier chaser + ranged attack, spawns once regular enemies are cleared, stats now scale with floor depth; see docs/enemy_design.md)
7. ~~Three biomes~~ ✅ done (environment palette now keyed to floor depth, not lifetime maze count; no per-biome gameplay variation yet, see docs/level_design.md)
8. Polish - in progress: multi-floor descent, full 5-enemy roster, and the Shield upgrade all landed under this item, plus a balance fix (Speed/Rapid Fire were compounding unbounded every floor - now capped, see docs/progression.md); still open: menu hit-zone alignment (parked), asset compression, any run-timer pressure toward the 5-15 minute target, floor-depth UI beyond a plain HUD number
9. ~~Docker image~~ ✅ done and verified: `docker build --platform linux/amd64 -t rheinarts:test .` succeeds end to end (`node:22-alpine` stage - `npm ci`, 0 vulnerabilities, then `npm run build` - copied into the nginx stage alongside the portal and HyperOut). Ran the built image locally and curled it: portal `/` (200), `/godspeed` → `/godspeed/` redirect (301), `/godspeed/` index, the built JS bundle, and a bundled image all resolve (200) at the `/godspeed/` subpath, `/hyperout/` still works unaffected, `/healthz` still passes. See root DEPLOYMENT.md.
10. Kubernetes deployment - no k8s-specific changes needed (same single image, one more served path). Local build is verified; not yet pushed to GHCR or applied to the cluster - that's the user's call to make (credentials + affects a shared/live cluster), not something to do unprompted from here.
    - Godspeed also now has a cabinet on the rheinarts.de portal (`web/index.html`), marked `BETA` (distinct orange badge from HyperOut's `PLAYABLE` cyan), linking to `/godspeed/index.html` - replaces one of the two "coming soon" placeholder cards. Rebuilt the full Docker image and curled the actual served portal HTML to confirm the card, badge, thumbnail, and link all resolve correctly - not just eyeballed the markup. See root ROADMAP.md's "Grow the arcade" item.
11. Electron port
12. Local co-op
