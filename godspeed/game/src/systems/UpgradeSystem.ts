import { UPGRADE_EFFECTS } from '../config/GameConfig';

/**
 * Run-scoped pickups (see entities/Pickup.ts). These reset every run - they
 * are not the "permanent unlocks between runs" described in
 * docs/progression.md; that's systems/ProgressionStorage.ts. `extraLife` is
 * handled separately via HealthSystem.grantExtraLife since it's an instant
 * effect, not a persistent multiplier.
 */
export type UpgradeType = 'speed' | 'rapidFire' | 'extraLife';

export interface UpgradeState {
  readonly speedMultiplier: number;
  readonly fireCooldownMultiplier: number;
}

export function defaultUpgradeState(): UpgradeState {
  return { speedMultiplier: 1, fireCooldownMultiplier: 1 };
}

export function applyUpgrade(state: UpgradeState, type: UpgradeType): UpgradeState {
  switch (type) {
    case 'speed':
      return { ...state, speedMultiplier: state.speedMultiplier * UPGRADE_EFFECTS.speedMultiplier };
    case 'rapidFire':
      return {
        ...state,
        fireCooldownMultiplier:
          state.fireCooldownMultiplier * UPGRADE_EFFECTS.fireCooldownMultiplier,
      };
    case 'extraLife':
      return state;
  }
}
