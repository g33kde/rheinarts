/**
 * Seats held for players who dropped mid-match (docs/roadmap.md's
 * "Windows + LAN multiplayer" - online phase 5): a held seat can be taken
 * back with its token until the grace period runs out. Pure and
 * clock-agnostic (the caller passes `nowMs`) so the timing rules are
 * unit-tested without timers.
 *
 * `T` is whatever the server wants to remember about the seat (which
 * owner it was, which slots).
 */
export class ReconnectLedger<T> {
  private readonly held = new Map<string, { entry: T; expiresAtMs: number }>();

  constructor(private readonly graceMs: number) {}

  get size(): number {
    return this.held.size;
  }

  /** Starts (or restarts) the countdown for `token`'s seat. */
  hold(token: string, entry: T, nowMs: number): void {
    this.held.set(token, { entry, expiresAtMs: nowMs + this.graceMs });
  }

  has(token: string, nowMs: number): boolean {
    const held = this.held.get(token);
    return held !== undefined && nowMs < held.expiresAtMs;
  }

  /** Takes a held seat back. A seat is claimable strictly before its deadline; once claimed (or expired) the token is spent. */
  claim(token: string, nowMs: number): T | undefined {
    const held = this.held.get(token);
    if (!held) return undefined;
    this.held.delete(token);
    return nowMs < held.expiresAtMs ? held.entry : undefined;
  }

  /** Removes and returns every seat whose time is up. */
  expire(nowMs: number): T[] {
    const expired: T[] = [];
    this.held.forEach((held, token) => {
      if (nowMs >= held.expiresAtMs) {
        expired.push(held.entry);
        this.held.delete(token);
      }
    });
    return expired;
  }

  /** Forgets every held seat and returns them (a match ended: nothing is left to rejoin). */
  clear(): T[] {
    const all = [...this.held.values()].map((held) => held.entry);
    this.held.clear();
    return all;
  }
}
