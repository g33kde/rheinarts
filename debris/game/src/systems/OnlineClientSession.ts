import { PROTOCOL_VERSION } from './LanDiscoveryProtocol';
import {
  decodeLobbyState,
  decodeReject,
  encodeLobbyCommand,
  type LobbyCommandMessage,
  type LobbyStateMessage,
  type RejectReason,
} from './NetworkHandshakeProtocol';
import {
  decodeSnapshot,
  encodeInput,
  type GameSnapshot,
  type InputMessage,
} from './NetworkSnapshotProtocol';
import { reconnectDelay } from './OnlineClientLogic';
import {
  decodeJoined,
  decodeStatusReply,
  encodeJoin,
  encodeStatusRequest,
  type JoinedMessage,
  type StatusReply,
} from './OnlineProtocol';
import type { RtcConnection } from './RtcConnection';
import { RtcSignalingClient } from './RtcSignaling';
import { WebSocketClientSignalingChannel } from './SignalingChannel';

/**
 * The joining side of a dedicated-server match (docs/roadmap.md's "Windows
 * + LAN multiplayer" - online phase 5).
 *
 * What `GameScene`'s client path needs from any session - a LAN
 * `NetworkClientSession` or this one.
 */
export interface ClientSessionLike {
  /** Returns an unsubscribe function when the session supports one (online); a LAN session lives only as long as one match, so it does not. */
  onSnapshot(listener: (snapshot: GameSnapshot) => void): void | (() => void);
  sendInput(message: InputMessage): void;
  /** The session is over for good: the host went away (LAN) or reconnecting failed (online). */
  onDisconnected(listener: () => void): void | (() => void);
  stop(): void;
}

/** Calls every listener in `list`. Iterates a copy: a listener may unsubscribe itself (a scene shutting down) mid-dispatch, and removing from the live array would make `forEach` skip the next one. */
function dispatch<T extends unknown[]>(list: readonly ((...args: T) => void)[], ...args: T): void {
  [...list].forEach((listener) => listener(...args));
}

/** Adds `listener` to `list` and returns the function that removes it again. */
function subscribe<T>(list: T[], listener: T): () => void {
  list.push(listener);
  return () => {
    const index = list.indexOf(listener);
    if (index >= 0) list.splice(index, 1);
  };
}

export type JoinOutcome =
  | { readonly kind: 'joined'; readonly joined: JoinedMessage }
  | { readonly kind: 'rejected'; readonly reason: RejectReason }
  | { readonly kind: 'failed'; readonly message: string };

export interface JoinRequest {
  readonly password: string;
  readonly localPlayers: 1 | 2;
  /** One set of initials (three capital letters) per local player. */
  readonly initials: readonly string[];
}

/** How long to wait for `debris-joined` / `debris-reject` once the connection is up. */
const JOIN_ANSWER_TIMEOUT_MS = 8000;

/**
 * Asks the server who is on, over its signaling socket alone - no WebRTC,
 * so it is cheap enough to poll. Resolves `null` when the server cannot be
 * reached or answers with nonsense; never rejects.
 */
export function queryServerStatus(url: string, timeoutMs = 4000): Promise<StatusReply | null> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      resolve(null);
      return;
    }
    let done = false;
    const finish = (reply: StatusReply | null): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.close();
      resolve(reply);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    socket.onopen = () => socket.send(encodeStatusRequest());
    socket.onmessage = (event) => finish(typeof event.data === 'string' ? (decodeStatusReply(event.data) ?? null) : null);
    socket.onerror = () => finish(null);
  });
}

/**
 * One player's (or one PC's) seat on a dedicated server. Joins once, then
 * *keeps* the seat across a dropped connection: if the link dies mid-match
 * it retries with the token the server issued, for as long as the server
 * promised to hold the seat (`reconnectGraceMs`), and only then reports
 * itself disconnected. Listeners registered once survive every reconnect.
 */
export class OnlineClientSession implements ClientSessionLike {
  private client: RtcSignalingClient | undefined;
  private connection: RtcConnection | undefined;
  private request: JoinRequest | undefined;
  private stopped = false;
  private reconnecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  private joinedMessage: JoinedMessage | undefined;
  private latestLobby: LobbyStateMessage | undefined;

  private readonly snapshotListeners: ((snapshot: GameSnapshot) => void)[] = [];
  private readonly lobbyListeners: ((lobby: LobbyStateMessage) => void)[] = [];
  private readonly disconnectedListeners: (() => void)[] = [];
  private readonly reconnectingListeners: ((secondsLeft: number) => void)[] = [];
  private readonly reconnectedListeners: (() => void)[] = [];

  constructor(
    private readonly url: string,
    private readonly iceServers: RTCIceServer[] = [],
  ) {}

  /** The server's answer to the join, once seated. */
  get joined(): JoinedMessage | undefined {
    return this.joinedMessage;
  }

  /** The most recent lobby state, so a scene that starts later can draw it at once. */
  get lobby(): LobbyStateMessage | undefined {
    return this.latestLobby;
  }

  // A session outlives the scenes that use it (lobby -> match -> lobby), so
  // every listener hands back its own unsubscribe - a scene that is torn down
  // must not keep reacting on a later match's behalf.
  onSnapshot(listener: (snapshot: GameSnapshot) => void): () => void {
    return subscribe(this.snapshotListeners, listener);
  }
  onLobby(listener: (lobby: LobbyStateMessage) => void): () => void {
    return subscribe(this.lobbyListeners, listener);
  }
  onDisconnected(listener: () => void): () => void {
    return subscribe(this.disconnectedListeners, listener);
  }
  /** Fired each attempt while trying to get a dropped seat back, with roughly how many seconds are left. */
  onReconnecting(listener: (secondsLeft: number) => void): () => void {
    return subscribe(this.reconnectingListeners, listener);
  }
  onReconnected(listener: () => void): () => void {
    return subscribe(this.reconnectedListeners, listener);
  }

  /** Connects and asks for a seat. Never rejects: every way it can go wrong is a `JoinOutcome`. */
  async join(request: JoinRequest): Promise<JoinOutcome> {
    this.request = request;
    const outcome = await this.attempt(request, undefined);
    if (outcome.kind === 'joined') {
      this.joinedMessage = outcome.joined;
    } else {
      this.teardownConnection();
    }
    return outcome;
  }

  sendInput(message: InputMessage): void {
    this.connection?.sendUnreliable(encodeInput(message));
  }

  sendCommand(command: LobbyCommandMessage): void {
    this.connection?.sendReliable(encodeLobbyCommand(command));
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer !== undefined) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    this.teardownConnection();
  }

  private teardownConnection(): void {
    this.client?.close();
    this.client = undefined;
    this.connection = undefined;
  }

  /** One connect-and-join try. Wires the live connection's listeners; resolves when the server has answered (or it fails). */
  private async attempt(request: JoinRequest, token: string | undefined): Promise<JoinOutcome> {
    this.teardownConnection();
    const client = new RtcSignalingClient();
    this.client = client;

    let connection: RtcConnection;
    try {
      connection = await client.connect(new WebSocketClientSignalingChannel(this.url), this.iceServers);
    } catch (error) {
      client.close();
      return { kind: 'failed', message: error instanceof Error ? error.message : 'Could not connect.' };
    }
    if (this.stopped) {
      client.close();
      return { kind: 'failed', message: 'Cancelled.' };
    }
    this.connection = connection;

    return new Promise<JoinOutcome>((resolve) => {
      let answered = false;
      const answer = (outcome: JoinOutcome): void => {
        if (answered) return;
        answered = true;
        clearTimeout(timer);
        resolve(outcome);
      };
      const timer = setTimeout(
        () => answer({ kind: 'failed', message: 'The server did not answer the join request.' }),
        JOIN_ANSWER_TIMEOUT_MS,
      );

      connection.onReliableMessage((raw) => {
        const joined = decodeJoined(raw);
        if (joined) return answer({ kind: 'joined', joined });
        const reject = decodeReject(raw);
        if (reject) return answer({ kind: 'rejected', reason: reject.reason });
        const lobby = decodeLobbyState(raw);
        if (lobby) {
          this.latestLobby = lobby;
          dispatch(this.lobbyListeners, lobby);
        }
      });
      connection.onUnreliableMessage((raw) => {
        const snapshot = decodeSnapshot(raw);
        if (snapshot) dispatch(this.snapshotListeners, snapshot);
      });
      connection.onClosed(() => {
        if (answered) this.handleClosed(connection);
        else answer({ kind: 'failed', message: 'The connection was lost while joining.' });
      });

      connection.sendReliable(
        encodeJoin({
          type: 'debris-join',
          protocolVersion: PROTOCOL_VERSION,
          password: request.password,
          localPlayers: request.localPlayers,
          initials: request.initials,
          ...(token !== undefined ? { token } : {}),
        }),
      );
    });
  }

  private handleClosed(connection: RtcConnection): void {
    // A stale connection (we already moved on to a newer one) or a deliberate stop.
    if (this.stopped || this.connection !== connection || !this.joinedMessage) return;
    void this.reconnect();
  }

  private async reconnect(): Promise<void> {
    if (this.reconnecting || !this.request || !this.joinedMessage) return;
    this.reconnecting = true;
    const { token, reconnectGraceMs } = this.joinedMessage;
    const startedAt = Date.now();

    for (let attemptNumber = 0; !this.stopped; attemptNumber += 1) {
      const delay = reconnectDelay(attemptNumber, Date.now() - startedAt, reconnectGraceMs);
      if (delay === undefined) break;
      if (delay > 0) await new Promise<void>((done) => (this.reconnectTimer = setTimeout(done, delay)));
      if (this.stopped) break;

      const secondsLeft = Math.max(0, Math.ceil((reconnectGraceMs - (Date.now() - startedAt)) / 1000));
      dispatch(this.reconnectingListeners, secondsLeft);

      const outcome = await this.attempt(this.request, token);
      if (outcome.kind === 'joined') {
        this.joinedMessage = outcome.joined;
        this.reconnecting = false;
        dispatch(this.reconnectedListeners);
        return;
      }
      // The server answered and said no (seat gone, match over): trying again cannot help.
      if (outcome.kind === 'rejected') break;
    }

    this.reconnecting = false;
    if (!this.stopped) {
      this.stop();
      dispatch(this.disconnectedListeners);
    }
  }
}
