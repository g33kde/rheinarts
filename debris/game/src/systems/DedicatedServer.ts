import type { HullId } from '../config/GameConfig';
import { RemoteInput } from '../input/RemoteInput';
import { DedicatedLobby } from './DedicatedLobby';
import type { MatchResult } from './DedicatedMatch';
import { PROTOCOL_VERSION } from './LanDiscoveryProtocol';
import {
  decodeLobbyCommand,
  encodeLobbyState,
  encodeReject,
  encodeWelcome,
} from './NetworkHandshakeProtocol';
import { NetworkHostSession } from './NetworkSession';
import type { RtcConnection } from './RtcConnection';
import { BridgeHostSignalingChannel, type ServerLogLevel, type ServerRuntimeConfig } from './ServerBridge';

const HULLS: readonly HullId[] = ['interceptor', 'interceptor', 'interceptor', 'interceptor'];

/** How long a rejected connection is kept open so its `debris-reject` can flush before the close. */
const REJECT_FLUSH_MS = 300;

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
  };
}

export interface DedicatedServerEnv {
  readonly log: (level: ServerLogLevel, message: string) => void;
  /** Start the host `GameScene` with these parameters. */
  readonly startMatch: (start: MatchStart) => void;
  /** Stop the running match and show the lobby scene again. */
  readonly returnToLobby: () => void;
}

/**
 * The dedicated server's brain (docs/roadmap.md's "Windows + LAN
 * multiplayer" - online phase 4): feeds real connections into the pure
 * `DedicatedLobby` rules, relays its decisions to clients over the
 * reliable channel, and runs the lobby -> match -> lobby loop.
 *
 * It outlives any scene - connections stay up across matches - so it is
 * created once and kept (`DedicatedServerScene` stores it in the game
 * registry) while the scenes come and go around it.
 *
 * **Authority over identity**: a connection's slot is fixed when it is
 * seated, and everything it sends afterwards (lobby commands, input) is
 * attributed to *that* slot. A message's own `slotIndex` claim is ignored,
 * so a client can neither drive someone else's ship nor issue the leader's
 * commands.
 */
export class DedicatedServer {
  private readonly lobby: DedicatedLobby;
  private readonly hostSession: NetworkHostSession;
  private readonly slotByConnection = new Map<RtcConnection, number>();
  private readonly connectionBySlot = new Map<number, RtcConnection>();
  private remoteInputsBySlot = new Map<number, RemoteInput>();

  constructor(
    private readonly config: ServerRuntimeConfig,
    private readonly env: DedicatedServerEnv,
  ) {
    this.lobby = new DedicatedLobby(config.gameplay.maxPlayers, config.gameplay.defaultMode);
    this.hostSession = new NetworkHostSession({
      transport: 'online',
      snapshotHz: config.ops.snapshotHz,
      channel: new BridgeHostSignalingChannel(),
      iceServers: config.network.stunServers.map((urls) => ({ urls })),
    });
  }

  /** Begins accepting connections. Call once. */
  start(): void {
    this.hostSession.start(
      (connection) => this.onConnected(connection),
      (message, from) => {
        const slot = this.slotByConnection.get(from);
        if (slot === undefined) return; // not seated (rejected, or already gone)
        this.remoteInputsBySlot.get(slot)?.applyMessage({ ...message, slotIndex: slot });
      },
    );
    this.env.log('info', `${this.config.name}: lobby open, waiting for players`);
  }

  private onConnected(connection: RtcConnection): void {
    const joined = this.lobby.join();
    if (!joined.ok) {
      this.env.log('info', `Turned a connection away: ${joined.reason}`);
      connection.sendReliable(encodeReject({ type: 'debris-reject', reason: joined.reason }));
      setTimeout(() => connection.close(), REJECT_FLUSH_MS);
      return;
    }

    const slot = joined.slotIndex;
    this.slotByConnection.set(connection, slot);
    this.connectionBySlot.set(slot, connection);
    connection.sendReliable(
      encodeWelcome({
        type: 'debris-welcome',
        slotIndex: slot,
        mode: this.lobby.currentMode,
        hulls: HULLS,
        protocolVersion: PROTOCOL_VERSION,
      }),
    );
    this.env.log('info', `Player joined as slot ${slot} (${this.lobby.memberSlots.length}/${this.config.gameplay.maxPlayers})`);

    connection.onReliableMessage((raw) => {
      const command = decodeLobbyCommand(raw);
      if (command) this.onCommand(slot, command);
    });
    connection.onClosed(() => this.onDisconnected(connection, slot));
    this.broadcastLobby();
  }

  private onCommand(slot: number, command: NonNullable<ReturnType<typeof decodeLobbyCommand>>): void {
    const result = this.lobby.command(slot, command);
    if (result === 'ignored') {
      this.env.log('debug', `Ignored ${command.action} from slot ${slot}`);
      return;
    }
    if (result === 'modeChanged') {
      this.env.log('info', `Slot ${slot} set the mode to ${this.lobby.currentMode}`);
      this.broadcastLobby();
      return;
    }
    this.startMatch(slot);
  }

  private onDisconnected(connection: RtcConnection, slot: number): void {
    if (this.slotByConnection.get(connection) !== slot) return;
    this.slotByConnection.delete(connection);
    this.connectionBySlot.delete(slot);
    this.lobby.leave(slot);
    this.env.log('info', `Player in slot ${slot} left (${this.lobby.memberSlots.length} remaining)`);
    this.broadcastLobby();
  }

  private startMatch(startedBy: number): void {
    const slots = [...this.lobby.memberSlots];
    // Fresh inputs every match, so a key held when the last one ended can't carry over.
    this.remoteInputsBySlot = new Map(slots.map((slot) => [slot, new RemoteInput()]));
    const connections = new Map<number, RtcConnection>();
    slots.forEach((slot) => {
      const connection = this.connectionBySlot.get(slot);
      if (connection) connections.set(slot, connection);
    });

    this.env.log('info', `Slot ${startedBy} started a ${this.lobby.currentMode} match with ${slots.length} player(s)`);
    this.broadcastLobby();
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
    this.lobby.endMatch();
    this.remoteInputsBySlot = new Map();
    this.broadcastLobby();
    this.env.returnToLobby();
  }

  /** The lobby scene came back up after a match - make sure everyone who is still connected has the current picture. */
  resume(): void {
    this.broadcastLobby();
  }

  private broadcastLobby(): void {
    const encoded = encodeLobbyState(this.lobby.snapshot());
    this.connectionBySlot.forEach((connection) => connection.sendReliable(encoded));
  }
}
