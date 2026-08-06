import Phaser from 'phaser';
import { playLoopingMusic } from '../audio/MusicController';
import { ARENA_HEIGHT, ARENA_WIDTH, COLORS } from '../config/GameConfig';
import { MENU_MUSIC_KEY } from '../systems/MazeMusic';
import { containScale } from '../utilities/ImageFit';

interface MenuItem {
  label: string;
  enabled: boolean;
}

const QUIT_ITEMS = ['YES', 'NO'] as const;

/**
 * Menu item hit-zones as fractions of the background art's own dimensions
 * (not the canvas), so they track the art's "cover" placement below
 * regardless of final scale. Eyeballed against godspeed-mockup.png, which
 * already has these five rows drawn into the art itself - this only adds
 * the interactive/keyboard-navigable layer on top, it doesn't redraw the
 * labels. Positions are an approximation pending an in-browser check (no
 * screenshot tool is available in this environment to verify pixel
 * alignment against the actual art).
 */
const MENU_ITEMS: readonly MenuItem[] = [
  { label: 'NEW GAME', enabled: true },
  { label: 'CONTINUE', enabled: false },
  { label: 'SETTINGS', enabled: false },
  { label: 'CREDITS', enabled: false },
  { label: 'EXIT', enabled: false },
];

const ITEM_LEFT_FRAC = 0.052;
const ITEM_RIGHT_FRAC = 0.23;
const ITEM_HEIGHT_FRAC = 0.058;
const FIRST_ITEM_Y_FRAC = 0.466;
const ITEM_SPACING_FRAC = 0.074;

export class MenuScene extends Phaser.Scene {
  private selectedIndex = 0;
  private comingSoonText: Phaser.GameObjects.Text | undefined;
  private quitConfirmOpen = false;
  private quitIndex = 0;
  private quitTexts: Phaser.GameObjects.Text[] = [];
  private quitOverlayObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Menu');
  }

  create(): void {
    // Already playing if we arrived from Splash (or looping since before -
    // e.g. backed out of a game via the pause menu); only starts fresh if
    // nothing is currently going.
    playLoopingMusic(this, MENU_MUSIC_KEY);

    const background = this.add.image(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 'menuBackground');
    const scale = containScale(background.width, background.height, ARENA_WIDTH, ARENA_HEIGHT);
    background.setScale(scale);

    const displayWidth = background.width * scale;
    const displayHeight = background.height * scale;
    const offsetX = (ARENA_WIDTH - displayWidth) / 2;
    const offsetY = (ARENA_HEIGHT - displayHeight) / 2;

    const itemX = offsetX + ITEM_LEFT_FRAC * displayWidth;
    const itemWidth = (ITEM_RIGHT_FRAC - ITEM_LEFT_FRAC) * displayWidth;
    const itemHeight = ITEM_HEIGHT_FRAC * displayHeight;

    MENU_ITEMS.forEach((_item, index) => {
      const itemY = offsetY + (FIRST_ITEM_Y_FRAC + index * ITEM_SPACING_FRAC) * displayHeight;
      const zone = this.add
        .rectangle(itemX, itemY, itemWidth, itemHeight, 0x000000, 0)
        .setOrigin(0, 0.5);

      zone.setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this.select(index));
      zone.on('pointerdown', () => this.activate(index));
    });

    this.input.keyboard?.on('keydown-UP', () => {
      if (this.quitConfirmOpen) this.moveQuit(-1);
      else this.move(-1);
    });
    this.input.keyboard?.on('keydown-DOWN', () => {
      if (this.quitConfirmOpen) this.moveQuit(1);
      else this.move(1);
    });
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.quitConfirmOpen) this.activateQuit();
      else this.activate(this.selectedIndex);
    });
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.quitConfirmOpen) this.activateQuit();
      else this.activate(this.selectedIndex);
    });
    this.input.keyboard?.on('keydown-ESC', () => this.toggleQuitConfirm());
  }

  private move(delta: number): void {
    this.select((this.selectedIndex + delta + MENU_ITEMS.length) % MENU_ITEMS.length);
  }

  private select(index: number): void {
    this.selectedIndex = index;
  }

  private activate(index: number): void {
    const item = MENU_ITEMS[index];
    if (!item) return;

    if (item.label === 'NEW GAME') {
      this.scene.start('Game');
      return;
    }

    if (!item.enabled) {
      this.showComingSoon();
    }
  }

  private showComingSoon(): void {
    this.comingSoonText?.destroy();
    this.comingSoonText = this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT - 24, 'Coming soon', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.time.delayedCall(1200, () => {
      this.comingSoonText?.destroy();
      this.comingSoonText = undefined;
    });
  }

  private toggleQuitConfirm(): void {
    if (this.quitConfirmOpen) {
      this.closeQuitConfirm();
    } else {
      this.openQuitConfirm();
    }
  }

  private openQuitConfirm(): void {
    this.quitConfirmOpen = true;
    this.quitIndex = 0;

    const backdrop = this.add.rectangle(
      ARENA_WIDTH / 2,
      ARENA_HEIGHT / 2,
      ARENA_WIDTH,
      ARENA_HEIGHT,
      0x000000,
      0.75,
    );
    const title = this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 40, 'QUIT GAME?', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.quitTexts = QUIT_ITEMS.map((label, index) =>
      this.add
        .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2 + 10 + index * 36, label, {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => {
          this.quitIndex = index;
          this.refreshQuitHighlight();
        })
        .on('pointerdown', () => this.activateQuit()),
    );

    this.quitOverlayObjects = [backdrop, title, ...this.quitTexts];
    this.refreshQuitHighlight();
  }

  private closeQuitConfirm(): void {
    this.quitConfirmOpen = false;
    this.quitOverlayObjects.forEach((object) => object.destroy());
    this.quitOverlayObjects = [];
    this.quitTexts = [];
  }

  private refreshQuitHighlight(): void {
    const selectedColor = Phaser.Display.Color.IntegerToColor(COLORS.projectile).rgba;
    this.quitTexts.forEach((text, index) => {
      text.setColor(index === this.quitIndex ? selectedColor : '#ffffff');
    });
  }

  private moveQuit(delta: number): void {
    this.quitIndex = (this.quitIndex + delta + QUIT_ITEMS.length) % QUIT_ITEMS.length;
    this.refreshQuitHighlight();
  }

  private activateQuit(): void {
    if (QUIT_ITEMS[this.quitIndex] === 'YES') {
      // Absolute path: correct once deployed (portal always serves from
      // site root, Godspeed from /godspeed/ - see root DEPLOYMENT.md). In
      // Godspeed's own standalone Vite dev server this just reloads Boot,
      // since there's no portal running at "/" there.
      window.location.href = '/';
    } else {
      this.closeQuitConfirm();
    }
  }
}
