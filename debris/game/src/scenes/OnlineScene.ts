import Phaser from 'phaser';
import { ARENA_WIDTH, COLORS, ONLINE_SERVER } from '../config/GameConfig';
import type { LobbyStateMessage } from '../systems/NetworkHandshakeProtocol';
import {
  applyTextKey,
  describeReject,
  describeStatus,
  MAX_PASSWORD_LENGTH,
  type StatusView,
} from '../systems/OnlineClientLogic';
import { OnlineClientSession, queryServerStatus } from '../systems/OnlineClientSession';
import { resolveOnlineServerUrl } from '../systems/OnlineServerConfig';
import type { StatusReply } from '../systems/OnlineProtocol';

const STATUS_POLL_MS = 3000;
const PLAYER_LABELS = ['PLAYER 1', 'PLAYER 2', 'PLAYER 3', 'PLAYER 4'];

interface Button {
  readonly bg: Phaser.GameObjects.Rectangle;
  readonly text: Phaser.GameObjects.Text;
}

/**
 * The ONLINE screens (docs/roadmap.md's "Windows + LAN multiplayer" -
 * online phase 5): server status, password and join, the lobby, and the
 * messages for everything that can go wrong. One scene with four views:
 *
 * - **status**: polls the server over its signaling socket (no WebRTC) and
 *   shows who is on, the mode, and whether a password is needed; offers JOIN
 *   when joining could work, and says why not when it could not.
 * - **connecting**: the join in flight.
 * - **lobby**: who is seated, who leads, the mode. The leader gets START and
 *   a mode switch; everyone else waits. A match starting moves everyone into
 *   `GameScene`; it ending brings them back here with the same session.
 * - **message**: a reject, a failed connection or a lost one, in words.
 *
 * Started with `{ session }` after a match (straight back into the lobby) or
 * `{ message }` after a failure. Plain rectangles and text, like the other
 * lobby scenes - polish is not this scene's job.
 *
 * The session outlives this scene (lobby -> match -> lobby), so it is only
 * stopped by the buttons that mean "leave"; every listener this scene adds
 * is removed again on shutdown.
 */
export class OnlineScene extends Phaser.Scene {
  /** Resolved on every scene start (not once at construction), so a changed override applies without restarting the game. */
  private url = '';
  private screenObjects: Phaser.GameObjects.GameObject[] = [];
  private titleText!: Phaser.GameObjects.Text;
  private bodyText!: Phaser.GameObjects.Text;
  private noticeText!: Phaser.GameObjects.Text;

  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private cleanups: (() => void)[] = [];
  private session: OnlineClientSession | undefined;

  private statusReply: StatusReply | null | undefined; // undefined = no answer yet
  private statusView: StatusView | undefined;
  private localPlayers: 1 | 2 = 1;
  private password = '';
  private passwordText: Phaser.GameObjects.Text | undefined;

  constructor() {
    super('Online');
  }

  create(data?: { session?: OnlineClientSession; message?: string }): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.url = resolveOnlineServerUrl();
    this.screenObjects = [];
    this.cleanups = [];
    this.session = undefined;
    this.statusReply = undefined;
    this.statusView = undefined;
    this.password = '';

    this.titleText = this.add
      .text(ARENA_WIDTH / 2, 110, 'ONLINE', {
        fontFamily: 'monospace',
        fontSize: '36px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.bodyText = this.add
      .text(ARENA_WIDTH / 2, 330, '', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#c9c9d6',
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5);
    this.noticeText = this.add
      .text(ARENA_WIDTH / 2, 600, '', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffb347',
        align: 'center',
      })
      .setOrigin(0.5);

    // Typing goes to the password field (only while one is on screen).
    this.input.keyboard?.on('keydown', this.onKey);
    this.events.once('shutdown', () => {
      this.input.keyboard?.off('keydown', this.onKey);
      this.cleanup();
    });

    if (data?.session?.joined) {
      this.session = data.session;
      this.showLobby(data.session.lobby);
    } else if (data?.message) {
      this.showMessage(data.message);
    } else {
      this.showStatus();
    }
  }

  private cleanup(): void {
    if (this.pollTimer !== undefined) clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
    this.cleanups.forEach((off) => off());
    this.cleanups = [];
  }

  private clearScreen(): void {
    this.screenObjects.forEach((object) => object.destroy());
    this.screenObjects = [];
    this.passwordText = undefined;
    if (this.pollTimer !== undefined) clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
    this.noticeText.setText('');
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void, width = 360): Button {
    const bg = this.add
      .rectangle(x, y, width, 64, 0x14141c, 1)
      .setStrokeStyle(2, COLORS.players[0]!, 1);
    const text = this.add
      .text(x, y, label, { fontFamily: 'monospace', fontSize: '22px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
    this.screenObjects.push(bg, text);
    return { bg, text };
  }

  // ---------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------

  private showStatus(): void {
    this.clearScreen();
    this.titleText.setText('ONLINE');
    this.bodyText.setPosition(ARENA_WIDTH / 2, 300).setText(`Server: ${this.url}\n\nContacting the server...`);
    this.pollStatus();
  }

  private pollStatus(): void {
    void queryServerStatus(this.url).then((reply) => {
      // The screen may have moved on (joined, left) while the query was out.
      if (!this.scene.isActive('Online') || this.session) return;
      this.statusReply = reply;
      this.statusView = describeStatus(reply);
      this.renderStatus();
      this.pollTimer = setTimeout(() => this.pollStatus(), STATUS_POLL_MS);
    });
  }

  private renderStatus(): void {
    const view = this.statusView;
    if (!view) return;
    this.screenObjects.forEach((object) => object.destroy());
    this.screenObjects = [];
    this.passwordText = undefined;

    this.bodyText.setPosition(ARENA_WIDTH / 2, 320).setText([`Server: ${this.url}`, '', ...view.lines].join('\n'));

    const needsPassword = this.statusReply?.passwordRequired === true;
    let y = 560;
    if (needsPassword) {
      this.passwordText = this.add
        .text(ARENA_WIDTH / 2, y, '', { fontFamily: 'monospace', fontSize: '24px', color: '#ffffff' })
        .setOrigin(0.5);
      this.screenObjects.push(this.passwordText);
      this.refreshPasswordText();
      y += 80;
    }
    if (view.joinable) {
      this.makeButton(ARENA_WIDTH / 2, y, `PLAYERS ON THIS PC: ${this.localPlayers}`, () => {
        this.localPlayers = this.localPlayers === 1 ? 2 : 1;
        this.renderStatus();
      });
      this.makeButton(ARENA_WIDTH / 2, y + 80, 'JOIN', () => void this.join());
      this.noticeText.setPosition(ARENA_WIDTH / 2, y + 160).setText(
        this.localPlayers === 2 ? 'Player 1: WASD + Space    Player 2: arrow keys + Right Ctrl' : 'Controls: WASD + Space',
      );
      y += 160;
    } else if (view.blocker) {
      this.noticeText.setPosition(ARENA_WIDTH / 2, y).setText(view.blocker);
      y += 40;
    }
    this.makeButton(ARENA_WIDTH / 2, y + 100, 'BACK', () => this.scene.start('Multiplayer'));
  }

  private refreshPasswordText(): void {
    this.passwordText?.setText(`PASSWORD: ${'•'.repeat(this.password.length)}_`);
  }

  /** Typing goes to the password field while the status screen shows one. */
  private readonly onKey = (event: KeyboardEvent): void => {
    if (!this.passwordText) return;
    const result = applyTextKey(this.password, event.key, MAX_PASSWORD_LENGTH);
    this.password = result.text;
    this.refreshPasswordText();
    if (result.submitted && this.statusView?.joinable) void this.join();
  };

  // ---------------------------------------------------------------
  // Joining
  // ---------------------------------------------------------------

  private async join(): Promise<void> {
    if (this.session) return;
    const request = { password: this.password, localPlayers: this.localPlayers } as const;
    this.clearScreen();
    this.titleText.setText('ONLINE');
    this.bodyText.setPosition(ARENA_WIDTH / 2, 330).setText(`Connecting to ${this.statusReply?.name ?? this.url}...`);

    const session = new OnlineClientSession(
      this.url,
      ONLINE_SERVER.stunServers.map((urls) => ({ urls })),
    );
    this.session = session;
    this.makeButton(ARENA_WIDTH / 2, 600, 'CANCEL', () => {
      session.stop();
      this.session = undefined;
      this.showStatus();
    });

    const outcome = await session.join(request);
    if (this.session !== session) return; // cancelled meanwhile
    if (outcome.kind === 'joined') {
      this.showLobby(undefined);
    } else {
      this.session = undefined;
      this.showMessage(outcome.kind === 'rejected' ? describeReject(outcome.reason) : outcome.message);
    }
  }

  // ---------------------------------------------------------------
  // Lobby
  // ---------------------------------------------------------------

  private showLobby(initial: LobbyStateMessage | undefined): void {
    const session = this.session;
    if (!session?.joined) return;
    this.clearScreen();
    this.cleanups.push(
      session.onLobby((lobby) => this.renderLobby(lobby)),
      session.onDisconnected(() => {
        this.session = undefined;
        this.scene.restart({ message: 'The connection to the server was lost.' });
      }),
    );
    const lobby = initial ?? session.lobby;
    if (lobby) this.renderLobby(lobby);
    else this.bodyText.setText('Joined - waiting for the lobby...');
  }

  private renderLobby(lobby: LobbyStateMessage): void {
    const session = this.session;
    const joined = session?.joined;
    if (!session || !joined) return;

    // The leader started a match: everyone goes in.
    if (lobby.status === 'inMatch') {
      this.scene.start('Game', {
        mode: lobby.mode,
        hulls: joined.hulls,
        networkRole: 'client',
        localSlotIndex: joined.slotIndices[0],
        localSlotIndices: [...joined.slotIndices],
        clientSession: session,
      });
      return;
    }

    this.screenObjects.forEach((object) => object.destroy());
    this.screenObjects = [];
    this.titleText.setText(joined.serverName.toUpperCase());

    const mine = new Set(joined.slotIndices);
    const iAmLeader = mine.has(lobby.leaderSlot);
    const rows = lobby.slots.map((slot) => {
      const tags = [
        mine.has(slot) ? 'YOU' : '',
        slot === lobby.leaderSlot ? 'LEADER' : '',
        lobby.heldSlots.includes(slot) ? 'RECONNECTING' : '',
      ].filter(Boolean);
      return `${PLAYER_LABELS[slot] ?? `PLAYER ${slot + 1}`}${tags.length ? `   [${tags.join(', ')}]` : ''}`;
    });
    const modeLabel = lobby.mode === 'cooperative' ? 'COOPERATIVE' : 'COMPETITIVE';
    this.bodyText.setPosition(ARENA_WIDTH / 2, 330).setText(
      [...(joined.motd ? [joined.motd, ''] : []), `${lobby.slots.length}/${lobby.maxPlayers} players   -   ${modeLabel}`, '', ...rows].join('\n'),
    );

    let y = 640;
    if (iAmLeader) {
      this.makeButton(ARENA_WIDTH / 2, y, `MODE: ${modeLabel}`, () =>
        session.sendCommand({
          type: 'debris-lobby-command',
          action: 'setMode',
          mode: lobby.mode === 'cooperative' ? 'competitive' : 'cooperative',
        }),
      );
      this.makeButton(ARENA_WIDTH / 2, y + 80, 'START', () =>
        session.sendCommand({ type: 'debris-lobby-command', action: 'start' }),
      );
      y += 160;
      this.noticeText.setPosition(ARENA_WIDTH / 2, y).setText(
        lobby.mode === 'competitive' && lobby.slots.length < 2 ? 'Competitive needs at least 2 players.' : 'You are the leader - start whenever everyone is in.',
      );
    } else {
      y += 20;
      this.noticeText.setPosition(ARENA_WIDTH / 2, y).setText('Waiting for the leader to start...');
    }
    this.makeButton(ARENA_WIDTH / 2, y + 90, 'LEAVE', () => {
      session.stop();
      this.session = undefined;
      this.cleanup();
      this.scene.restart();
    });
  }

  // ---------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------

  private showMessage(message: string): void {
    this.clearScreen();
    this.titleText.setText('ONLINE');
    this.bodyText.setPosition(ARENA_WIDTH / 2, 330).setText(message);
    this.makeButton(ARENA_WIDTH / 2, 560, 'BACK', () => this.scene.restart());
  }
}
