import { describe, expect, it } from 'vitest';
import { applyHit, determinePhase } from '../src/systems/CardinalCombat';

describe('applyHit', () => {
  it('decrements hp by one', () => {
    expect(applyHit(20)).toEqual({ hp: 19, destroyed: false });
  });

  it('reports destroyed once hp reaches zero', () => {
    expect(applyHit(1)).toEqual({ hp: 0, destroyed: true });
  });

  it('never goes negative on an extra hit past zero', () => {
    expect(applyHit(0)).toEqual({ hp: 0, destroyed: true });
  });
});

describe('determinePhase', () => {
  it('is armed while any arm is still alive', () => {
    expect(determinePhase([true, true, true, true], false)).toBe('armed');
    expect(determinePhase([false, false, true, false], false)).toBe('armed');
  });

  it('is coreExposed once every arm is dead but the core is not', () => {
    expect(determinePhase([false, false, false, false], false)).toBe('coreExposed');
  });

  it('is critical once the core is destroyed', () => {
    expect(determinePhase([false, false, false, false], true)).toBe('critical');
  });

  it('coreDestroyed wins even if arm state somehow still reports alive arms', () => {
    expect(determinePhase([true, false, false, false], true)).toBe('critical');
  });
});
