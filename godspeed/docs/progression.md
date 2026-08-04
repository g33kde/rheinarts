# Progression

Permanent unlocks between runs. Temporary upgrades during runs.

## Current implementation (v0.1)

**Multi-floor descent** (`GameScene.ts`) — a "run" is now more than one
maze. Defeating the boss shows "FLOOR N CLEARED" and, on continue, calls
`scene.restart({ floor: floor + 1, lives, upgrades })` - Phaser's
scene-restart data payload - so the next maze is harder (see
`docs/enemy_design.md` and `FloorDifficulty.ts`) while lives and run-scoped
upgrades carry over. Game over calls `scene.restart()` with no payload,
which resets to floor 1 with fresh lives/upgrades. Floor depth also
selects the biome (`BiomeSelection.ts`, floor 1 → Obsidian Depths, floor 2
→ Sapphire Vault, floor 3 → Violet Sanctum, cycling), so descending now
reads as moving through distinct environments in order rather than a
palette that happened to cycle by lifetime win count (that was the
previous, more arbitrary tie-in - see the biome CHANGELOG.md entry).
`FloorRoster.ts`'s `enemyRosterForFloor(floor)` decides which enemy types
appear: 1→all Drones, 2→adds a Sentinel, 3→adds a Seeker, 4→adds a
Bulwark, 5+→adds a Skirmisher (reusing floor 5's roster from then on, with
`FloorDifficulty.ts` continuing to raise enemy speed and boss stats past
that point instead of ever-longer rosters).

**Run-scoped upgrades** (`src/systems/UpgradeSystem.ts`) — reset at the
start of a fresh run (not between floors within the same run), picked up
from pickups placed at random open cells each maze
(`src/systems/PickupPlacement.ts`, `src/entities/Pickup.ts`). All 4 are
guaranteed to appear every floor - see `src/systems/FloorPickups.ts` -
which in turn is why Speed/Rapid Fire are capped (below): a guaranteed
multiplicative stack that a normal player picks up every floor compounds
whether they're skilled or not, which isn't really "reward," it's a
runaway curve. Caught after actual play - floor 5 was ~3.3x move speed and
~7.7x fire rate with zero player choice involved. See the CHANGELOG.md
entry for the full account.

- **Speed** — multiplies move speed, stacks multiplicatively, capped at
  `UPGRADE_EFFECTS.speedMultiplierCap` (2x base). Further pickups past the
  cap are harmless no-ops, not wasted currency - there's no way to "spend"
  a pickup on the wrong thing.
- **Rapid Fire** — multiplies (reduces) fire cooldown, stacks
  multiplicatively, floored at `UPGRADE_EFFECTS.fireCooldownMultiplierFloor`
  (never faster than ~3.3x base fire rate).
- **Shield** — grants a charge that blocks the next hit entirely: no life
  lost, no respawn-to-center, no invulnerability-window flinch. Stacks
  (multiple charges queue up), uncapped - unlike Speed/Rapid Fire this
  doesn't distort movement/combat feel by compounding, it's just a safety
  margin, so it didn't need a ceiling. Consumed in
  `GameScene.resolvePlayerContact` before life loss is even considered.
- **Extra Life** — immediate `+1` life; handled via `HealthSystem`, not the
  upgrade-state object, since it's a one-shot effect rather than a
  persistent multiplier. Only spawns on odd floors (`FloorPickups.ts`) -
  a free life every single floor regardless of skill was the same
  "guaranteed, not earned" problem as Speed/Rapid Fire, just less visibly
  broken. Its slot on even floors goes to a second Shield charge instead
  of just vanishing, so every floor still has exactly 4 pickups worth
  finding.

**Permanent unlocks between runs** (`src/systems/ProgressionStorage.ts`) —
persisted to `localStorage` under the key `godspeed:progression`:

- Currently a single unlock: clearing a maze for the first time ever
  permanently grants `+1` starting life on every future run
  (`bonusStartingLives`). This exists to prove out the
  persist-across-restarts mechanism, not as a considered piece of meta-
  progression design — there's no unlock tree, currency, or UI for this yet.
- `mazesCleared` (this unlock's counter) is a *lifetime* count across every
  run ever played, separate from the in-run `floor` number - clearing
  floor 3 of a single run increments it three times, same as clearing
  floor 1 of three separate runs would.

Not yet implemented: any of it surfacing in a menu/UI (pickups, the
permanent bonus, and floor depth are all invisible except via the HUD),
multiple permanent unlocks, unlockable characters/cosmetics (see
`docs/game_ideas.md`), and anything resembling a shop or choice-driven
upgrade screen between floors - upgrades are still purely pickup-in-the-
maze, not a decision point.
