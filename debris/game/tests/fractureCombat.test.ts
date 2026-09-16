import { describe, expect, it } from 'vitest';
import { applyHit } from '../src/systems/FractureCombat';

describe('applyHit', () => {
  it('decrements hitsRemaining by one', () => {
    expect(applyHit(30)).toEqual({ hitsRemaining: 29, destroyed: false });
  });

  it('reports destroyed once hitsRemaining reaches zero', () => {
    expect(applyHit(1)).toEqual({ hitsRemaining: 0, destroyed: true });
  });

  it('never goes negative on an extra hit past zero', () => {
    expect(applyHit(0)).toEqual({ hitsRemaining: 0, destroyed: true });
  });

  it('decrements by a larger damage amount when given one (Heavy Shot)', () => {
    expect(applyHit(30, 4)).toEqual({ hitsRemaining: 26, destroyed: false });
  });

  it('clamps a damage amount that overkills to exactly zero, still destroyed', () => {
    expect(applyHit(2, 4)).toEqual({ hitsRemaining: 0, destroyed: true });
  });
});
