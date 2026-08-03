import { describe, expect, it } from 'vitest';
import { WARDEN_FRAMES } from '../src/config/WardenFrames';

const SHEET_SIZE = 1254;
const EXPECTED_FRAME_COUNTS: Record<keyof typeof WARDEN_FRAMES, number> = {
  idle: 7,
  walk: 8,
  shoot: 7,
  hurt: 4,
  die: 8,
};

describe('WARDEN_FRAMES', () => {
  it('has the expected number of frames per animation', () => {
    for (const [name, count] of Object.entries(EXPECTED_FRAME_COUNTS)) {
      expect(WARDEN_FRAMES[name as keyof typeof WARDEN_FRAMES]).toHaveLength(count);
    }
  });

  it('has only positive-size rects that fit within the source sheet', () => {
    for (const frames of Object.values(WARDEN_FRAMES)) {
      for (const rect of frames) {
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(SHEET_SIZE);
        expect(rect.y + rect.height).toBeLessThanOrEqual(SHEET_SIZE);
      }
    }
  });

  it('does not have two frames in the same row overlapping in x', () => {
    for (const frames of Object.values(WARDEN_FRAMES)) {
      const sorted = [...frames].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i += 1) {
        const previous = sorted[i - 1]!;
        const current = sorted[i]!;
        expect(current.x).toBeGreaterThanOrEqual(previous.x + previous.width);
      }
    }
  });
});
