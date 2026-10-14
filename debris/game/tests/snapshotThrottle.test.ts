import { describe, expect, it } from 'vitest';
import { SnapshotThrottle } from '../src/systems/SnapshotThrottle';

/** Frame times for a steady 60 fps host, optionally jittering every other frame. */
const frames = (count: number, jitterMs = 0) =>
  Array.from({ length: count }, (_, i) => i * (1000 / 60) + (i % 2 === 0 ? 0 : jitterMs));

describe('SnapshotThrottle', () => {
  it('sends every frame at 60 Hz', () => {
    const throttle = new SnapshotThrottle(60);
    expect(frames(120).every((t) => throttle.shouldSend(t))).toBe(true);
  });

  it('sends every second frame at 30 Hz on a 60 fps host', () => {
    const throttle = new SnapshotThrottle(30);
    const sent = frames(120).filter((t) => throttle.shouldSend(t));
    expect(sent.length).toBe(60);
  });

  it('keeps even spacing when frame times jitter slightly', () => {
    const throttle = new SnapshotThrottle(30);
    const sent = frames(240, -3).filter((t) => throttle.shouldSend(t));
    const gaps = sent.slice(1).map((t, i) => t - sent[i]!);
    expect(Math.max(...gaps)).toBeLessThan(40);
    expect(Math.min(...gaps)).toBeGreaterThan(26);
  });

  it('sends the very first frame immediately', () => {
    expect(new SnapshotThrottle(30).shouldSend(5000)).toBe(true);
  });

  it('resyncs after a long stall instead of sending a burst', () => {
    const throttle = new SnapshotThrottle(30);
    throttle.shouldSend(0);
    expect(throttle.shouldSend(5000)).toBe(true);
    expect(throttle.shouldSend(5017)).toBe(false);
  });

  it('averages the target rate over a second', () => {
    const throttle = new SnapshotThrottle(20);
    const sent = frames(600).filter((t) => throttle.shouldSend(t));
    expect(sent.length).toBeGreaterThanOrEqual(198);
    expect(sent.length).toBeLessThanOrEqual(202);
  });
});
