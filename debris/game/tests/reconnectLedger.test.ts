import { describe, expect, it } from 'vitest';
import { ReconnectLedger } from '../src/systems/ReconnectLedger';

describe('ReconnectLedger', () => {
  it('lets a held seat be claimed before the deadline, once', () => {
    const ledger = new ReconnectLedger<string>(30000);
    ledger.hold('tok', 'seat-a', 1000);
    expect(ledger.has('tok', 20000)).toBe(true);
    expect(ledger.claim('tok', 20000)).toBe('seat-a');
    expect(ledger.claim('tok', 20001)).toBeUndefined(); // spent
    expect(ledger.size).toBe(0);
  });

  it('refuses a claim at or after the deadline, and spends the token', () => {
    const ledger = new ReconnectLedger<string>(30000);
    ledger.hold('tok', 'seat-a', 0);
    expect(ledger.claim('tok', 30000)).toBeUndefined();
    expect(ledger.size).toBe(0);
  });

  it('accepts a claim one millisecond before the deadline', () => {
    const ledger = new ReconnectLedger<string>(30000);
    ledger.hold('tok', 'seat-a', 0);
    expect(ledger.claim('tok', 29999)).toBe('seat-a');
  });

  it('ignores unknown tokens', () => {
    const ledger = new ReconnectLedger<string>(30000);
    ledger.hold('tok', 'seat-a', 0);
    expect(ledger.claim('other', 1)).toBeUndefined();
    expect(ledger.has('other', 1)).toBe(false);
    expect(ledger.size).toBe(1);
  });

  it('expires only the seats whose time is up', () => {
    const ledger = new ReconnectLedger<string>(30000);
    ledger.hold('a', 'seat-a', 0);
    ledger.hold('b', 'seat-b', 10000);
    expect(ledger.expire(29999)).toEqual([]);
    expect(ledger.expire(30000)).toEqual(['seat-a']);
    expect(ledger.expire(30000)).toEqual([]); // already removed
    expect(ledger.expire(40000)).toEqual(['seat-b']);
    expect(ledger.size).toBe(0);
  });

  it('restarts the countdown when the same token is held again', () => {
    const ledger = new ReconnectLedger<string>(30000);
    ledger.hold('tok', 'seat-a', 0);
    ledger.hold('tok', 'seat-a', 20000);
    expect(ledger.has('tok', 45000)).toBe(true);
    expect(ledger.expire(45000)).toEqual([]);
  });

  it('clear() returns and forgets everything', () => {
    const ledger = new ReconnectLedger<string>(30000);
    ledger.hold('a', 'seat-a', 0);
    ledger.hold('b', 'seat-b', 0);
    expect(ledger.clear().sort()).toEqual(['seat-a', 'seat-b']);
    expect(ledger.size).toBe(0);
    expect(ledger.claim('a', 1)).toBeUndefined();
  });
});
