import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH, COLORS } from './config/GameConfig';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HighScoreScene } from './scenes/HighScoreScene';
import { MenuScene } from './scenes/MenuScene';
import { SplashScene } from './scenes/SplashScene';
import { patchPhaserGamepadHoleBug } from './systems/PhaserGamepadPatch';
import { mountTuningPanel } from './systems/TuningPanel';

// Must run before the Game instance (and therefore any Scene's own
// GamepadPlugin) is created - see PhaserGamepadPatch.ts for the crash this
// works around.
patchPhaserGamepadHoleBug();

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
  // Gamepad detection on the menu (docs/art_direction.md's player-status
  // cards) and, later, gamepad gameplay input (docs/controls.md) both need
  // this on - off by default in Phaser.
  input: {
    gamepad: true,
  },
  physics: {
    default: 'matter',
    matter: {
      // Top-down space, not a platformer - gravity is off, not tuned.
      // See docs/technical_design.md.
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, SplashScene, MenuScene, GameScene, HighScoreScene],
});

// Dev-only balance overlay for the v2 tuning pass - a no-op unless the
// page is loaded with `?tune=1`, so it can never appear in normal play.
// See systems/TuningPanel.ts, including its note about reviewing this
// before the 2.0.0 tag.
mountTuningPanel();
