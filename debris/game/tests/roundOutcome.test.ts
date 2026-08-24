import { describe, expect, it } from 'vitest';
import { evaluateRoundOutcome } from '../src/systems/RoundOutcome';

describe('evaluateRoundOutcome - cooperative', () => {
  it('continues while at least one ship is alive', () => {
    expect(evaluateRoundOutcome([true, false], 'cooperative')).toEqual({ status: 'continue' });
  });

  it('is a loss once every ship is gone', () => {
    expect(evaluateRoundOutcome([false, false], 'cooperative')).toEqual({ status: 'loss' });
  });
});

describe('evaluateRoundOutcome - competitive', () => {
  it('continues with more than one ship alive', () => {
    expect(evaluateRoundOutcome([true, true], 'competitive')).toEqual({ status: 'continue' });
  });

  it('declares the sole survivor the winner', () => {
    expect(evaluateRoundOutcome([false, true], 'competitive')).toEqual({ status: 'win', winnerIndex: 1 });
    expect(evaluateRoundOutcome([true, false], 'competitive')).toEqual({ status: 'win', winnerIndex: 0 });
  });

  it('is a draw when the last two ships go down together', () => {
    expect(evaluateRoundOutcome([false, false], 'competitive')).toEqual({ status: 'draw' });
  });
});
