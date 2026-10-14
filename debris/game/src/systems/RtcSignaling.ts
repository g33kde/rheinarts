import { LAN_DISCOVERY } from '../config/GameConfig';
import { RtcConnection } from './RtcConnection';
import { decodeSignal, encodeSignal, type SignalKind } from './RtcSignalingProtocol';
import { LanHostSignalingChannel, type HostSignalingChannel } from './SignalingChannel';

/**
 * Wires `RtcConnection` (Sprint 5's WebRTC wrapper) to the LAN discovery
 * channel `LanDiscovery.ts` already established (Sprint 4), so a host
 * and a joining client can actually reach a connected `RtcConnection`
 * rather than each holding an unconnected one with nowhere to send its
 * offer/answer/candidates.
 *
 * Reuses `LAN_DISCOVERY.broadcastPort` for signaling too, rather than a
 * second port - one socket, two message shapes (`debris-announce` vs
 * `debris-signal`), distinguished by `type`. A dedicated server
 * (deferred - see docs/roadmap.md) could use a different port later;
 * nothing here assumes it can't, but v1 doesn't need the extra
 * complexity of a configurable one yet.
 *
 * No-ops/rejects outside Electron, same as `LanDiscovery.ts` - checked
 * via `window.debrisLan`'s presence, not a separate flag to keep in
 * sync.
 */

type Sender = (address: string, port: number, connectionId: string, kind: SignalKind, payload: string) => void;

function send(address: string, port: number, connectionId: string, kind: SignalKind, payload: string): void {
  window.debrisLan?.sendTo(address, port, encodeSignal({ type: 'debris-signal', connectionId, kind, payload }));
}

/**
 * The host side - listens for incoming offers, answers each one, and hands back a connection per successful handshake. Handles more than one in-flight join attempt at once via `connectionId`.
 *
 * What actually carries the messages is a `HostSignalingChannel` (LAN UDP by default, the dedicated server's WebSocket bridge online); `iceServers` is the STUN list handed to every connection it creates (empty on a LAN).
 */
export class RtcSignalingHost {
  private readonly pending = new Map<string, RtcConnection>();

  constructor(
    private readonly channel: HostSignalingChannel = new LanHostSignalingChannel(),
    private readonly iceServers: RTCIceServer[] = [],
  ) {}

  listen(onConnected: (connection: RtcConnection) => void): void {
    this.channel.open((peer, data) => {
      const envelope = decodeSignal(data);
      if (!envelope) return;

      const reply = (kind: SignalKind, payload: string): void =>
        this.channel.send(
          peer,
          encodeSignal({ type: 'debris-signal', connectionId: envelope.connectionId, kind, payload }),
        );

      if (envelope.kind === 'offer') {
        const connection = new RtcConnection(false, this.iceServers);
        this.pending.set(envelope.connectionId, connection);

        connection.onLocalIceCandidate((candidate) => reply('ice-candidate', JSON.stringify(candidate)));
        connection.onConnected(() => {
          this.pending.delete(envelope.connectionId);
          onConnected(connection);
        });

        const offer = JSON.parse(envelope.payload) as RTCSessionDescriptionInit;
        void connection.createAnswer(offer).then((answer) => reply('answer', JSON.stringify(answer)));
        return;
      }

      if (envelope.kind === 'ice-candidate') {
        const connection = this.pending.get(envelope.connectionId);
        if (!connection) return;
        void connection.addRemoteIceCandidate(JSON.parse(envelope.payload) as RTCIceCandidateInit);
      }
    });
  }

  stop(): void {
    this.channel.close();
    this.pending.forEach((connection) => connection.close());
    this.pending.clear();
  }
}

/** The joining-client side - one connection attempt per instance. `hostSignalPort` comes from the `AnnouncePacket` a player picked off the discovered-games list (`LanDiscoveryProtocol.ts`'s own `signalPort` field), not assumed to equal the broadcast port even though v1 always sets it that way. */
export class RtcSignalingClient {
  private readonly connectionId = crypto.randomUUID();
  private connection: RtcConnection | undefined;
  private unsubscribe: (() => void) | undefined;

  connect(hostAddress: string, hostSignalPort: number, sender: Sender = send): Promise<RtcConnection> {
    return new Promise((resolve, reject) => {
      if (!window.debrisLan) {
        reject(new Error('LAN networking is not available outside the desktop app.'));
        return;
      }

      window.debrisLan.startListening(LAN_DISCOVERY.broadcastPort);
      const connection = new RtcConnection(true);
      this.connection = connection;

      connection.onLocalIceCandidate((candidate) => {
        sender(hostAddress, hostSignalPort, this.connectionId, 'ice-candidate', JSON.stringify(candidate));
      });
      connection.onConnected(() => resolve(connection));

      this.unsubscribe = window.debrisLan.onMessage(({ data }) => {
        const envelope = decodeSignal(data);
        if (!envelope || envelope.connectionId !== this.connectionId) return;

        if (envelope.kind === 'answer') {
          void connection.applyAnswer(JSON.parse(envelope.payload) as RTCSessionDescriptionInit);
        } else if (envelope.kind === 'ice-candidate') {
          void connection.addRemoteIceCandidate(JSON.parse(envelope.payload) as RTCIceCandidateInit);
        }
      });

      void connection.createOffer().then((offer) => {
        sender(hostAddress, hostSignalPort, this.connectionId, 'offer', JSON.stringify(offer));
      });
    });
  }

  close(): void {
    window.debrisLan?.stopListening();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.connection?.close();
    this.connection = undefined;
  }
}
