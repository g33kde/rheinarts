import { describe, expect, it } from 'vitest';
import { containScale } from '../src/utilities/ImageFit';

describe('containScale', () => {
  it('is width-constrained when content is relatively wider than the bounds', () => {
    // 1672x941 art (16:9-ish) into a 960x640 (3:2) canvas: width is the tighter fit.
    const scale = containScale(1672, 941, 960, 640);
    expect(scale).toBeCloseTo(960 / 1672, 5);
    expect(scale * 941).toBeLessThanOrEqual(640);
  });

  it('is height-constrained when content is relatively taller than the bounds', () => {
    const scale = containScale(400, 900, 960, 640);
    expect(scale).toBeCloseTo(640 / 900, 5);
    expect(scale * 400).toBeLessThanOrEqual(960);
  });

  it('is 1 when content already matches the bounds exactly', () => {
    expect(containScale(960, 640, 960, 640)).toBe(1);
  });
});
