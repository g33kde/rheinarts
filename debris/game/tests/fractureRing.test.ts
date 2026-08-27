import { describe, expect, it } from 'vitest';
import { ringLethalRadiusAt, ringPhaseAt } from '../src/systems/FractureRing';

const TELEGRAPH = 300;
const EXPAND = 500;
const FADE = 200;

describe('ringPhaseAt', () => {
  it('is telegraph before the telegraph window ends', () => {
    expect(ringPhaseAt(100, TELEGRAPH, EXPAND, FADE)).toBe('telegraph');
  });

  it('is expanding during the expand window', () => {
    expect(ringPhaseAt(TELEGRAPH + 100, TELEGRAPH, EXPAND, FADE)).toBe('expanding');
  });

  it('is fading during the fade window', () => {
    expect(ringPhaseAt(TELEGRAPH + EXPAND + 50, TELEGRAPH, EXPAND, FADE)).toBe('fading');
  });

  it('is done past all three windows', () => {
    expect(ringPhaseAt(TELEGRAPH + EXPAND + FADE + 1, TELEGRAPH, EXPAND, FADE)).toBe('done');
  });
});

describe('ringLethalRadiusAt', () => {
  it('is undefined during telegraph', () => {
    expect(ringLethalRadiusAt(100, TELEGRAPH, EXPAND, 135)).toBeUndefined();
  });

  it('grows linearly from 0 to maxRadius during expand', () => {
    expect(ringLethalRadiusAt(TELEGRAPH, TELEGRAPH, EXPAND, 135)).toBeCloseTo(0);
    expect(ringLethalRadiusAt(TELEGRAPH + EXPAND / 2, TELEGRAPH, EXPAND, 135)).toBeCloseTo(67.5);
  });

  it('is undefined once expand finishes (fading/done)', () => {
    expect(ringLethalRadiusAt(TELEGRAPH + EXPAND + 10, TELEGRAPH, EXPAND, 135)).toBeUndefined();
  });
});
