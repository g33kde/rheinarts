/**
 * Decides, once per host frame, whether this frame should also send a
 * `GameSnapshot` (docs/roadmap.md's "Windows + LAN multiplayer" - online
 * phase 1). Pure and clock-agnostic: the caller passes in a monotonic
 * millisecond reading, so tests drive it without any real timers.
 *
 * A fixed `due += interval` schedule with a small tolerance, rather than
 * "at least `interval` since the last send": at 30 Hz on a 60 fps host,
 * frames land every ~16.7 ms, and a strict comparison would flip between
 * sending every 2nd and every 3rd frame whenever one frame arrives a hair
 * early - visible as uneven snapshot spacing. The tolerance (half a 60 fps
 * frame) absorbs that, and a host that has fallen far behind resyncs
 * instead of firing a burst of catch-up sends.
 *
 * At or above ~60 Hz every frame sends - there is nothing to throttle.
 */
const FULL_RATE_INTERVAL_MS = 17;
const TOLERANCE_MS = 8;

export class SnapshotThrottle {
  private readonly intervalMs: number;
  private dueAtMs: number | undefined;

  constructor(snapshotHz: number) {
    this.intervalMs = 1000 / snapshotHz;
  }

  shouldSend(nowMs: number): boolean {
    if (this.intervalMs <= FULL_RATE_INTERVAL_MS) return true;
    if (this.dueAtMs === undefined) {
      this.dueAtMs = nowMs + this.intervalMs;
      return true;
    }
    if (nowMs + TOLERANCE_MS < this.dueAtMs) return false;
    this.dueAtMs += this.intervalMs;
    // Fell more than a full interval behind (a stalled frame, a tab in the
    // background): resync to now rather than sending several in a row.
    if (this.dueAtMs + TOLERANCE_MS < nowMs) this.dueAtMs = nowMs + this.intervalMs;
    return true;
  }
}
