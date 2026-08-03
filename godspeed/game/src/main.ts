import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH, COLORS } from './config/GameConfig';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { SplashScene } from './scenes/SplashScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  backgroundColor: COLORS.background,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, SplashScene, MenuScene, GameScene],
});
