import { describe, expect, it } from 'vitest';
import {
  EventDeduper,
  EventRecorder,
  isGameEvent,
  MAX_EVENTS_PER_SNAPSHOT,
  sanitizeEvents,
  type GameEvent,
} from '../src/systems/GameEvents';

const sfx = (id: number): GameEvent => ({ id, kind: 'sfx', sfx: 'shot' });

describe('isGameEvent', () => {
  it('accepts each kind of well-formed event', () => {
    expect(isGameEvent({ id: 1, kind: 'sfx', sfx: 'shipDestroyed' })).toBe(true);
    expect(isGameEvent({ id: 2, kind: 'burst', x: 100.5, y: 200, color: 0xff00aa, style: 'ufo' })).toBe(true);
    expect(isGameEvent({ id: 3, kind: 'shake', durationMs: 250, intensity: 0.01 })).toBe(true);
    expect(isGameEvent({ id: 4, kind: 'popup', x: 5, y: 6, color: 0x00ffff, amount: 200 })).toBe(true);
  });

  it('rejects unknown kinds, sounds, styles and a missing or bad id', () => {
    expect(isGameEvent({ id: 1, kind: 'nuke' })).toBe(false);
    expect(isGameEvent({ id: 1, kind: 'sfx', sfx: 'airhorn' })).toBe(false);
    expect(isGameEvent({ id: 1, kind: 'burst', x: 0, y: 0, color: 0, style: 'huge' })).toBe(false);
    expect(isGameEvent({ kind: 'sfx', sfx: 'shot' })).toBe(false);
    expect(isGameEvent({ id: 0, kind: 'sfx', sfx: 'shot' })).toBe(false);
    expect(isGameEvent({ id: 1.5, kind: 'sfx', sfx: 'shot' })).toBe(false);
    expect(isGameEvent({ id: '1', kind: 'sfx', sfx: 'shot' })).toBe(false);
    for (const junk of [null, undefined, 7, 'x', [], true]) expect(isGameEvent(junk)).toBe(false);
  });

  it('refuses coordinates, colours and amounts that cannot be real', () => {
    const burst = { id: 1, kind: 'burst', x: 0, y: 0, color: 0, style: 'ship' };
    expect(isGameEvent({ ...burst, x: 1e300 })).toBe(false);
    expect(isGameEvent({ ...burst, y: NaN })).toBe(false);
    expect(isGameEvent({ ...burst, x: Infinity })).toBe(false);
    expect(isGameEvent({ ...burst, color: -1 })).toBe(false);
    expect(isGameEvent({ ...burst, color: 0x1000000 })).toBe(false);
    expect(isGameEvent({ ...burst, color: 1.5 })).toBe(false);
    const popup = { id: 1, kind: 'popup', x: 0, y: 0, color: 0, amount: 10 };
    expect(isGameEvent({ ...popup, amount: -5 })).toBe(false);
    expect(isGameEvent({ ...popup, amount: 2_000_000 })).toBe(false);
    expect(isGameEvent({ ...popup, amount: 1.5 })).toBe(false);
  });

  it('refuses a shake that would freeze or wreck the screen', () => {
    const shake = { id: 1, kind: 'shake', durationMs: 100, intensity: 0.01 };
    expect(isGameEvent({ ...shake, durationMs: 1_000_000 })).toBe(false);
    expect(isGameEvent({ ...shake, durationMs: 0 })).toBe(false);
    expect(isGameEvent({ ...shake, durationMs: -1 })).toBe(false);
    expect(isGameEvent({ ...shake, intensity: 5 })).toBe(false);
    expect(isGameEvent({ ...shake, intensity: 0 })).toBe(false);
  });
});

describe('sanitizeEvents', () => {
  it('keeps the good events and drops the bad ones individually', () => {
    const raw = [sfx(1), { id: 2, kind: 'nuke' }, sfx(3), null, 'x'];
    expect(sanitizeEvents(raw).map((e) => e.id)).toEqual([1, 3]);
  });

  it('treats anything that is not an array as no events', () => {
    for (const bad of [undefined, null, 'x', 7, {}]) expect(sanitizeEvents(bad)).toEqual([]);
  });

  it('caps what one snapshot can carry', () => {
    const many = Array.from({ length: MAX_EVENTS_PER_SNAPSHOT + 40 }, (_, i) => sfx(i + 1));
    expect(sanitizeEvents(many)).toHaveLength(MAX_EVENTS_PER_SNAPSHOT);
  });
});

describe('EventRecorder', () => {
  it('numbers events from 1 in the order they were emitted', () => {
    const r = new EventRecorder(3);
    r.emit({ kind: 'sfx', sfx: 'shot' });
    r.emit({ kind: 'sfx', sfx: 'asteroidHit' });
    expect(r.collect().map((e) => e.id)).toEqual([1, 2]);
  });

  it('puts each event in exactly `redundancy` consecutive snapshots', () => {
    const r = new EventRecorder(3);
    r.emit({ kind: 'sfx', sfx: 'shot' });
    expect(r.collect()).toHaveLength(1);
    expect(r.collect()).toHaveLength(1);
    expect(r.collect()).toHaveLength(1);
    expect(r.collect()).toHaveLength(0);
    expect(r.collect()).toHaveLength(0);
  });

  it('staggers: a newer event joins while an older one is still repeating', () => {
    const r = new EventRecorder(2);
    r.emit({ kind: 'sfx', sfx: 'shot' }); // 1
    expect(r.collect().map((e) => e.id)).toEqual([1]);
    r.emit({ kind: 'sfx', sfx: 'asteroidHit' }); // 2
    expect(r.collect().map((e) => e.id)).toEqual([1, 2]);
    expect(r.collect().map((e) => e.id)).toEqual([2]);
    expect(r.collect()).toEqual([]);
  });

  it('is empty when nothing happened', () => {
    expect(new EventRecorder(3).collect()).toEqual([]);
  });

  it('counts a snapshot only when collect() is called, not when time passes', () => {
    const r = new EventRecorder(2);
    r.emit({ kind: 'sfx', sfx: 'shot' });
    // no collect() calls = snapshots throttled away: the event waits
    expect(r.collect()).toHaveLength(1);
    expect(r.collect()).toHaveLength(1);
    expect(r.collect()).toHaveLength(0);
  });

  it('never returns more than the per-snapshot cap, keeping the newest', () => {
    const r = new EventRecorder(3);
    for (let i = 0; i < MAX_EVENTS_PER_SNAPSHOT + 10; i += 1) r.emit({ kind: 'sfx', sfx: 'shot' });
    const out = r.collect();
    expect(out).toHaveLength(MAX_EVENTS_PER_SNAPSHOT);
    expect(out[out.length - 1]!.id).toBe(MAX_EVENTS_PER_SNAPSHOT + 10);
  });

  it('restarts ids and forgets everything on reset', () => {
    const r = new EventRecorder(3);
    r.emit({ kind: 'sfx', sfx: 'shot' });
    r.reset();
    expect(r.collect()).toEqual([]);
    r.emit({ kind: 'sfx', sfx: 'shot' });
    expect(r.collect()[0]!.id).toBe(1);
  });

  it('survives every field of an event intact', () => {
    const r = new EventRecorder(1);
    r.emit({ kind: 'burst', x: 1, y: 2, color: 3, style: 'mine' });
    expect(r.collect()[0]).toEqual({ id: 1, kind: 'burst', x: 1, y: 2, color: 3, style: 'mine' });
  });
});

describe('EventDeduper', () => {
  it('lets each event through once however many snapshots repeat it', () => {
    const d = new EventDeduper();
    expect(d.accept([sfx(1)]).map((e) => e.id)).toEqual([1]);
    expect(d.accept([sfx(1), sfx(2)]).map((e) => e.id)).toEqual([2]);
    expect(d.accept([sfx(1), sfx(2), sfx(3)]).map((e) => e.id)).toEqual([3]);
    expect(d.accept([sfx(2), sfx(3)])).toEqual([]);
  });

  it('plays events in id order even when handed out of order', () => {
    expect(new EventDeduper().accept([sfx(3), sfx(1), sfx(2)]).map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it('does not replay anything when an older snapshot arrives late', () => {
    const d = new EventDeduper();
    d.accept([sfx(1), sfx(2), sfx(3)]); // the newer snapshot first
    expect(d.accept([sfx(1)])).toEqual([]); // the older one afterwards
    expect(d.accept([sfx(1), sfx(2)])).toEqual([]);
  });

  it('recovers events from lost snapshots through the redundancy', () => {
    const r = new EventRecorder(3);
    const d = new EventDeduper();
    r.emit({ kind: 'sfx', sfx: 'shot' });
    r.collect(); // snapshot 1: lost
    r.emit({ kind: 'sfx', sfx: 'asteroidHit' });
    r.collect(); // snapshot 2: lost
    r.emit({ kind: 'sfx', sfx: 'shipDestroyed' });
    const played = d.accept(r.collect()); // snapshot 3: the only one that arrives
    expect(played.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it('end to end: three events over a lossy stream play exactly once each', () => {
    const r = new EventRecorder(3);
    const d = new EventDeduper();
    const heard: number[] = [];
    const arrives = [true, false, true, true, false, false, true, true];
    arrives.forEach((arrived, i) => {
      if (i === 0 || i === 2 || i === 4) r.emit({ kind: 'sfx', sfx: 'shot' });
      const snapshotEvents = r.collect();
      if (arrived) d.accept(snapshotEvents).forEach((e) => heard.push(e.id));
    });
    expect(heard).toEqual([1, 2, 3]);
  });

  it('starts over on reset (a new match restarts ids)', () => {
    const d = new EventDeduper();
    d.accept([sfx(5)]);
    expect(d.accept([sfx(1)])).toEqual([]);
    d.reset();
    expect(d.accept([sfx(1)]).map((e) => e.id)).toEqual([1]);
  });
});
