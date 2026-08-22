import { beforeEach, describe, expect, it } from 'vitest';
import { getMusicVolume, getSfxVolume, setMusicVolume, setSfxVolume } from '../src/systems/AudioSettings';

describe('AudioSettings', () => {
  beforeEach(() => {
    setMusicVolume(0.5);
    setSfxVolume(0.7);
  });

  it('defaults match HyperOut pause-menu defaults', () => {
    expect(getMusicVolume()).toBe(0.5);
    expect(getSfxVolume()).toBe(0.7);
  });

  it('clamps above 1 down to 1', () => {
    setMusicVolume(1.5);
    expect(getMusicVolume()).toBe(1);
  });

  it('clamps below 0 up to 0', () => {
    setSfxVolume(-0.2);
    expect(getSfxVolume()).toBe(0);
  });

  it('music and SFX volume are independent', () => {
    setMusicVolume(0.1);
    expect(getSfxVolume()).toBe(0.7);
  });
});
