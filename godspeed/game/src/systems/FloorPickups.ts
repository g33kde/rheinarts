import type { UpgradeType } from './UpgradeSystem';

/**
 * Which 4 pickups spawn on a given floor. Speed/Rapid Fire/Shield are
 * guaranteed every floor - Extra Life is a free life for free exploration
 * with no real cost, so it's curbed to odd floors only rather than every
 * one. On even floors its slot goes to a second Shield charge instead of
 * just disappearing, so every floor still has 4 pickups worth grabbing.
 */
export function pickupTypesForFloor(floor: number): UpgradeType[] {
  const grantsExtraLife = floor % 2 === 1;
  return ['speed', 'rapidFire', 'shield', grantsExtraLife ? 'extraLife' : 'shield'];
}
