import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../config/GameConfig';
import { containScale } from '../utilities/ImageFit';

/**
 * First screen shown after load (docs/lore.md: "a single retro-style intro
 * screen before gameplay"). Full-bleed splash art, contain-scaled so
 * nothing is cropped even though the source art (16:9) doesn't match the
 * game canvas (3:2) - see ImageFit.ts. Any key or pointer press advances
 * to the main menu.
 */
export class SplashScene extends Phaser.Scene {
  constructor() {
    super('Splash');
  }

  create(): void {
    const background = this.add.image(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 'splashBackground');
    const scale = containScale(background.width, background.height, ARENA_WIDTH, ARENA_HEIGHT);
    background.setScale(scale);

    this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT - 28, 'Press any key', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown', () => this.scene.start('Menu'));
    this.input.once('pointerdown', () => this.scene.start('Menu'));
  }
}
