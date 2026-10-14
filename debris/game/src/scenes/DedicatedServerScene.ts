import Phaser from 'phaser';
import type { HullId } from '../config/GameConfig';
import { RemoteInput } from '../input/RemoteInput';
import { PROTOCOL_VERSION } from '../systems/LanDiscoveryProtocol';
import { encodeWelcome } from '../systems/NetworkHandshakeProtocol';
import { NetworkHostSession } from '../systems/NetworkSession';
import type { RtcConnection } from '../systems/RtcConnection';
import { BridgeHostSignalingChannel, type ServerRuntimeConfig } from '../systems/ServerBridge';

const HULLS: readonly HullId[] = ['interceptor', 'interceptor', 'interceptor', 'interceptor'];

/**
 * The dedicated server's entry scene (docs/roadmap.md's "Windows + LAN
 * multiplayer" - online phase 3). `BootScene` hands over here instead of
 * the splash screen when the page was loaded with `?server=1`
 * (`ServerBridge.ts`'s `isServerMode`).
 *
 * **Temporary lobby.** Accepts clients, gives each the lowest free slot
 * and a `WelcomeMessage`, then starts the match automatically
 * `config.dev.autoStartDelayMs` after the first one joins. That exists
 * only so phase 3 can prove the whole path end to end (signaling ->
 * WebRTC -> welcome -> a host `GameScene` with no local ship -> snapshots
 * arriving). Phase 4 replaces it with the real lobby: first joiner is
 * leader, the leader presses START and picks the mode, and a finished
 * match returns here.
 */
export class DedicatedServerScene extends Phaser.Scene {
  private hostSession: NetworkHostSession | undefined;
  private startTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly remoteInputsBySlot = new Map<number, RemoteInput>();
  private readonly remoteConnectionsBySlot = new Map<number, RtcConnection>();

  constructor() {
    super('DedicatedServer');
  }

  create(): void {
    const bridge = window.debrisServer;
    if (!bridge) {
      console.error('DedicatedServerScene started without window.debrisServer - not running under the server shell.');
      return;
    }
    void bridge.getConfig().then((config) => this.openLobby(config));
  }

  shutdown(): void {
    if (this.startTimer !== undefined) clearTimeout(this.startTimer);
    this.startTimer = undefined;
  }

  private openLobby(config: ServerRuntimeConfig): void {
    const log = window.debrisServer!.log;
    this.remoteInputsBySlot.clear();
    this.remoteConnectionsBySlot.clear();

    const hostSession = new NetworkHostSession({
      transport: 'online',
      snapshotHz: config.ops.snapshotHz,
      channel: new BridgeHostSignalingChannel(),
      iceServers: config.network.stunServers.map((urls) => ({ urls })),
    });
    this.hostSession = hostSession;

    hostSession.start(
      (connection) => {
        const slotIndex = this.lowestFreeSlot(config.gameplay.maxPlayers);
        if (slotIndex === undefined) {
          log('warn', 'Lobby full - dropping an extra connection');
          connection.close();
          return;
        }
        this.remoteInputsBySlot.set(slotIndex, new RemoteInput());
        this.remoteConnectionsBySlot.set(slotIndex, connection);
        connection.sendReliable(
          encodeWelcome({
            type: 'debris-welcome',
            slotIndex,
            mode: config.gameplay.defaultMode,
            hulls: HULLS,
            protocolVersion: PROTOCOL_VERSION,
          }),
        );
        log('info', `Player joined as slot ${slotIndex} (${this.remoteInputsBySlot.size}/${config.gameplay.maxPlayers})`);

        // A drop before the match starts frees the slot. Once it has,
        // GameScene's own registerRemoteDisconnectHandlers() owns this.
        connection.onClosed(() => {
          if (this.remoteInputsBySlot.get(slotIndex) === undefined) return;
          this.remoteInputsBySlot.delete(slotIndex);
          this.remoteConnectionsBySlot.delete(slotIndex);
          log('info', `Player in slot ${slotIndex} left`);
        });

        if (this.startTimer === undefined) {
          this.startTimer = setTimeout(() => this.startMatch(config), config.dev.autoStartDelayMs);
        }
      },
      (message) => {
        this.remoteInputsBySlot.get(message.slotIndex)?.applyMessage(message);
      },
    );
    window.debrisServer!.ready();
    log('info', `${config.name}: lobby open, waiting for players`);
  }

  private lowestFreeSlot(maxPlayers: number): number | undefined {
    for (let slot = 0; slot < maxPlayers; slot += 1) {
      if (!this.remoteInputsBySlot.has(slot)) return slot;
    }
    return undefined;
  }

  private startMatch(config: ServerRuntimeConfig): void {
    this.startTimer = undefined;
    if (this.remoteInputsBySlot.size === 0) return;
    window.debrisServer!.log('info', `Starting ${config.gameplay.defaultMode} match with ${this.remoteInputsBySlot.size} player(s)`);
    this.scene.start('Game', {
      mode: config.gameplay.defaultMode,
      sources: [],
      hulls: HULLS,
      networkRole: 'host',
      localSlotIndex: -1,
      hostSession: this.hostSession,
      remoteInputsBySlot: this.remoteInputsBySlot,
      remoteConnectionsBySlot: this.remoteConnectionsBySlot,
    });
  }
}
