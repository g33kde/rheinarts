import { RtcConnection } from './RtcConnection';
import { decodeSignal, encodeSignal, type SignalKind } from './RtcSignalingProtocol';
import {
  LanHostSignalingChannel,
  type ClientSignalingChannel,
  type HostSignalingChannel,
} from './SignalingChannel';

/**
 * Wires `RtcConnection` (Sprint 5's WebRTC wrapper) to a signaling channel,
 * so a host and a joining client can actually reach a connected
 * `RtcConnection` rather than each holding an unconnected one with nowhere
 * to send its offer/answer/candidates. The channel is pluggable
 * (`SignalingChannel.ts`): the LAN discovery socket `LanDiscovery.ts`
 * established (Sprint 4) - what the notes below describe - or, online, the
 * dedicated server's WebSocket.
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

/**
 * The joining-client side - one connection attempt per instance. What carries the messages is a `ClientSignalingChannel`: LAN UDP to a host picked off the discovered-games list, or the dedicated server's WebSocket. `iceServers` is the STUN list (empty on a LAN).
 *
 * Gives up after `timeoutMs` rather than waiting forever - a host that answers signaling but never completes the WebRTC handshake (a firewalled UDP range, say) would otherwise leave the player on "Connecting..." for good.
 */
export class RtcSignalingClient {
  private readonly connectionId = crypto.randomUUID();
  private connection: RtcConnection | undefined;
  private channel: ClientSignalingChannel | undefined;

  connect(channel: ClientSignalingChannel, iceServers: RTCIceServer[] = [], timeoutMs = 15000): Promise<RtcConnection> {
    this.channel = channel;
    return new Promise((resolve, reject) => {
      const fail = (error: Error): void => {
        clearTimeout(timer);
        this.close();
        reject(error);
      };
      const timer = setTimeout(
        () => fail(new Error('Connected to the server, but the game connection could not be established (is the UDP port range open?).')),
        timeoutMs,
      );

      void channel
        .open((data) => {
          const envelope = decodeSignal(data);
          const connection = this.connection;
          if (!envelope || !connection || envelope.connectionId !== this.connectionId) return;
          if (envelope.kind === 'answer') {
            void connection.applyAnswer(JSON.parse(envelope.payload) as RTCSessionDescriptionInit);
          } else if (envelope.kind === 'ice-candidate') {
            void connection.addRemoteIceCandidate(JSON.parse(envelope.payload) as RTCIceCandidateInit);
          }
        })
        .then(async () => {
          const connection = new RtcConnection(true, iceServers);
          this.connection = connection;
          const send = (kind: SignalKind, payload: unknown): void =>
            channel.send(
              encodeSignal({ type: 'debris-signal', connectionId: this.connectionId, kind, payload: JSON.stringify(payload) }),
            );
          connection.onLocalIceCandidate((candidate) => send('ice-candidate', candidate));
          connection.onConnected(() => {
            clearTimeout(timer);
            resolve(connection);
          });
          send('offer', await connection.createOffer());
        })
        .catch((error: unknown) => fail(error instanceof Error ? error : new Error(String(error))));
    });
  }

  close(): void {
    this.channel?.close();
    this.channel = undefined;
    this.connection?.close();
    this.connection = undefined;
  }
}
