import { describe, expect, it } from 'vitest';
import { canAfford, purchaseUpgrade, type ScrapCosts } from '../src/systems/WeaponShop';

const COSTS: ScrapCosts = { splitshot: 5, rapidFire: 5, heavyShot: 5 };

describe('canAfford', () => {
  it('is true when scrap meets the cost exactly', () => {
    expect(canAfford(5, 'splitshot', COSTS)).toBe(true);
  });

  it('is false when scrap falls short', () => {
    expect(canAfford(4, 'splitshot', COSTS)).toBe(false);
  });
});

describe('purchaseUpgrade', () => {
  it('deducts the cost and adds the upgrade on a successful purchase', () => {
    const result = purchaseUpgrade(10, new Set(), 'heavyShot', COSTS);
    expect(result).toEqual({ success: true, scrap: 5, activeUpgrades: new Set(['heavyShot']) });
  });

  it('fails without mutating state when the player can\'t afford it', () => {
    const active = new Set<'splitshot'>();
    const result = purchaseUpgrade(4, active, 'splitshot', COSTS);
    expect(result).toEqual({ success: false, scrap: 4, activeUpgrades: active });
  });

  it('fails without double-charging when the upgrade is already owned', () => {
    const active = new Set<'rapidFire'>(['rapidFire']);
    const result = purchaseUpgrade(10, active, 'rapidFire', COSTS);
    expect(result).toEqual({ success: false, scrap: 10, activeUpgrades: active });
  });

  it('leaves other owned upgrades intact when adding a new one', () => {
    const active = new Set<'splitshot'>(['splitshot']);
    const result = purchaseUpgrade(10, active, 'heavyShot', COSTS);
    expect(result.activeUpgrades).toEqual(new Set(['splitshot', 'heavyShot']));
  });

  it('does not mutate the input set (functional update)', () => {
    const active = new Set<'splitshot'>();
    purchaseUpgrade(10, active, 'splitshot', COSTS);
    expect(active.size).toBe(0);
  });
});
