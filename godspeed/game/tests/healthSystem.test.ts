import { describe, expect, it } from 'vitest';
import { applyHit, grantExtraLife, isGameOver, isInvulnerable } from '../src/systems/HealthSystem';

describe('isInvulnerable', () => {
  it('is true immediately after being hit', () => {
    expect(isInvulnerable(1000, 1050, 1200)).toBe(true);
  });

  it('is false once the grace period has elapsed', () => {
    expect(isInvulnerable(0, 1200, 1200)).toBe(false);
  });
});

describe('applyHit', () => {
  it('removes one life', () => {
    expect(applyHit(3)).toBe(2);
  });

  it('never goes below zero', () => {
    expect(applyHit(0)).toBe(0);
  });
});

describe('grantExtraLife', () => {
  it('adds one life', () => {
    expect(grantExtraLife(2)).toBe(3);
  });
});

describe('isGameOver', () => {
  it('is false while lives remain', () => {
    expect(isGameOver(1)).toBe(false);
  });

  it('is true at zero lives', () => {
    expect(isGameOver(0)).toBe(true);
  });
});
