import { describe, expect, it } from 'vitest';
import { computeBotIntent, DEFAULT_BOT_TUNING, shortestAngleDelta } from '../src/systems/DemoBot';

describe('shortestAngleDelta', () => {
  it('returns zero for identical headings', () => {
    expect(shortestAngleDelta(1.2, 1.2)).toBe(0);
  });

  it('takes the short way around rather than the long way', () => {
    // from just below +pi to just above -pi is a small step, not a near-full turn
    expect(shortestAngleDelta(3.0, -3.0)).toBeCloseTo(0.2832, 3);
    expect(Math.abs(shortestAngleDelta(3.0, -3.0))).toBeLessThan(Math.PI);
  });

  it('signs the direction of the turn', () => {
    expect(shortestAngleDelta(0, 0.5)).toBeGreaterThan(0);
    expect(shortestAngleDelta(0, -0.5)).toBeLessThan(0);
  });
});

describe('computeBotIntent', () => {
  const origin = { x: 0, y: 0 };

  it('idles when there is nothing to shoot', () => {
    expect(computeBotIntent(origin, 0, [])).toEqual({
      turnDirection: 0,
      isThrusting: false,
      isFiring: false,
    });
  });

  it('turns toward a target off to one side', () => {
    // target straight down (+y is down on screen) while facing right
    const intent = computeBotIntent(origin, 0, [{ x: 0, y: 200 }]);
    expect(intent.turnDirection).toBe(1);
    expect(intent.isFiring).toBe(false);
  });

  it('turns the other way for a target on the other side', () => {
    const intent = computeBotIntent(origin, 0, [{ x: 0, y: -200 }]);
    expect(intent.turnDirection).toBe(-1);
  });

  it('stops correcting and fires once lined up', () => {
    const intent = computeBotIntent(origin, 0, [{ x: 200, y: 0 }]);
    expect(intent.turnDirection).toBe(0);
    expect(intent.isFiring).toBe(true);
  });

  it('picks the nearest of several targets', () => {
    // far target dead ahead, near target behind - it should turn around
    const intent = computeBotIntent(origin, 0, [
      { x: 900, y: 0 },
      { x: -150, y: 0 },
    ]);
    expect(intent.isFiring).toBe(false);
    expect(intent.turnDirection).not.toBe(0);
  });

  it('thrusts to close a long gap when facing the target', () => {
    const far = DEFAULT_BOT_TUNING.approachDistancePx + 100;
    expect(computeBotIntent(origin, 0, [{ x: far, y: 0 }]).isThrusting).toBe(true);
  });

  it('thrusts to break away from something nearly on top of it', () => {
    const close = DEFAULT_BOT_TUNING.evadeDistancePx - 30;
    expect(computeBotIntent(origin, 0, [{ x: close, y: 0 }]).isThrusting).toBe(true);
  });

  it('holds position at a comfortable mid-range distance', () => {
    const mid = (DEFAULT_BOT_TUNING.evadeDistancePx + DEFAULT_BOT_TUNING.approachDistancePx) / 2;
    expect(computeBotIntent(origin, 0, [{ x: mid, y: 0 }]).isThrusting).toBe(false);
  });

  it('never thrusts while facing away from where it wants to go', () => {
    const far = DEFAULT_BOT_TUNING.approachDistancePx + 100;
    // target far behind it - must turn first, not accelerate backwards
    expect(computeBotIntent(origin, Math.PI, [{ x: far, y: 0 }]).isThrusting).toBe(false);
  });
});
