import { LAN_DISCOVERY } from '../config/GameConfig';
import {
  decodeAnnounce,
  encodeAnnounce,
  pruneStaleGames,
  upsertDiscoveredGame,
  type AnnouncePacket,
  type DiscoveredGame,
} from './LanDiscoveryProtocol';

/**
 * The renderer-side half of LAN discovery (docs/roadmap.md's "Windows +
 * LAN multiplayer," Sprint 4) - owns the protocol (encode/decode/prune,
 * all from `LanDiscoveryProtocol.ts`) and the timers; `desktop/main.js`
 * is dumb UDP plumbing underneath it, reached through the bridge
 * `desktop/preload.js` exposes as `window.debrisLan`.
 *
 * **No-ops entirely in a plain browser tab**, deliberately - a page
 * can't open a raw UDP socket at all, and this feature is additive to
 * the web build (docs/roadmap.md's own framing), never a requirement
 * of it. Every method here is safe to call regardless of which
 * environment the game is actually running in; callers don't need their
 * own `if (isDesktop)` branches.
 */

declare global {
  interface Window {
    debrisLan?: {
      startListening: (port: number) => void;
      stopListening: () => void;
      broadcast: (port: number, message: string) => void;
      sendTo: (address: string, port: number, message: string) => void;
      onMessage: (callback: (payload: { address: string; data: string }) => void) => () => void;
    };
  }
}

export function isLanAvailable(): boolean {
  return typeof window !== 'undefined' && window.debrisLan !== undefined;
}

export class LanHost {
  private intervalId: ReturnType<typeof setInterval> | undefined;

  /** Starts broadcasting `packet` every `LAN_DISCOVERY.announceIntervalMs` - a no-op outside Electron. */
  start(packet: AnnouncePacket): void {
    if (!window.debrisLan) return;
    const encoded = encodeAnnounce(packet);
    window.debrisLan.broadcast(LAN_DISCOVERY.broadcastPort, encoded);
    this.intervalId = setInterval(() => {
      window.debrisLan?.broadcast(LAN_DISCOVERY.broadcastPort, encoded);
    }, LAN_DISCOVERY.announceIntervalMs);
  }

  stop(): void {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }
}

export class LanDiscovery {
  private games: DiscoveredGame[] = [];
  private pruneIntervalId: ReturnType<typeof setInterval> | undefined;
  private unsubscribeMessages: (() => void) | undefined;

  /** Starts listening for host announcements; `onGamesUpdated` is called with the current list every time it actually changes. A no-op outside Electron - `onGamesUpdated` is simply never called. */
  start(onGamesUpdated: (games: readonly DiscoveredGame[]) => void): void {
    if (!window.debrisLan) return;

    window.debrisLan.startListening(LAN_DISCOVERY.broadcastPort);
    this.unsubscribeMessages = window.debrisLan.onMessage(({ address, data }) => {
      const packet = decodeAnnounce(data);
      if (!packet) return;
      this.games = upsertDiscoveredGame(this.games, address, packet, Date.now());
      onGamesUpdated(this.games);
    });

    // Pruning runs on its own timer, not just on receipt of a new
    // announce - a host that stops broadcasting entirely (closed,
    // crashed) would otherwise never actually leave the list, since
    // nothing ever triggers a re-check of it.
    this.pruneIntervalId = setInterval(() => {
      const pruned = pruneStaleGames(this.games, Date.now(), LAN_DISCOVERY.staleTimeoutMs);
      if (pruned.length !== this.games.length) {
        this.games = pruned;
        onGamesUpdated(this.games);
      }
    }, LAN_DISCOVERY.announceIntervalMs);
  }

  stop(): void {
    window.debrisLan?.stopListening();
    this.unsubscribeMessages?.();
    this.unsubscribeMessages = undefined;
    if (this.pruneIntervalId !== undefined) {
      clearInterval(this.pruneIntervalId);
      this.pruneIntervalId = undefined;
    }
    this.games = [];
  }
}
