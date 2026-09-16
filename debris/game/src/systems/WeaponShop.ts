import type { WeaponUpgradeId } from './WeaponUpgrades';

/**
 * The round/shop integration's actual logic, deliberately UI-free ("weapon
 * logic should be separated from UI and shop logic," per the brief) - no
 * Phaser import, no scene, no button. A future shop scene calls
 * `purchaseUpgrade` (or `GameScene.purchaseWeaponUpgrade`, the thin
 * wrapper that applies the result to a live player) and renders whatever
 * it gets back; this module doesn't know or care how it's displayed.
 *
 * Scrap costs are a plain `Record` rather than importing
 * `GameConfig.ts`'s `WEAPON_UPGRADES.costs` directly, same "caller
 * supplies its own config" shape `WeaponUpgrades.ts` uses - keeps this
 * testable with literal costs, no GameConfig coupling.
 */
export type ScrapCosts = Record<WeaponUpgradeId, number>;

export function canAfford(scrap: number, upgradeId: WeaponUpgradeId, costs: ScrapCosts): boolean {
  return scrap >= costs[upgradeId];
}

export interface PurchaseResult {
  readonly success: boolean;
  readonly scrap: number;
  readonly activeUpgrades: ReadonlySet<WeaponUpgradeId>;
}

/**
 * Pure purchase resolution: checks affordability, deducts Scrap, and
 * applies the upgrade - the three "shop should support" bullets from the
 * brief that aren't just UI. No-ops (`success: false`, state unchanged)
 * if the player can't afford it or already owns the upgrade - each
 * upgrade is a one-time unlock, not a stacking multi-buy, so a repeat
 * purchase attempt is a normal outcome to report, not an error to throw.
 * "Keeping purchased upgrades for the remainder of the current
 * game/session" falls out for free: the caller (`GameScene.
 * purchaseWeaponUpgrade`) writes the returned `activeUpgrades` back onto
 * `PlayerSlot.weapon`, which already lives for the whole round.
 */
export function purchaseUpgrade(
  scrap: number,
  activeUpgrades: ReadonlySet<WeaponUpgradeId>,
  upgradeId: WeaponUpgradeId,
  costs: ScrapCosts,
): PurchaseResult {
  if (activeUpgrades.has(upgradeId) || !canAfford(scrap, upgradeId, costs)) {
    return { success: false, scrap, activeUpgrades };
  }
  const next = new Set(activeUpgrades);
  next.add(upgradeId);
  return { success: true, scrap: scrap - costs[upgradeId], activeUpgrades: next };
}
