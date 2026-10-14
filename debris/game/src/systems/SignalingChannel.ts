import { LAN_DISCOVERY } from '../config/GameConfig';

/**
 * How a hosting side receives WebRTC signaling messages and answers them
 * (docs/roadmap.md's "Windows + LAN multiplayer" - online phase 3).
 * `RtcSignalingHost` only needs "a message arrived from some peer" and
 * "reply to that peer", not what carries them: UDP datagrams between
 * LAN machines (`LanHostSignalingChannel`) or the dedicated server's
 * WebSocket endpoint, bridged in by its Electron main process
 * (`ServerBridge.ts`'s `BridgeHostSignalingChannel`).
 *
 * `peer` is an opaque routing key the channel hands out and later accepts
 * back in `send` - a sender's IP address on a LAN, a connection id on the
 * server. It means nothing to the signaling logic itself.
 */
export interface HostSignalingChannel {
  open(onMessage: (peer: string, data: string) => void): void;
  send(peer: string, data: string): void;
  close(): void;
}

/** LAN signaling over the UDP socket `desktop/main.js` exposes as `window.debrisLan`. No-ops outside Electron, like everything else on that bridge. */
export class LanHostSignalingChannel implements HostSignalingChannel {
  private unsubscribe: (() => void) | undefined;

  open(onMessage: (peer: string, data: string) => void): void {
    if (!window.debrisLan) return;
    window.debrisLan.startListening(LAN_DISCOVERY.broadcastPort);
    this.unsubscribe = window.debrisLan.onMessage(({ address, data }) => onMessage(address, data));
  }

  send(peer: string, data: string): void {
    window.debrisLan?.sendTo(peer, LAN_DISCOVERY.broadcastPort, data);
  }

  close(): void {
    window.debrisLan?.stopListening();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}
