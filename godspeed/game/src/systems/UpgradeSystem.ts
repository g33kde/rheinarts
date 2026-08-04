import { UPGRADE_EFFECTS } from '../config/GameConfig';

/**
 * Run-scoped pickups (see entities/Pickup.ts). These reset every run - they
 * are not the "permanent unlocks between runs" described in
 * docs/progression.md; that's systems/ProgressionStorage.ts. `extraLife` is
 * handled separately via HealthSystem.grantExtraLife since it's an instant
 * effect, not a persistent multiplier.
 */
export type UpgradeType = 'speed' | 'rapidFire' | 'extraLife' | 'shield';

export interface UpgradeState {
  readonly speedMultiplier: number;
  readonly fireCooldownMultiplier: number;
  readonly shieldCharges: number;
}

export function defaultUpgradeState(): UpgradeState {
  return { speedMultiplier: 1, fireCooldownMultiplier: 1, shieldCharges: 0 };
}

export function applyUpgrade(state: UpgradeState, type: UpgradeType): UpgradeState {
  switch (type) {
    case 'speed':
      return {
        ...state,
        speedMultiplier: Math.min(
          UPGRADE_EFFECTS.speedMultiplierCap,
          state.speedMultiplier * UPGRADE_EFFECTS.speedMultiplierPerPickup,
        ),
      };
    case 'rapidFire':
      return {
        ...state,
        fireCooldownMultiplier: Math.max(
          UPGRADE_EFFECTS.fireCooldownMultiplierFloor,
          state.fireCooldownMultiplier * UPGRADE_EFFECTS.fireCooldownMultiplierPerPickup,
        ),
      };
    case 'shield':
      return {
        ...state,
        shieldCharges: state.shieldCharges + UPGRADE_EFFECTS.shieldChargesGranted,
      };
    case 'extraLife':
      return state;
  }
}

export function hasShieldCharge(state: UpgradeState): boolean {
  return state.shieldCharges > 0;
}

/** Consumes one charge to block a hit that would otherwise cost a life. */
export function consumeShieldCharge(state: UpgradeState): UpgradeState {
  return { ...state, shieldCharges: Math.max(0, state.shieldCharges - 1) };
}
