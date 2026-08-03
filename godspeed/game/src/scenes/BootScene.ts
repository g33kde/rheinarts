import Phaser from 'phaser';
import menuBackgroundUrl from '../assets/godspeed-mockup.png';
import splashUrl from '../assets/godspeed-start-screen.png';
import wardenSheetUrl from '../assets/warden-sprite-sheet.png';
import { WARDEN_TEXTURE_KEY } from '../entities/WardenAnimations';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.image('splashBackground', splashUrl);
    this.load.image('menuBackground', menuBackgroundUrl);
    this.load.image(WARDEN_TEXTURE_KEY, wardenSheetUrl);
  }

  create(): void {
    this.scene.start('Splash');
  }
}
