import type { RtcConnection } from './RtcConnection';
import { RtcSignalingClient, RtcSignalingHost } from './RtcSignaling';
import type { HostSignalingChannel } from './SignalingChannel';
import {
  decodeInput,
  decodeSnapshot,
  encodeInput,
  encodeSnapshot,
  type GameSnapshot,
  type InputMessage,
} from './NetworkSnapshotProtocol';
import { NETWORK_SYNC } from '../config/GameConfig';
import { decodeWelcome, type WelcomeMessage } from './NetworkHandshakeProtocol';

/**
 * The host side of a match (docs/roadmap.md's "Windows + LAN
 * multiplayer," Sprint 6) - accepts however many clients connect
 * (`RtcSignalingHost`, Sprint 5), decodes each one's `InputMessage`s as
 * they arrive, and broadcasts one `GameSnapshot` to everyone currently
 * connected. Owns none of the actual game simulation - GameScene calls
 * `broadcastSnapshot` with whatever it already simulated, same
 * "this layer doesn't know about gameplay" boundary every networking
 * module here keeps.
 */
export interface HostSessionOptions {
  /** Picks the default snapshot rate (`NETWORK_SYNC`) - a LAN keeps the full simulation rate, an online match is throttled to save upload. */
  readonly transport?: 'lan' | 'online';
  /** Overrides the transport's default snapshot rate (the server's config file). */
  readonly snapshotHz?: number;
  /** How signaling reaches this host - LAN UDP by default, the dedicated server's WebSocket bridge online. */
  readonly channel?: HostSignalingChannel;
  /** STUN servers handed to every incoming connection (empty on a LAN). */
  readonly iceServers?: RTCIceServer[];
}

export class NetworkHostSession {
  private readonly host: RtcSignalingHost;
  private readonly connections: RtcConnection[] = [];
  /** How often `GameScene` should call `broadcastSnapshot` (`NETWORK_SYNC`, or the options' override). */
  readonly snapshotHz: number;

  constructor(options: HostSessionOptions = {}) {
    this.snapshotHz =
      options.snapshotHz ??
      (options.transport === 'online' ? NETWORK_SYNC.onlineSnapshotHz : NETWORK_SYNC.lanSnapshotHz);
    this.host = new RtcSignalingHost(options.channel, options.iceServers);
  }

  /**
   * `onClientConnected` fires once per newly-connected client, before
   * anything else - `LanLobbyScene` is the one that actually assigns
   * the slot and sends the `WelcomeMessage` (`NetworkHandshakeProtocol.ts`)
   * back over `connection.sendReliable(...)`, since slot bookkeeping is
   * a lobby concern, not this class's. `onClientInput` fires once per
   * decoded `InputMessage` afterward, from whichever client sent it -
   * `GameScene` is the one that knows which `RemoteInput` (one per
   * connected slot) to update. `from` is the connection it arrived on: a
   * message's own `slotIndex` is only a claim, so the dedicated server
   * (open to the internet) uses `from` to decide whose input it really is.
   */
  start(
    onClientConnected: (connection: RtcConnection) => void,
    onClientInput: (message: InputMessage, from: RtcConnection) => void,
  ): void {
    this.host.listen((connection) => {
      this.connections.push(connection);
      onClientConnected(connection);
      connection.onUnreliableMessage((data) => {
        const message = decodeInput(data);
        if (message) onClientInput(message, connection);
      });
    });
  }

  broadcastSnapshot(snapshot: GameSnapshot): void {
    const encoded = encodeSnapshot(snapshot);
    this.connections.forEach((connection) => connection.sendUnreliable(encoded));
  }

  stop(): void {
    this.host.stop();
    this.connections.forEach((connection) => connection.close());
    this.connections.length = 0;
  }
}

/**
 * The joining-client side - one connection to one host. Sends its own
 * local player's `InputMessage` every frame GameScene asks it to, and
 * hands back whatever `GameSnapshot`s arrive so GameScene can apply
 * them directly to its local Ship visuals (no local physics running at
 * all for a client - docs/roadmap.md's "pure renderer" decision).
 */
export class NetworkClientSession {
  private readonly client = new RtcSignalingClient();
  private connection: RtcConnection | undefined;
  // Registration can happen before connect() resolves (LanLobbyScene
  // calls onWelcome() first, so it can't miss the host's reply even if
  // it somehow arrived immediately) - buffered here and attached for
  // real once the connection actually exists, rather than silently
  // doing nothing because `this.connection` was still undefined.
  private pendingReliableListeners: ((data: string) => void)[] = [];
  private pendingUnreliableListeners: ((data: string) => void)[] = [];

  async connect(hostAddress: string, hostSignalPort: number): Promise<void> {
    const connection = await this.client.connect(hostAddress, hostSignalPort);
    this.connection = connection;
    this.pendingReliableListeners.forEach((listener) => connection.onReliableMessage(listener));
    this.pendingUnreliableListeners.forEach((listener) => connection.onUnreliableMessage(listener));
    this.pendingReliableListeners = [];
    this.pendingUnreliableListeners = [];
  }

  /** Called by `GameScene` (`createNetworkClient()`) to actually apply snapshots once the match is under way - safe to call alongside other listeners, since `RtcConnection.onUnreliableMessage` already supports any number of independent ones. */
  onSnapshot(listener: (snapshot: GameSnapshot) => void): void {
    const wrapped = (data: string) => {
      const snapshot = decodeSnapshot(data);
      if (snapshot) listener(snapshot);
    };
    if (this.connection) this.connection.onUnreliableMessage(wrapped);
    else this.pendingUnreliableListeners.push(wrapped);
  }

  sendInput(message: InputMessage): void {
    this.connection?.sendUnreliable(encodeInput(message));
  }

  /** The host's slot assignment, over the reliable channel - must actually arrive, unlike everything else this class sends/receives. */
  onWelcome(listener: (message: WelcomeMessage) => void): void {
    const wrapped = (data: string) => {
      const message = decodeWelcome(data);
      if (message) listener(message);
    };
    if (this.connection) this.connection.onReliableMessage(wrapped);
    else this.pendingReliableListeners.push(wrapped);
  }

  /**
   * The host disconnected (docs/roadmap.md's "Windows + LAN
   * multiplayer," Sprint 7's decided rule: round ends immediately for
   * everyone). Only ever called by `GameScene.createNetworkClient()`,
   * which by construction only exists after `connect()` has already
   * resolved (it's reached via `onWelcome`, itself only reachable post-
   * connection) - no pending-listener buffering needed here the way
   * `onSnapshot`/`onWelcome` need it for the earlier, genuinely-possible
   * pre-connection registration from `LanLobbyScene`.
   */
  onDisconnected(listener: () => void): void {
    this.connection?.onClosed(listener);
  }

  stop(): void {
    this.client.close();
    this.connection = undefined;
  }
}
