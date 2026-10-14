import { describe, expect, it } from 'vitest';
import { safeEqual } from '../src/systems/SafeEqual';

describe('safeEqual', () => {
  it('matches equal strings, including empty ones', () => {
    expect(safeEqual('hunter2', 'hunter2')).toBe(true);
    expect(safeEqual('', '')).toBe(true);
  });

  it('rejects any difference', () => {
    expect(safeEqual('hunter2', 'hunter3')).toBe(false);
    expect(safeEqual('hunter2', 'Hunter2')).toBe(false);
    expect(safeEqual('a', 'b')).toBe(false);
  });

  it('rejects a prefix in either direction', () => {
    expect(safeEqual('hunter', 'hunter2')).toBe(false);
    expect(safeEqual('hunter2', 'hunter')).toBe(false);
    expect(safeEqual('', 'x')).toBe(false);
    expect(safeEqual('x', '')).toBe(false);
  });

  it('handles non-ASCII and NUL characters', () => {
    expect(safeEqual('pässwörd', 'pässwörd')).toBe(true);
    expect(safeEqual('a\0', 'a')).toBe(false);
  });
});
