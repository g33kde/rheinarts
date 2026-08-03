# Progression

Permanent unlocks between runs. Temporary upgrades during runs.

## Current implementation (v0.1)

**Run-scoped upgrades** (`src/systems/UpgradeSystem.ts`) — reset every run,
picked up from pickups placed at random open cells each maze
(`src/systems/PickupPlacement.ts`, `src/entities/Pickup.ts`):

- **Speed** — multiplies move speed (stacks multiplicatively if picked up
  more than once).
- **Rapid Fire** — multiplies (reduces) fire cooldown.
- **Extra Life** — immediate `+1` life; handled via `HealthSystem`, not the
  upgrade-state object, since it's a one-shot effect rather than a
  persistent multiplier.

**Permanent unlocks between runs** (`src/systems/ProgressionStorage.ts`) —
persisted to `localStorage` under the key `godspeed:progression`:

- Currently a single unlock: clearing a maze for the first time ever
  permanently grants `+1` starting life on every future run
  (`bonusStartingLives`). This exists to prove out the
  persist-across-restarts mechanism, not as a considered piece of meta-
  progression design — there's no unlock tree, currency, or UI for this yet.

Not yet implemented: any of it surfacing in a menu/UI (pickups and the
permanent bonus are both invisible except via the HUD's life count),
multiple permanent unlocks, unlockable characters/cosmetics (see
`docs/game_ideas.md`), and anything resembling a shop or choice-driven
upgrade screen between floors.
