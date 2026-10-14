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
  readonly gameplay: { readonly defaultMode: 'cooperative' | 'competitive'; readonly maxPlayers: number };
  readonly network: { readonly stunServers: readonly string[] };
  readonly ops: { readonly snapshotHz: number };
  readonly dev: { readonly autoStartDelayMs: number };
}

declare global {
  interface Window {
    debrisServer?: {
      ready: () => void;
      getConfig: () => Promise<ServerRuntimeConfig>;
      onSignal: (callback: (payload: { peerId: string; data: string }) => void) => () => void;
      sendSignal: (peerId: string, data: string) => void;
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

  open(onMessage: (peer: string, data: string) => void): void {
    this.unsubscribe = window.debrisServer?.onSignal(({ peerId, data }) => onMessage(peerId, data));
  }

  send(peer: string, data: string): void {
    window.debrisServer?.sendSignal(peer, data);
  }

  close(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
