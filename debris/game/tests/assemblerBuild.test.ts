import { describe, expect, it } from 'vitest';
import {
  absorbAsteroid,
  applyAssemblerHit,
  assemblerProgress,
  initialAssemblerState,
  isAssemblerActive,
  starveAssembler,
  type AssemblerConfig,
} from '../src/systems/AssemblerBuild';

const CONFIG: AssemblerConfig = { platesToComplete: 5, hpPerPlate: 4 };

function fedTo(plates: number) {
  let state = initialAssemblerState();
  for (let i = 0; i < plates; i += 1) state = absorbAsteroid(state, CONFIG);
  return state;
}

describe('absorbAsteroid', () => {
  it('starts empty and still assembling', () => {
    const state = initialAssemblerState();
    expect(state).toEqual({ plates: 0, hp: 0, phase: 'assembling' });
    expect(isAssemblerActive(state)).toBe(false);
  });

  it('adds a plate per asteroid while below the threshold', () => {
    expect(fedTo(3).plates).toBe(3);
    expect(fedTo(3).phase).toBe('assembling');
  });

  it('comes alive on the final plate', () => {
    const complete = fedTo(5);
    expect(complete.phase).toBe('complete');
    expect(isAssemblerActive(complete)).toBe(true);
  });

  it('scales its HP by how much it managed to eat', () => {
    expect(fedTo(5).hp).toBe(20); // 5 plates * 4
  });

  it('stops eating once complete', () => {
    const complete = fedTo(5);
    expect(absorbAsteroid(complete, CONFIG)).toBe(complete);
  });
});

describe('applyAssemblerHit', () => {
  it('knocks plates back off while assembling instead of dealing damage', () => {
    const state = applyAssemblerHit(fedTo(3));
    expect(state.plates).toBe(2);
    expect(state.phase).toBe('assembling');
  });

  it('honors a bigger damage value when knocking plates off (Heavy Shot)', () => {
    expect(applyAssemblerHit(fedTo(3), 2).plates).toBe(1);
  });

  it('never knocks plates below zero', () => {
    expect(applyAssemblerHit(fedTo(1), 9).plates).toBe(0);
  });

  it('deals real damage once complete', () => {
    const hit = applyAssemblerHit(fedTo(5), 3);
    expect(hit.hp).toBe(17);
    expect(hit.phase).toBe('complete');
  });

  it('collapses when its HP runs out', () => {
    const dead = applyAssemblerHit(fedTo(5), 999);
    expect(dead.hp).toBe(0);
    expect(dead.phase).toBe('collapsed');
    expect(isAssemblerActive(dead)).toBe(false);
  });

  it('is inert once collapsed', () => {
    const dead = applyAssemblerHit(fedTo(5), 999);
    expect(applyAssemblerHit(dead)).toBe(dead);
  });
});

describe('starveAssembler', () => {
  it('collapses one that never finished - clearing the field is a real counter', () => {
    expect(starveAssembler(fedTo(4)).phase).toBe('collapsed');
  });

  it('does nothing to one that already completed - the rocks stopped mattering', () => {
    const complete = fedTo(5);
    expect(starveAssembler(complete)).toBe(complete);
  });
});

describe('assemblerProgress', () => {
  it('reports build progress for the gauge', () => {
    expect(assemblerProgress(fedTo(0), CONFIG)).toBe(0);
    expect(assemblerProgress(fedTo(2), CONFIG)).toBeCloseTo(0.4, 10);
    expect(assemblerProgress(fedTo(5), CONFIG)).toBe(1);
  });

  it('never exceeds 1', () => {
    expect(assemblerProgress({ plates: 99, hp: 0, phase: 'complete' }, CONFIG)).toBe(1);
  });
});
