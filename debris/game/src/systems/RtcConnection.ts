/**
 * A single peer-to-peer WebRTC connection (docs/roadmap.md's "Windows +
 * LAN multiplayer," Sprint 5) - two DataChannels over one
 * RTCPeerConnection:
 *
 * - **`reliable`** (default channel config - ordered, retried): round
 *   start/end, scoring, hit confirmation. Must arrive, order matters.
 * - **`unreliable`** (`ordered: false, maxRetransmits: 0`): frequent
 *   position snapshots. A dropped one should just be superseded by the
 *   next, not stall everything behind it the way a reliable channel
 *   (or plain TCP/WebSocket) would - see that config doc comment for
 *   the full reasoning.
 *
 * **Deliberately signaling-transport-agnostic.** This class only knows
 * how to produce its own offer/answer/ICE candidates and consume the
 * remote peer's - *how* those actually get from one machine to the
 * other is a separate concern (the LAN discovery channel
 * `LanDiscovery.ts` already established, wired up in Sprint 6), not
 * this class's job. No STUN/TURN servers configured - LAN-only for v1
 * (docs/roadmap.md's own "deferred to a later phase" list), so there's
 * nothing to traverse yet.
 *
 * **Untestable with vitest the normal way this codebase prefers** -
 * Node has no `RTCPeerConnection` at all, unlike the dgram-based
 * discovery layer (Sprint 4), which could at least be exercised
 * standalone outside a browser. This is integration code, verified by
 * actually running the app, same bucket every Phaser-coupled entity
 * class already falls into - not a pure-logic module with something to
 * unit-test.
 */

const RELIABLE_CHANNEL_LABEL = 'reliable';
const UNRELIABLE_CHANNEL_LABEL = 'unreliable';

export type RtcMessageListener = (data: string) => void;

export class RtcConnection {
  private readonly peer: RTCPeerConnection;
  private reliableChannel: RTCDataChannel | undefined;
  private unreliableChannel: RTCDataChannel | undefined;
  private reliableListeners: RtcMessageListener[] = [];
  private unreliableListeners: RtcMessageListener[] = [];
  private connectedListeners: (() => void)[] = [];
  private localIceCandidateListeners: ((candidate: RTCIceCandidateInit) => void)[] = [];

  /**
   * `isInitiator` is the host's side of the connection - WebRTC requires
   * whoever creates the offer to also create the data channels; the
   * other side (`false`, the joining player) receives them via the
   * `datachannel` event instead of creating its own.
   */
  constructor(isInitiator: boolean) {
    this.peer = new RTCPeerConnection({ iceServers: [] });

    this.peer.onicecandidate = (event) => {
      if (event.candidate) this.localIceCandidateListeners.forEach((listener) => listener(event.candidate!.toJSON()));
    };

    this.peer.ondatachannel = (event) => {
      this.wireChannel(event.channel);
    };

    if (isInitiator) {
      this.wireChannel(this.peer.createDataChannel(RELIABLE_CHANNEL_LABEL));
      this.wireChannel(this.peer.createDataChannel(UNRELIABLE_CHANNEL_LABEL, { ordered: false, maxRetransmits: 0 }));
    }
  }

  private wireChannel(channel: RTCDataChannel): void {
    const isReliable = channel.label === RELIABLE_CHANNEL_LABEL;
    if (isReliable) this.reliableChannel = channel;
    else this.unreliableChannel = channel;

    channel.onmessage = (event: MessageEvent<string>) => {
      const listeners = isReliable ? this.reliableListeners : this.unreliableListeners;
      listeners.forEach((listener) => listener(event.data));
    };

    channel.onopen = () => {
      // "Connected" once both channels are open, not just one - a
      // caller shouldn't start sending snapshots over a half-ready
      // connection.
      if (this.reliableChannel?.readyState === 'open' && this.unreliableChannel?.readyState === 'open') {
        this.connectedListeners.forEach((listener) => listener());
      }
    };
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(remoteOffer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    await this.peer.setRemoteDescription(remoteOffer);
    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);
    return answer;
  }

  async applyAnswer(remoteAnswer: RTCSessionDescriptionInit): Promise<void> {
    await this.peer.setRemoteDescription(remoteAnswer);
  }

  async addRemoteIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.peer.addIceCandidate(candidate);
  }

  onLocalIceCandidate(listener: (candidate: RTCIceCandidateInit) => void): void {
    this.localIceCandidateListeners.push(listener);
  }

  onConnected(listener: () => void): void {
    this.connectedListeners.push(listener);
  }

  onReliableMessage(listener: RtcMessageListener): void {
    this.reliableListeners.push(listener);
  }

  onUnreliableMessage(listener: RtcMessageListener): void {
    this.unreliableListeners.push(listener);
  }

  sendReliable(data: string): void {
    if (this.reliableChannel?.readyState === 'open') this.reliableChannel.send(data);
  }

  /** Silently drops the message if the channel isn't open - exactly the behavior a snapshot that arrives too early should have anyway: superseded by the next one, not queued. */
  sendUnreliable(data: string): void {
    if (this.unreliableChannel?.readyState === 'open') this.unreliableChannel.send(data);
  }

  close(): void {
    this.reliableChannel?.close();
    this.unreliableChannel?.close();
    this.peer.close();
  }
}
