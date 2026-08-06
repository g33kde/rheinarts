import Phaser from 'phaser';
import bossSheetUrl from '../assets/boss-sprite-sheet.png';
import menuBackgroundUrl from '../assets/godspeed-mockup.png';
import splashUrl from '../assets/godspeed-start-screen.png';
import powerupSheetUrl from '../assets/powerups-sprite-sheet.png';
import wardenSheetUrl from '../assets/warden-sprite-sheet.png';
import { BOSS_TEXTURE_KEY } from '../entities/BossAnimations';
import { POWERUP_TEXTURE_KEY } from '../entities/PowerupAnimations';
import { WARDEN_TEXTURE_KEY } from '../entities/WardenAnimations';
import {
  MAZE_MUSIC_FILES,
  MAZE_MUSIC_URL_PREFIX,
  MENU_MUSIC_KEY,
  MENU_MUSIC_URL,
  mazeTrackKey,
} from '../systems/MazeMusic';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.image('splashBackground', splashUrl);
    this.load.image('menuBackground', menuBackgroundUrl);
    this.load.image(WARDEN_TEXTURE_KEY, wardenSheetUrl);
    this.load.image(POWERUP_TEXTURE_KEY, powerupSheetUrl);
    this.load.image(BOSS_TEXTURE_KEY, bossSheetUrl);

    // Served from godspeed/music/ via vite.config.ts's publicDir - not an
    // ES import, so the base path has to be applied by hand.
    const base = import.meta.env.BASE_URL;
    this.load.audio(MENU_MUSIC_KEY, `${base}${MENU_MUSIC_URL}`);
    for (const file of MAZE_MUSIC_FILES) {
      this.load.audio(mazeTrackKey(file), `${base}${MAZE_MUSIC_URL_PREFIX}${file}`);
    }
  }

  create(): void {
    this.scene.start('Splash');
  }
}
