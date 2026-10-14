import type { HullId } from '../config/GameConfig';
import { RemoteInput } from '../input/RemoteInput';
import { DedicatedLobby } from './DedicatedLobby';
import type { DedicatedMatchControl, MatchResult } from './DedicatedMatch';
import { PROTOCOL_VERSION } from './LanDiscoveryProtocol';
import {
  decodeLobbyCommand,
  encodeLobbyState,
  encodeReject,
  type LobbyCommandMessage,
  type RejectReason,
} from './NetworkHandshakeProtocol';
import { NetworkHostSession } from './NetworkSession';
import { decodeJoin, encodeJoined, TOKEN_LENGTH } from './OnlineProtocol';
import { ReconnectLedger } from './ReconnectLedger';
import type { RtcConnection } from './RtcConnection';
import { safeEqual } from './SafeEqual';
import {
  BridgeHostSignalingChannel,
  type ServerLogLevel,
  type ServerRuntimeConfig,
  type ServerStatus,
} from './ServerBridge';

const HULLS: readonly HullId[] = ['interceptor', 'interceptor', 'interceptor', 'interceptor'];

/** How long a rejected connection is kept open so its `debris-reject` can flush before the close. */
const REJECT_FLUSH_MS = 300;
/** A connection that has not sent a valid `debris-join` by now is dropped - it holds a WebRTC connection open for nothing. */
const JOIN_TIMEOUT_MS = 10000;
const EXPIRY_CHECK_MS = 1000;

/** What `GameScene` is started with for a dedicated match - see its `init` data. */
export interface MatchStart {
  readonly mode: 'cooperative' | 'competitive';
  readonly sources: never[];
  readonly hulls: readonly HullId[];
  readonly networkRole: 'host';
  readonly localSlotIndex: -1;
  readonly hostSession: NetworkHostSession;
  readonly remoteInputsBySlot: Map<number, RemoteInput>;
  readonly remoteConnectionsBySlot: Map<number, RtcConnection>;
  readonly dedicated: {
    readonly returnToLobbyDelayMs: number;
    readonly onMatchEnded: (result: MatchResult) => void;
    readonly onReady: (control: DedicatedMatchControl) => void;
  };
}

export interface DedicatedServerEnv {
  readonly log: (level: ServerLogLevel, message: string) => void;
  /** Start the host `GameScene` with these parameters. */
  readonly startMatch: (start: MatchStart) => void;
  /** Stop the running match and show the lobby scene again. */
  readonly returnToLobby: () => void;
  /** Tell the main process what to answer signaling-socket status queries with. */
  readonly setStatus: (status: ServerStatus) => void;
  /** Injected so tests (and the 30 s window) never depend on the wall clock. */
  readonly now?: () => number;
}

/** One WebRTC connection. It becomes an *owner* (a seated PC) once it sends a valid join. */
interface Session {
  readonly connection: RtcConnection;
  owner: number | undefined;
  slots: readonly number[];
  token: string | undefined;
  joinTimer: ReturnType<typeof setTimeout> | undefined;
  /** Set when a reconnecting client took this session's seat over - its own close event must not touch the seat. */
  superseded: boolean;
}

const randomToken = (): string => {
  const bytes = new Uint8Array(TOKEN_LENGTH / 2);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * The dedicated server's brain (docs/roadmap.md's "Windows + LAN
 * multiplayer" - online phases 4-5): feeds real connections into the pure
 * `DedicatedLobby` rules, relays its decisions to clients over the
 * reliable channel, and runs the lobby -> match -> lobby loop.
 *
 * It outlives any scene - connections stay up across matches - so it is
 * created once and kept (`DedicatedServerScene` stores it in the game
 * registry) while the scenes come and go around it.
 *
 * **Nobody is seated until they send `debris-join`**: that is where the
 * protocol version, the password and the number of local players are
 * checked, and where a reconnect token is honoured.
 *
 * **Authority over identity**: a connection's seat is fixed at join, and
 * everything it sends afterwards is attributed to *that* seat. Lobby
 * commands are attributed to the connection's owner id, and an input
 * message is only applied if the slot it names is one of the connection's
 * own - a client can neither drive someone else's ship nor issue the
 * leader's commands.
 *
 * **Reconnect window**: a player who drops mid-match keeps their seat for
 * `gameplay.reconnectGraceMs`. Their ship goes inert and untouchable (a
 * "ghost"), their input is neutral, and the lobby shows the slot as held.
 * A join carrying their token within the window takes it all back; when the
 * window closes, or the match ends, the seat is released. Outside a match a
 * drop just leaves.
 */
export class DedicatedServer {
  private readonly lobby: DedicatedLobby;
  private readonly hostSession: NetworkHostSession;
  private readonly sessionByConnection = new Map<RtcConnection, Session>();
  private readonly sessionByOwner = new Map<number, Session>();
  private readonly ownerByToken = new Map<string, number>();
  private readonly tokenByOwner = new Map<number, string>();
  private readonly heldOwners = new Set<number>();
  private readonly ledger: ReconnectLedger<{ owner: number }>;
  private remoteInputsBySlot = new Map<number, RemoteInput>();
  private control: DedicatedMatchControl | undefined;
  private nextOwner = 1;

  constructor(
    private readonly config: ServerRuntimeConfig,
    private readonly env: DedicatedServerEnv,
  ) {
    this.lobby = new DedicatedLobby(config.gameplay.maxPlayers, config.gameplay.defaultMode);
    this.ledger = new ReconnectLedger(config.gameplay.reconnectGraceMs);
    this.hostSession = new NetworkHostSession({
      transport: 'online',
      snapshotHz: config.ops.snapshotHz,
      channel: new BridgeHostSignalingChannel(),
      iceServers: config.network.stunServers.map((urls) => ({ urls })),
    });
  }

  private now(): number {
    return (this.env.now ?? Date.now)();
  }

  /** Begins accepting connections. Call once. */
  start(): void {
    this.hostSession.start(
      (connection) => this.onConnected(connection),
      (message, from) => {
        const session = this.sessionByConnection.get(from);
        if (!session || session.owner === undefined || session.superseded) return; // not seated
        // A message's own slot is only a claim: honour it only for a slot this connection owns.
        if (!session.slots.includes(message.slotIndex)) return;
        this.remoteInputsBySlot.get(message.slotIndex)?.applyMessage(message);
      },
    );
    setInterval(() => this.releaseExpiredSeats(), EXPIRY_CHECK_MS);
    this.pushStatus();
    this.env.log('info', `${this.config.name}: lobby open, waiting for players`);
  }

  // ---------------------------------------------------------------
  // Connections and joining
  // ---------------------------------------------------------------

  private onConnected(connection: RtcConnection): void {
    const session: Session = {
      connection,
      owner: undefined,
      slots: [],
      token: undefined,
      joinTimer: undefined,
      superseded: false,
    };
    this.sessionByConnection.set(connection, session);
    session.joinTimer = setTimeout(() => {
      if (session.owner === undefined) {
        this.env.log('debug', 'Dropped a connection that never sent a join');
        connection.close();
      }
    }, JOIN_TIMEOUT_MS);

    connection.onReliableMessage((raw) => {
      if (session.owner === undefined) {
        const join = decodeJoin(raw);
        if (!join) this.reject(session, 'badRequest');
        else this.handleJoin(session, join);
        return;
      }
      const command = decodeLobbyCommand(raw);
      if (command) this.onCommand(session.owner, command);
    });
    connection.onClosed(() => this.onClosed(session));
  }

  private reject(session: Session, reason: RejectReason): void {
    this.env.log('info', `Turned a connection away: ${reason}`);
    if (session.joinTimer) clearTimeout(session.joinTimer);
    session.connection.sendReliable(encodeReject({ type: 'debris-reject', reason }));
    setTimeout(() => session.connection.close(), REJECT_FLUSH_MS);
  }

  private handleJoin(session: Session, join: NonNullable<ReturnType<typeof decodeJoin>>): void {
    if (join.protocolVersion !== PROTOCOL_VERSION) return this.reject(session, 'wrongVersion');
    if (this.config.password !== '' && !safeEqual(join.password, this.config.password)) {
      return this.reject(session, 'badPassword');
    }

    // A token that names a seated owner takes that seat back - whether the
    // old connection was already noticed as dropped (held) or is still
    // limping along (a quick reconnect beats the keep-alive timeout).
    const resumeOwner = join.token !== undefined ? this.ownerByToken.get(join.token) : undefined;
    if (resumeOwner !== undefined && this.lobby.slotsOf(resumeOwner).length > 0) {
      this.resumeSeat(session, resumeOwner, join.token!);
      return;
    }

    const owner = this.nextOwner;
    this.nextOwner += 1;
    const seated = this.lobby.join(owner, join.localPlayers);
    if (!seated.ok) return this.reject(session, seated.reason);

    const token = randomToken();
    this.seat(session, owner, seated.slots, token);
    this.sendJoined(session, false);
    this.env.log('info', `Player joined as slot${seated.slots.length > 1 ? 's' : ''} ${seated.slots.join('+')} (${this.lobby.playerCount}/${this.config.gameplay.maxPlayers})`);
    this.broadcastLobby();
    this.pushStatus();
  }

  private seat(session: Session, owner: number, slots: readonly number[], token: string): void {
    if (session.joinTimer) clearTimeout(session.joinTimer);
    session.owner = owner;
    session.slots = slots;
    session.token = token;
    this.sessionByOwner.set(owner, session);
    this.ownerByToken.set(token, owner);
    this.tokenByOwner.set(owner, token);
  }

  private resumeSeat(session: Session, owner: number, token: string): void {
    const previous = this.sessionByOwner.get(owner);
    if (previous && previous !== session) {
      previous.superseded = true; // its close event must not hold or release the seat we are taking over
      previous.connection.close();
    }
    this.ledger.claim(token, this.now());
    this.heldOwners.delete(owner);

    const slots = this.lobby.slotsOf(owner);
    this.seat(session, owner, slots, token);
    slots.forEach((slot) => {
      this.remoteInputsBySlot.get(slot)?.reset();
      this.control?.setSlotConnected(slot, true);
    });
    this.sendJoined(session, true);
    this.env.log('info', `Player reconnected to slot${slots.length > 1 ? 's' : ''} ${slots.join('+')}`);
    this.broadcastLobby();
  }

  private sendJoined(session: Session, resumed: boolean): void {
    session.connection.sendReliable(
      encodeJoined({
        type: 'debris-joined',
        protocolVersion: PROTOCOL_VERSION,
        slotIndices: session.slots,
        token: session.token!,
        mode: this.lobby.currentMode,
        hulls: HULLS,
        resumed,
        inMatch: resumed && this.lobby.isInMatch,
        serverName: this.config.name,
        motd: this.config.motd,
        reconnectGraceMs: this.config.gameplay.reconnectGraceMs,
      }),
    );
  }

  // ---------------------------------------------------------------
  // Lobby commands
  // ---------------------------------------------------------------

  private onCommand(owner: number, command: LobbyCommandMessage): void {
    const result = this.lobby.command(owner, command);
    if (result === 'ignored') {
      this.env.log('debug', `Ignored ${command.action} from owner ${owner}`);
      return;
    }
    if (result === 'modeChanged') {
      this.env.log('info', `Leader set the mode to ${this.lobby.currentMode}`);
      this.broadcastLobby();
      this.pushStatus();
      return;
    }
    this.startMatch();
  }

  // ---------------------------------------------------------------
  // Drops, holds and releases
  // ---------------------------------------------------------------

  private onClosed(session: Session): void {
    if (session.joinTimer) clearTimeout(session.joinTimer);
    this.sessionByConnection.delete(session.connection);
    // The peer is gone, but our end of the WebRTC connection is not closed
    // by that: left open it keeps its UDP port from the pinned range and
    // keeps sending keep-alive probes at a dead address, for every player
    // who ever left. Close it (a no-op if it is already closed).
    session.connection.close();
    const owner = session.owner;
    if (owner === undefined || session.superseded) return;
    if (this.sessionByOwner.get(owner) === session) this.sessionByOwner.delete(owner);

    const grace = this.config.gameplay.reconnectGraceMs;
    if (this.lobby.isInMatch && grace > 0) {
      this.ledger.hold(session.token!, { owner }, this.now());
      this.heldOwners.add(owner);
      session.slots.forEach((slot) => {
        this.remoteInputsBySlot.get(slot)?.reset();
        this.control?.setSlotConnected(slot, false);
      });
      this.env.log('info', `Player in slot${session.slots.length > 1 ? 's' : ''} ${session.slots.join('+')} dropped - holding the seat for ${Math.round(grace / 1000)}s`);
      this.broadcastLobby();
      return;
    }
    this.releaseOwner(owner, true);
  }

  private releaseExpiredSeats(): void {
    this.ledger.expire(this.now()).forEach(({ owner }) => {
      this.env.log('info', 'Reconnect window closed - releasing the seat');
      this.releaseOwner(owner, true);
    });
  }

  /** Frees an owner's seat for good. `eliminate` removes their ships from a running match. */
  private releaseOwner(owner: number, eliminate: boolean): void {
    const slots = this.lobby.slotsOf(owner);
    this.lobby.leave(owner);
    this.heldOwners.delete(owner);
    const token = this.tokenByOwner.get(owner);
    if (token !== undefined) {
      this.ownerByToken.delete(token);
      this.ledger.claim(token, this.now());
    }
    this.tokenByOwner.delete(owner);
    this.sessionByOwner.delete(owner);
    if (eliminate && this.lobby.isInMatch) slots.forEach((slot) => this.control?.eliminateSlot(slot));
    this.env.log('info', `Player in slot${slots.length > 1 ? 's' : ''} ${slots.join('+')} left (${this.lobby.playerCount} remaining)`);
    this.broadcastLobby();
    this.pushStatus();
  }

  // ---------------------------------------------------------------
  // Match loop
  // ---------------------------------------------------------------

  private startMatch(): void {
    const slots = [...this.lobby.memberSlots];
    // Fresh inputs every match, so a key held when the last one ended can't carry over.
    this.remoteInputsBySlot = new Map(slots.map((slot) => [slot, new RemoteInput()]));
    const connections = new Map<number, RtcConnection>();
    this.sessionByOwner.forEach((session) => {
      session.slots.forEach((slot) => connections.set(slot, session.connection));
    });

    this.env.log('info', `Starting a ${this.lobby.currentMode} match with ${slots.length} player(s)`);
    this.broadcastLobby();
    this.pushStatus();
    this.env.startMatch({
      mode: this.lobby.currentMode,
      sources: [],
      hulls: HULLS,
      networkRole: 'host',
      localSlotIndex: -1,
      hostSession: this.hostSession,
      remoteInputsBySlot: this.remoteInputsBySlot,
      remoteConnectionsBySlot: connections,
      dedicated: {
        returnToLobbyDelayMs: this.config.gameplay.returnToLobbyDelayMs,
        onMatchEnded: (result) => this.onMatchEnded(result),
        onReady: (control) => {
          this.control = control;
        },
      },
    });
  }

  private onMatchEnded(result: MatchResult): void {
    const summary =
      result.outcome === 'win'
        ? `slot ${result.winnerSlot} wins with ${result.scores[result.winnerSlot ?? 0] ?? 0}`
        : result.outcome === 'draw'
          ? 'draw'
          : `team lost with ${result.pooledScore}`;
    this.env.log('info', `Match over (${result.mode}): ${summary}`);

    // Nothing is left to rejoin: release every seat still being held.
    this.ledger.clear().forEach(({ owner }) => this.releaseOwner(owner, false));
    this.control = undefined;
    this.lobby.endMatch();
    this.remoteInputsBySlot = new Map();
    this.broadcastLobby();
    this.pushStatus();
    this.env.returnToLobby();
  }

  /** The lobby scene came back up after a match - make sure everyone who is still connected has the current picture. */
  resume(): void {
    this.broadcastLobby();
  }

  // ---------------------------------------------------------------
  // Outbound
  // ---------------------------------------------------------------

  private broadcastLobby(): void {
    const heldSlots = [...this.heldOwners].flatMap((owner) => this.lobby.slotsOf(owner));
    const encoded = encodeLobbyState(this.lobby.snapshot(heldSlots));
    this.sessionByOwner.forEach((session) => session.connection.sendReliable(encoded));
  }

  private pushStatus(): void {
    this.env.setStatus({
      protocolVersion: PROTOCOL_VERSION,
      status: this.lobby.isInMatch ? 'inMatch' : 'lobby',
      mode: this.lobby.currentMode,
      players: { current: this.lobby.playerCount, max: this.config.gameplay.maxPlayers },
    });
  }
}
