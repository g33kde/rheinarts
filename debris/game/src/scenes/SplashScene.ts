import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH, COLORS } from '../config/GameConfig';
import { playLoopingSound } from '../audio/LoopingSound';
import { getMusicVolume } from '../systems/AudioSettings';
import { MENU_MUSIC_KEY } from '../systems/Music';
import { toCssHex } from '../utilities/Color';

export const SPLASH_TEXTURE_KEY = 'splash';

const PROMPT_BLINK_MS = 600;

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
