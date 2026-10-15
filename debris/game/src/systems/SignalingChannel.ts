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
  /** Optional: told when a peer's transport has gone (the server's WebSocket closed), so half-finished handshakes can be dropped. LAN UDP has no such moment. */
  onPeerClosed?(listener: (peer: string) => void): void;
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

/**
 * The joining side's view of signaling: send messages to the host, hear its
 * replies. `open` resolves once messages can be sent and rejects if the host
 * cannot be reached at all (a WebSocket that never connects) - a LAN's
 * connectionless UDP has no such moment, so it resolves immediately.
 */
export interface ClientSignalingChannel {
  open(onMessage: (data: string) => void): Promise<void>;
  send(data: string): void;
  close(): void;
}

/** LAN: datagrams to the host's address and signal port, over the UDP socket `desktop/main.js` exposes. Rejects outside Electron. */
export class LanClientSignalingChannel implements ClientSignalingChannel {
  private unsubscribe: (() => void) | undefined;

  constructor(
    private readonly hostAddress: string,
    private readonly hostSignalPort: number,
  ) {}

  open(onMessage: (data: string) => void): Promise<void> {
    if (!window.debrisLan) return Promise.reject(new Error('LAN networking is not available outside the desktop app.'));
    window.debrisLan.startListening(LAN_DISCOVERY.broadcastPort);
    this.unsubscribe = window.debrisLan.onMessage(({ data }) => onMessage(data));
    return Promise.resolve();
  }

  send(data: string): void {
    window.debrisLan?.sendTo(this.hostAddress, this.hostSignalPort, data);
  }

  close(): void {
    window.debrisLan?.stopListening();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }
}

/** Online: the dedicated server's signaling WebSocket. Works in a plain browser tab too - it needs no Node, only `WebSocket`. */
export class WebSocketClientSignalingChannel implements ClientSignalingChannel {
  private socket: WebSocket | undefined;

  constructor(
    private readonly url: string,
    private readonly timeoutMs = 8000,
  ) {}

  open(onMessage: (data: string) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let socket: WebSocket;
      try {
        socket = new WebSocket(this.url);
      } catch {
        reject(new Error(`"${this.url}" is not a valid server address.`));
        return;
      }
      this.socket = socket;
      const fail = (message: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.close();
        reject(new Error(message));
      };
      const timer = setTimeout(() => fail('The server did not answer in time.'), this.timeoutMs);
      socket.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      socket.onerror = () => fail('Could not reach the server.');
      socket.onmessage = (event) => {
        if (typeof event.data === 'string') onMessage(event.data);
      };
    });
  }

  send(data: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(data);
  }

  close(): void {
    this.socket?.close();
    this.socket = undefined;
  }
}
