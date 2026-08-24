import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH, COLORS } from '../config/GameConfig';
import { playLoopingSound } from '../audio/LoopingSound';
import { getMusicVolume } from '../systems/AudioSettings';
import { MENU_MUSIC_KEY } from '../systems/Music';
import { toCssHex } from '../utilities/Color';

export const SPLASH_TEXTURE_KEY = 'splash';
export const RHEIN_ARTS_LOGO_TEXTURE_KEY = 'rheinArtsLogo';

const PROMPT_BLINK_MS = 600;

// Matches HyperOut's own `.splash-credit`/`.splash-logo` exactly
// (hyperout/style.css): right:12%, bottom:2.5%, width:15% - all relative
// to the splash art's own box, not the raw viewport. In Debris that box
// is the full ARENA_WIDTH x ARENA_HEIGHT canvas, since the splash image
// below is cover-scaled to fill it edge to edge.
const LOGO_RIGHT_INSET_FRACTION = 0.12;
const LOGO_BOTTOM_INSET_FRACTION = 0.025;
const LOGO_WIDTH_FRACTION = 0.15;
const LOGO_OPACITY = 0.95;

/**
 * First thing the player sees: the user-provided splash art, full-bleed,
 * with a blinking "PRESS ANY KEY" prompt - any keyboard key or gamepad
 * button moves on to the Menu. Menu music starts here rather than in the
 * Menu scene itself, since this is the true first "menu-adjacent" moment;
 * `playLoopingSound`'s idempotent isPlaying check means Menu re-entering
 * (e.g. Game -> Menu later) won't restart it either.
 */
export class SplashScene extends Phaser.Scene {
  private prompt!: Phaser.GameObjects.Text;
  private advancing = false;

  constructor() {
    super('Splash');
  }

  create(): void {
    playLoopingSound(this, MENU_MUSIC_KEY, getMusicVolume());

    const image = this.add.image(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, SPLASH_TEXTURE_KEY);
    const cover = Math.max(ARENA_WIDTH / image.width, ARENA_HEIGHT / image.height);
    image.setScale(cover);

    // Bottom-right watermark, pinned to the splash art's box - not
    // interactive (Phaser images are non-interactive unless
    // setInteractive() is called, so this is already the "pointer-events:
    // none" equivalent HyperOut's version has explicitly).
    const logo = this.add.image(0, 0, RHEIN_ARTS_LOGO_TEXTURE_KEY).setOrigin(1, 1).setAlpha(LOGO_OPACITY);
    logo.setScale((ARENA_WIDTH * LOGO_WIDTH_FRACTION) / logo.width);
    logo.setPosition(
      ARENA_WIDTH - ARENA_WIDTH * LOGO_RIGHT_INSET_FRACTION,
      ARENA_HEIGHT - ARENA_HEIGHT * LOGO_BOTTOM_INSET_FRACTION,
    );

    const glow = toCssHex(COLORS.players[0]);
    this.prompt = this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT - 48, 'PRESS ANY KEY', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#ffffff',
        stroke: glow,
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setShadow(0, 0, glow, 12, true, true);

    this.tweens.add({
      targets: this.prompt,
      alpha: { from: 1, to: 0.15 },
      duration: PROMPT_BLINK_MS,
      yoyo: true,
      repeat: -1,
    });

    this.input.keyboard?.once('keydown', () => this.advanceToMenu());
    this.input.gamepad?.once('down', () => this.advanceToMenu());
    this.input.once('pointerdown', () => this.advanceToMenu());
  }

  private advanceToMenu(): void {
    if (this.advancing) return;
    this.advancing = true;
    this.scene.start('Menu');
  }
}
