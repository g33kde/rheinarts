import Phaser from 'phaser';
import driveUrl from '../assets/drive.wav';
import earthUrl from '../assets/earth.jpg';
import explosion1Url from '../assets/explosion1.wav';
import explosion2Url from '../assets/explosion2.wav';
import jupiterUrl from '../assets/jupiter.jpg';
import laser2Url from '../assets/laser2.wav';
import rheinArtsLogoUrl from '../assets/rhein-arts.png';
import shieldUpUrl from '../assets/shield-up.wav';
import splashUrl from '../assets/splash.png';
import { EARTH_TEXTURE_KEY, JUPITER_TEXTURE_KEY } from '../entities/Background';
import { GAMEPLAY_MUSIC_KEY, GAMEPLAY_MUSIC_URL, MENU_MUSIC_KEY, MENU_MUSIC_URL } from '../systems/Music';
import {
  ASTEROID_HIT_SFX_KEY,
  SHIELD_PICKUP_SFX_KEY,
  SHIP_DESTROYED_SFX_KEY,
  SHOT_SFX_KEY,
  THRUST_SFX_KEY,
} from '../systems/Sfx';
import { RHEIN_ARTS_LOGO_TEXTURE_KEY, SPLASH_TEXTURE_KEY } from './SplashScene';

/**
 * Every in-game visual (ship, asteroids, projectiles) is still vector-
 * drawn/procedural, not an image asset - the splash screen is the first
 * real image in the project. Kept as its own scene anyway, matching
 * Godspeed's Boot->Splash->... structure.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.image(SPLASH_TEXTURE_KEY, splashUrl);
    this.load.image(EARTH_TEXTURE_KEY, earthUrl);
    this.load.image(JUPITER_TEXTURE_KEY, jupiterUrl);
    this.load.image(RHEIN_ARTS_LOGO_TEXTURE_KEY, rheinArtsLogoUrl);
    this.load.audio(SHOT_SFX_KEY, laser2Url);
    this.load.audio(ASTEROID_HIT_SFX_KEY, explosion1Url);
    this.load.audio(THRUST_SFX_KEY, driveUrl);
    this.load.audio(SHIP_DESTROYED_SFX_KEY, explosion2Url);
    this.load.audio(SHIELD_PICKUP_SFX_KEY, shieldUpUrl);

    // Served from debris/music/ via vite.config.ts's publicDir - not an
    // ES import, so the base path has to be applied by hand.
    const base = import.meta.env.BASE_URL;
    this.load.audio(MENU_MUSIC_KEY, `${base}${MENU_MUSIC_URL}`);
    this.load.audio(GAMEPLAY_MUSIC_KEY, `${base}${GAMEPLAY_MUSIC_URL}`);
  }

  create(): void {
    this.scene.start('Splash');
  }
}
