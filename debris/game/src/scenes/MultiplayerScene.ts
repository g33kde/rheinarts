import Phaser from 'phaser';
import { ARENA_WIDTH, COLORS } from '../config/GameConfig';
import { resolveOnlineServerUrl } from '../systems/OnlineServerConfig';

/**
 * The "MULTIPLAYER" hub (docs/roadmap.md's "Windows + LAN multiplayer" -
 * online phase 2): one entry in the main menu, then LAN or ONLINE here.
 * LAN keeps the existing host/join flow in `LanLobbyScene` untouched.
 *
 * ONLINE is the join-only screen for the dedicated server
 * (`debris/server`, not built yet) - until that lands it shows which
 * server this build points at and says so, rather than offering a button
 * that cannot work. Same plain rectangles-and-text style as
 * `LanLobbyScene`; visual polish isn't this scene's job.
 */
export class MultiplayerScene extends Phaser.Scene {
  private titleText!: Phaser.GameObjects.Text;
  private bodyText!: Phaser.GameObjects.Text;
  private screenObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Multiplayer');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.titleText = this.add
      .text(ARENA_WIDTH / 2, 120, '', {
        fontFamily: 'monospace',
        fontSize: '36px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.bodyText = this.add
      .text(ARENA_WIDTH / 2, 230, '', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#c9c9d6',
        align: 'center',
      })
      .setOrigin(0.5);

    this.showHub();
  }

  private clearScreen(): void {
    this.screenObjects.forEach((object) => object.destroy());
    this.screenObjects = [];
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void): void {
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
  }

  private showHub(): void {
    this.clearScreen();
    this.titleText.setText('MULTIPLAYER');
    this.bodyText.setText('');
    this.makeButton(ARENA_WIDTH / 2, 420, 'LAN', () => this.scene.start('LanLobby'));
    this.makeButton(ARENA_WIDTH / 2, 510, 'ONLINE', () => this.showOnline());
    this.makeButton(ARENA_WIDTH / 2, 600, 'BACK', () => this.scene.start('Menu'));
  }

  private showOnline(): void {
    this.clearScreen();
    this.titleText.setText('ONLINE');
    this.bodyText.setText(
      `Server: ${resolveOnlineServerUrl()}\n\nOnline play is not available yet -\nthe dedicated server is still being built.`,
    );
    this.makeButton(ARENA_WIDTH / 2, 600, 'BACK', () => this.showHub());
  }
}
