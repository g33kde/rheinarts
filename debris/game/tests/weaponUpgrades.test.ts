import { describe, expect, it } from 'vitest';
import {
  computeFireCooldownMs,
  computeImpulseVelocity,
  computeMaxOnScreenShots,
  computeShotSpecs,
  hasUpgrade,
  nextShopCursor,
  type WeaponUpgradeConfig,
  type WeaponUpgradeId,
  type WeaponUpgradeState,
} from '../src/systems/WeaponUpgrades';

const CONFIG: WeaponUpgradeConfig = {
  base: { radius: 2.5, speed: 8, damage: 1, kineticImpulse: 0 },
  splitshot: { spreadRad: Math.PI / 12 },
  rapidFire: { cooldownMultiplier: 0.5 },
  heavyShot: { radius: 7, speed: 4, damage: 4, kineticImpulse: 1.5 },
};

function stateWith(...ids: WeaponUpgradeId[]): WeaponUpgradeState {
  return { active: new Set(ids) };
}

describe('hasUpgrade', () => {
  it('is false for an upgrade not in the active set', () => {
    expect(hasUpgrade(stateWith(), 'splitshot')).toBe(false);
  });

  it('is true once the upgrade is active', () => {
    expect(hasUpgrade(stateWith('splitshot'), 'splitshot')).toBe(true);
  });
});

describe('computeShotSpecs', () => {
  it('fires a single base-weapon shot straight ahead with no upgrades', () => {
    const specs = computeShotSpecs(stateWith(), Math.PI / 2, CONFIG);
    expect(specs).toEqual([{ headingRad: Math.PI / 2, radius: 2.5, speed: 8, damage: 1, kineticImpulse: 0 }]);
  });

  it('fans out 3 base-weapon shots with Splitshot alone', () => {
    const specs = computeShotSpecs(stateWith('splitshot'), 0, CONFIG);
    expect(specs.map((s) => s.headingRad)).toEqual([-Math.PI / 12, 0, Math.PI / 12]);
    specs.forEach((s) => expect(s).toMatchObject({ radius: 2.5, speed: 8, damage: 1, kineticImpulse: 0 }));
  });

  it('fires a single heavy shot with Heavy Shot alone', () => {
    const specs = computeShotSpecs(stateWith('heavyShot'), 0, CONFIG);
    expect(specs).toEqual([{ headingRad: 0, radius: 7, speed: 4, damage: 4, kineticImpulse: 1.5 }]);
  });

  it('composes Splitshot + Heavy Shot into 3 heavy pellets, per the brief\'s own example', () => {
    const specs = computeShotSpecs(stateWith('splitshot', 'heavyShot'), 0, CONFIG);
    expect(specs).toHaveLength(3);
    specs.forEach((s) => expect(s).toMatchObject({ radius: 7, speed: 4, damage: 4, kineticImpulse: 1.5 }));
  });

  it('Rapid Fire alone does not change the shot list at all - it only changes fire cadence', () => {
    const withRapid = computeShotSpecs(stateWith('rapidFire'), 0, CONFIG);
    const withoutRapid = computeShotSpecs(stateWith(), 0, CONFIG);
    expect(withRapid).toEqual(withoutRapid);
  });
});

describe('computeFireCooldownMs', () => {
  it('returns the base cooldown unchanged without Rapid Fire', () => {
    expect(computeFireCooldownMs(stateWith(), 250, CONFIG)).toBe(250);
  });

  it('multiplies the cooldown down with Rapid Fire', () => {
    expect(computeFireCooldownMs(stateWith('rapidFire'), 250, CONFIG)).toBe(125);
  });
});

describe('computeMaxOnScreenShots', () => {
  it('returns the base cap unchanged without Splitshot', () => {
    expect(computeMaxOnScreenShots(stateWith(), 4)).toBe(4);
  });

  it('triples the cap with Splitshot, so a full volley never gets throttled by leftover v1 tuning', () => {
    expect(computeMaxOnScreenShots(stateWith('splitshot'), 4)).toBe(12);
  });
});

describe('computeImpulseVelocity', () => {
  it('returns null outside the impulse radius', () => {
    expect(computeImpulseVelocity({ x: 0, y: 0 }, { x: 200, y: 0 }, 0, 1.5, 90)).toBeNull();
  });

  it('pushes a target at the impact point along the shot heading, at full strength', () => {
    const push = computeImpulseVelocity({ x: 0, y: 0 }, { x: 0, y: 0 }, Math.PI, 1.5, 90);
    expect(push?.x).toBeCloseTo(-1.5);
    expect(push?.y).toBeCloseTo(0);
  });

  it('pushes a nearby-but-not-coincident target radially outward from the impact point, not along the shot heading', () => {
    // Target sits due east of the impact point - radial push should point east (+x), regardless of shotHeadingRad.
    const push = computeImpulseVelocity({ x: 0, y: 0 }, { x: 45, y: 0 }, Math.PI / 2, 2, 90);
    expect(push?.x).toBeGreaterThan(0);
    expect(push?.y).toBeCloseTo(0, 5);
  });

  it('falls off linearly with distance - a target at the radius edge gets ~0 strength', () => {
    const push = computeImpulseVelocity({ x: 0, y: 0 }, { x: 90, y: 0 }, 0, 2, 90);
    expect(Math.hypot(push!.x, push!.y)).toBeCloseTo(0, 5);
  });
});

describe('nextShopCursor', () => {
  it('cycles forward through the 3 upgrades in order, then to ready', () => {
    expect(nextShopCursor('splitshot', 1)).toBe('rapidFire');
    expect(nextShopCursor('rapidFire', 1)).toBe('heavyShot');
    expect(nextShopCursor('heavyShot', 1)).toBe('ready');
  });

  it('wraps forward from ready back to the first upgrade', () => {
    expect(nextShopCursor('ready', 1)).toBe('splitshot');
  });

  it('cycles backward through the list symmetrically', () => {
    expect(nextShopCursor('ready', -1)).toBe('heavyShot');
    expect(nextShopCursor('heavyShot', -1)).toBe('rapidFire');
    expect(nextShopCursor('rapidFire', -1)).toBe('splitshot');
  });

  it('wraps backward from the first upgrade to ready', () => {
    expect(nextShopCursor('splitshot', -1)).toBe('ready');
  });
});
