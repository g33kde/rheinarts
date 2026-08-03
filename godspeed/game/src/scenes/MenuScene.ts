import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH, COLORS } from '../config/GameConfig';
import { containScale } from '../utilities/ImageFit';

interface MenuItem {
  label: string;
  enabled: boolean;
}

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
  private highlights: Phaser.GameObjects.Rectangle[] = [];
  private comingSoonText: Phaser.GameObjects.Text | undefined;

  constructor() {
    super('Menu');
  }

  create(): void {
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

    this.highlights = MENU_ITEMS.map((_item, index) => {
      const itemY = offsetY + (FIRST_ITEM_Y_FRAC + index * ITEM_SPACING_FRAC) * displayHeight;
      const zone = this.add
        .rectangle(itemX, itemY, itemWidth, itemHeight, 0x000000, 0)
        .setOrigin(0, 0.5)
        .setStrokeStyle(2, COLORS.projectile, 0);

      zone.setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => this.select(index));
      zone.on('pointerdown', () => this.activate(index));

      return zone;
    });

    this.refreshHighlight();

    this.input.keyboard?.on('keydown-UP', () => this.move(-1));
    this.input.keyboard?.on('keydown-DOWN', () => this.move(1));
    this.input.keyboard?.on('keydown-SPACE', () => this.activate(this.selectedIndex));
    this.input.keyboard?.on('keydown-ENTER', () => this.activate(this.selectedIndex));
  }

  private move(delta: number): void {
    this.select((this.selectedIndex + delta + MENU_ITEMS.length) % MENU_ITEMS.length);
  }

  private select(index: number): void {
    this.selectedIndex = index;
    this.refreshHighlight();
  }

  private refreshHighlight(): void {
    this.highlights.forEach((zone, index) => {
      zone.setStrokeStyle(2, COLORS.projectile, index === this.selectedIndex ? 1 : 0);
    });
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
}
