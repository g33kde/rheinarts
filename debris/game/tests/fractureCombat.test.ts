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
});
