import { describe, expect, it } from 'vitest';
import { formatStageTimer } from '../src/utilities/StageTimer';

describe('formatStageTimer', () => {
  it('formats zero', () => {
    expect(formatStageTimer(0)).toBe('00:00.000');
  });

  it('formats sub-second milliseconds', () => {
    expect(formatStageTimer(432)).toBe('00:00.432');
  });

  it('formats seconds and milliseconds', () => {
    expect(formatStageTimer(65_432)).toBe('01:05.432');
  });

  it('formats double-digit minutes', () => {
    expect(formatStageTimer(12 * 60_000 + 3_000 + 7)).toBe('12:03.007');
  });

  it('floors fractional milliseconds', () => {
    expect(formatStageTimer(1_999.9)).toBe('00:01.999');
  });

  it('clamps negative input to zero', () => {
    expect(formatStageTimer(-50)).toBe('00:00.000');
  });
});
