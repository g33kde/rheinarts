import Phaser from 'phaser';
import { ARENA_WIDTH, COLORS, LAN_DISCOVERY, type HullId } from '../config/GameConfig';
import { LanDiscovery, LanHost, isLanAvailable } from '../systems/LanDiscovery';
import { PROTOCOL_VERSION, type DiscoveredGame } from '../systems/LanDiscoveryProtocol';
import { NetworkClientSession, NetworkHostSession } from '../systems/NetworkSession';
import type { RtcConnection } from '../systems/RtcConnection';
import { encodeWelcome } from '../systems/NetworkHandshakeProtocol';
import { RemoteInput } from '../input/RemoteInput';

/**
 * Host/Join entry point for LAN multiplayer (docs/roadmap.md's "Windows
 * + LAN multiplayer," Sprint 6/7 combined on request - no debug flag,
 * this is the real menu). Desktop-only: every button here either no-ops
 * or shows an explanatory message in a plain browser tab, since
 * `window.debrisLan` (and therefore `isLanAvailable()`) is never
 * present there - see `LanDiscovery.ts`'s own doc comment.
 *
 * Deliberately plain - rectangles and text, the same `makeButton` shape
 * `MenuScene.ts` already uses. Visual polish is not this sprint's job;
 * proving the actual host/join/play loop works at all is.
 */

const HULLS: readonly HullId[] = ['interceptor', 'interceptor', 'interceptor', 'interceptor'];

interface Button {
  readonly bg: Phaser.GameObjects.Rectangle;
  readonly text: Phaser.GameObjects.Text;
}

export class LanLobbyScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private screenObjects: Phaser.GameObjects.GameObject[] = [];

  private lanHost: LanHost | undefined;
  private lanDiscovery: LanDiscovery | undefined;
  private hostSession: NetworkHostSession | undefined;
  private clientSession: NetworkClientSession | undefined;
  // Single Player makes no sense networked (nobody to network with), so
  // this is narrower than GameMode on purpose - no mode-toggle UI exists
  // yet either, this just always defaults to cooperative for now.
  private mode: 'cooperative' | 'competitive' = 'cooperative';
  private remoteInputsBySlot: Map<number, RemoteInput> = new Map();
  /** Handed to GameScene alongside remoteInputsBySlot, purely so it can register its own onClosed handler (Sprint 7's disconnect rule) once it's the scene actually running - a listener registered here, by this scene, would still be a stale closure once scene.start('Game', ...) has moved on. */
  private remoteConnectionsBySlot: Map<number, RtcConnection> = new Map();
  private nextRemoteSlot = 1;

  constructor() {
    super('LanLobby');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.statusText = this.add
      .text(ARENA_WIDTH / 2, 120, '', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#c9c9d6',
        align: 'center',
      })
      .setOrigin(0.5);

    if (!isLanAvailable()) {
      this.statusText.setText('LAN multiplayer is only available in the desktop app.');
      this.makeButton(ARENA_WIDTH / 2, 500, 'BACK', () => this.scene.start('Menu'));
      return;
    }

    this.showMainMenu();
  }

  shutdown(): void {
    this.lanHost?.stop();
    this.lanDiscovery?.stop();
  }

  private clearScreen(): void {
    this.screenObjects.forEach((object) => object.destroy());
    this.screenObjects = [];
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void): Button {
    const bg = this.add
      .rectangle(x, y, 280, 70, 0x14141c, 1)
      .setStrokeStyle(2, COLORS.players[0]!, 1);
    const text = this.add
      .text(x, y, label, {
        fontFamily: 'monospace',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
    this.screenObjects.push(bg, text);
    return { bg, text };
  }

  private showMainMenu(): void {
    this.clearScreen();
    this.statusText.setText('LAN Multiplayer');
    this.makeButton(ARENA_WIDTH / 2, 420, 'HOST GAME', () => this.showHostScreen());
    this.makeButton(ARENA_WIDTH / 2, 510, 'JOIN GAME', () => this.showJoinScreen());
    this.makeButton(ARENA_WIDTH / 2, 600, 'BACK', () => this.scene.start('Menu'));
  }

  // ---------------------------------------------------------------
  // Host
  // ---------------------------------------------------------------

  private showHostScreen(): void {
    this.clearScreen();
    this.remoteInputsBySlot = new Map();
    this.remoteConnectionsBySlot = new Map();
    this.nextRemoteSlot = 1;

    this.hostSession = new NetworkHostSession();
    this.hostSession.start(
      (connection) => {
        const slotIndex = this.nextRemoteSlot;
        this.nextRemoteSlot += 1;
        const input = new RemoteInput();
        this.remoteInputsBySlot.set(slotIndex, input);
        this.remoteConnectionsBySlot.set(slotIndex, connection);
        connection.sendReliable(
          encodeWelcome({ type: 'debris-welcome', slotIndex, mode: this.mode, hulls: HULLS }),
        );
        this.refreshHostStatus();
      },
      (message) => {
        this.remoteInputsBySlot.get(message.slotIndex)?.applyMessage(message);
      },
    );

    this.lanHost = new LanHost();
    this.announceHost();

    this.refreshHostStatus();
    this.makeButton(ARENA_WIDTH / 2, 500, 'START', () => this.startHostedMatch());
    this.makeButton(ARENA_WIDTH / 2, 590, 'CANCEL', () => {
      this.lanHost?.stop();
      this.hostSession?.stop();
      this.showMainMenu();
    });
  }

  private announceHost(): void {
    this.lanHost?.start({
      type: 'debris-announce',
      protocolVersion: PROTOCOL_VERSION,
      hostName: "Host's Game",
      mode: this.mode,
      players: { current: 1 + this.remoteInputsBySlot.size, max: 4 },
      signalPort: LAN_DISCOVERY.broadcastPort,
    });
  }

  private refreshHostStatus(): void {
    this.announceHost(); // player count changed - re-announce with the latest, rather than waiting for the next scheduled tick
    const connected = this.remoteInputsBySlot.size;
    this.statusText.setText(
      `Hosting - ${1 + connected}/4 players connected\n(start whenever ready)`,
    );
  }

  private startHostedMatch(): void {
    this.lanHost?.stop();
    this.scene.start('Game', {
      mode: this.mode,
      sources: ['keyboard'],
      hulls: HULLS,
      networkRole: 'host',
      localSlotIndex: 0,
      hostSession: this.hostSession,
      remoteInputsBySlot: this.remoteInputsBySlot,
      remoteConnectionsBySlot: this.remoteConnectionsBySlot,
    });
  }

  // ---------------------------------------------------------------
  // Join
  // ---------------------------------------------------------------

  private showJoinScreen(): void {
    this.clearScreen();
    this.statusText.setText('Searching for games on your network...');

    this.lanDiscovery = new LanDiscovery();
    this.lanDiscovery.start((games) => this.renderDiscoveredGames(games));

    this.makeButton(ARENA_WIDTH / 2, 600, 'CANCEL', () => {
      this.lanDiscovery?.stop();
      this.showMainMenu();
    });
  }

  private renderDiscoveredGames(games: readonly DiscoveredGame[]): void {
    // Rebuilds the row buttons only, keeping the CANCEL button and the
    // status line (whatever it currently says - don't stomp a
    // "Connecting..." message with "no games found yet" from a
    // still-arriving announce).
    this.screenObjects
      .filter((object) => object.getData('role') === 'game-row')
      .forEach((object) => object.destroy());
    this.screenObjects = this.screenObjects.filter(
      (object) => object.getData('role') !== 'game-row',
    );

    if (games.length === 0) {
      return;
    }

    games.forEach((game, index) => {
      const y = 250 + index * 90;
      const label = `${game.packet.hostName} (${game.packet.players.current}/${game.packet.players.max})`;
      const button = this.makeButton(ARENA_WIDTH / 2, y, label, () => this.joinGame(game));
      button.bg.setData('role', 'game-row');
      button.text.setData('role', 'game-row');
    });
  }

  private joinGame(game: DiscoveredGame): void {
    this.lanDiscovery?.stop();
    this.statusText.setText(`Connecting to ${game.packet.hostName}...`);

    this.clientSession = new NetworkClientSession();
    this.clientSession.onWelcome((welcome) => {
      this.scene.start('Game', {
        mode: welcome.mode,
        hulls: welcome.hulls,
        networkRole: 'client',
        localSlotIndex: welcome.slotIndex,
        clientSession: this.clientSession,
      });
    });

    void this.clientSession.connect(game.address, game.packet.signalPort).catch(() => {
      this.statusText.setText(`Could not connect to ${game.packet.hostName}.`);
    });
  }
}
