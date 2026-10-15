import type { HostSignalingChannel } from './SignalingChannel';

/**
 * The renderer-side view of the dedicated server's Electron main process
 * (`debris/server/src/preload.js`) - the same shape of bridge
 * `window.debrisLan` is for a desktop client. Only exists when the game
 * page was loaded by the server (`?server=1`); every other build leaves
 * `window.debrisServer` undefined.
 *
 * The main process owns everything a page can't: the config file, the
 * WebSocket signaling endpoint, logging and the process lifecycle. This
 * page owns the game simulation and WebRTC (Chromium has it natively, so
 * the server needs no separate WebRTC library).
 */

export type ServerLogLevel = 'debug' | 'info' | 'warn' | 'error';

/** The slice of the server's validated config file (`debris/server/src/config.js`) the game page reads. */
export interface ServerRuntimeConfig {
  readonly name: string;
  readonly motd: string;
  /** Empty = no password. Compared in this page only; the main process never needs it. */
  readonly password: string;
  readonly gameplay: {
    readonly defaultMode: 'cooperative' | 'competitive';
    readonly maxPlayers: number;
    readonly returnToLobbyDelayMs: number;
    readonly reconnectGraceMs: number;
    /** 0 = never; otherwise how long a leader may sit without a lobby command before the next player leads. */
    readonly idleLeaderMs: number;
  };
  readonly network: { readonly stunServers: readonly string[] };
  readonly ops: { readonly snapshotHz: number };
}

/** What the main process answers a signaling-socket status query with (it adds the name, MOTD and password flag itself, from the config file). */
export interface ServerStatus {
  readonly protocolVersion: number;
  readonly status: 'lobby' | 'inMatch';
  readonly mode: 'cooperative' | 'competitive';
  readonly players: { readonly current: number; readonly max: number };
}

/**
 * A finished match as the main process needs it to post scores: the
 * `MatchResult`, plus who each slot was (their initials, from the join) and
 * which leaderboard generation this build writes to. The main process owns
 * the API address and key; this page never sees them.
 */
export interface ScoreReport {
  readonly leaderboardVersion: number;
  readonly mode: 'cooperative' | 'competitive';
  readonly outcome: 'win' | 'draw' | 'loss';
  readonly winnerSlot: number | null;
  readonly scores: readonly number[];
  readonly pooledScore: number;
  readonly lastEliminatedSlot: number | null;
  readonly participants: readonly number[];
  /** Slot (as a string key, because it travels as JSON) -> three capital letters. */
  readonly initialsBySlot: Readonly<Record<string, string>>;
}

declare global {
  interface Window {
    debrisServer?: {
      ready: () => void;
      getConfig: () => Promise<ServerRuntimeConfig>;
      setStatus: (status: ServerStatus) => void;
      reportResult: (report: ScoreReport) => void;
      onSignal: (callback: (payload: { peerId: string; data: string }) => void) => () => void;
      sendSignal: (peerId: string, data: string) => void;
      onPeerClosed: (callback: (peerId: string) => void) => () => void;
      log: (level: ServerLogLevel, message: string) => void;
    };
  }
}

/** True when this page was loaded by the dedicated server rather than a player's browser/desktop window. */
export function isServerMode(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('server');
}

/** Signaling for the dedicated server: WebSocket messages the main process forwards in, replies it sends back out. `peer` is the main process's per-socket id. */
export class BridgeHostSignalingChannel implements HostSignalingChannel {
  private unsubscribe: (() => void) | undefined;
  private unsubscribeClosed: (() => void) | undefined;

  open(onMessage: (peer: string, data: string) => void): void {
    this.unsubscribe = window.debrisServer?.onSignal(({ peerId, data }) => onMessage(peerId, data));
  }

  send(peer: string, data: string): void {
    window.debrisServer?.sendSignal(peer, data);
  }

  onPeerClosed(listener: (peer: string) => void): void {
    this.unsubscribeClosed = window.debrisServer?.onPeerClosed(listener);
  }

  close(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.unsubscribeClosed?.();
    this.unsubscribeClosed = undefined;
  }
}
