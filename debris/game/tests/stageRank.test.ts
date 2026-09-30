import { describe, expect, it } from 'vitest';
import { computeStageRank, type StageRankConfig, type StageStats } from '../src/systems/StageRank';

const CONFIG: StageRankConfig = {
  parTimeMs: 60000,
  cleanlinessPenaltyPerHit: 0.34,
  accuracyWeight: 1,
  cleanlinessWeight: 1,
  speedWeight: 1,
  thresholds: { s: 0.85, a: 0.7, b: 0.5 },
};

const perfect: StageStats = { shotsFired: 10, shotsHit: 10, hitsTaken: 0, elapsedMs: 30000 };

describe('computeStageRank', () => {
  it('gives an S for a fast, accurate, untouched clear', () => {
    expect(computeStageRank(perfect, CONFIG).letter).toBe('S');
  });

  it('gives a C for a slow, inaccurate, badly damaged clear', () => {
    const bad: StageStats = { shotsFired: 40, shotsHit: 4, hitsTaken: 3, elapsedMs: 240000 };
    expect(computeStageRank(bad, CONFIG).letter).toBe('C');
  });

  it('drops the rank as damage is taken, all else equal', () => {
    const clean = computeStageRank(perfect, CONFIG).score;
    const oneHit = computeStageRank({ ...perfect, hitsTaken: 1 }, CONFIG).score;
    const twoHits = computeStageRank({ ...perfect, hitsTaken: 2 }, CONFIG).score;
    expect(oneHit).toBeLessThan(clean);
    expect(twoHits).toBeLessThan(oneHit);
  });

  it('drops the rank as accuracy falls, all else equal', () => {
    const accurate = computeStageRank(perfect, CONFIG).score;
    const sloppy = computeStageRank({ ...perfect, shotsHit: 3 }, CONFIG).score;
    expect(sloppy).toBeLessThan(accurate);
  });

  it('drops the rank the longer a stage drags on', () => {
    const quick = computeStageRank(perfect, CONFIG).score;
    const slow = computeStageRank({ ...perfect, elapsedMs: 180000 }, CONFIG).score;
    expect(slow).toBeLessThan(quick);
  });

  it('scores accuracy neutrally rather than zero when nothing was fired', () => {
    // "cleared it without shooting" must not rank below "missed everything"
    const noShots = computeStageRank({ shotsFired: 0, shotsHit: 0, hitsTaken: 0, elapsedMs: 30000 }, CONFIG);
    const allMisses = computeStageRank({ shotsFired: 20, shotsHit: 0, hitsTaken: 0, elapsedMs: 30000 }, CONFIG);
    expect(noShots.score).toBeGreaterThan(allMisses.score);
  });

  it('keeps the blended score inside 0-1 even at absurd inputs', () => {
    const absurd = computeStageRank(
      { shotsFired: 1, shotsHit: 999, hitsTaken: 999, elapsedMs: 1 },
      CONFIG,
    );
    expect(absurd.score).toBeGreaterThanOrEqual(0);
    expect(absurd.score).toBeLessThanOrEqual(1);
  });

  it('beats par time without letting speed exceed full marks', () => {
    const atPar = computeStageRank({ ...perfect, elapsedMs: CONFIG.parTimeMs }, CONFIG).score;
    const wayUnder = computeStageRank({ ...perfect, elapsedMs: 1000 }, CONFIG).score;
    expect(wayUnder).toBeGreaterThanOrEqual(atPar);
    expect(wayUnder).toBeLessThanOrEqual(1);
  });
});
