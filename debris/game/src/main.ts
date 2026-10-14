import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH, COLORS } from './config/GameConfig';
import { BootScene } from './scenes/BootScene';
import { DedicatedServerScene } from './scenes/DedicatedServerScene';
import { GameScene } from './scenes/GameScene';
import { HighScoreScene } from './scenes/HighScoreScene';
import { LanLobbyScene } from './scenes/LanLobbyScene';
import { MultiplayerScene } from './scenes/MultiplayerScene';
import { OnlineScene } from './scenes/OnlineScene';
import { MenuScene } from './scenes/MenuScene';
import { SplashScene } from './scenes/SplashScene';
import { isServerMode } from './systems/ServerBridge';
import { patchPhaserGamepadHoleBug } from './systems/PhaserGamepadPatch';
import { mountTuningPanel } from './systems/TuningPanel';

// Must run before the Game instance (and therefore any Scene's own
// GamepadPlugin) is created - see PhaserGamepadPatch.ts for the crash this
// works around.
patchPhaserGamepadHoleBug();

// Loaded by the dedicated server's hidden window (`debris/server`): no
// renderer, no audio, and timer-driven frames - a hidden window gets
// requestAnimationFrame paused/throttled, which would freeze the sim.
const serverMode = isServerMode();
// The e2e driver (`?e2e`) runs the real client in a hidden window too.
const e2eMode = new URLSearchParams(window.location.search).has('e2e');
// A hidden window is never "visible" or "focused", and launching any other
// program can blur it. Phaser's default is to pause its whole loop when the
// page is hidden or loses focus - fine for a player's tab, fatal for a server
// that must keep simulating (or a test that must keep rendering).
const headlessLike = serverMode || e2eMode;

const game = new Phaser.Game({
  type: serverMode ? Phaser.HEADLESS : Phaser.AUTO,
  ...(serverMode ? { audio: { noAudio: true } } : {}),
  ...(headlessLike ? { disableVisibilityChange: true, fps: { forceSetTimeOut: true, target: 60 } } : {}),
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
  scene: [BootScene, SplashScene, MenuScene, GameScene, HighScoreScene, LanLobbyScene, MultiplayerScene, OnlineScene, DedicatedServerScene],
});

// Test hook, inert unless the page is loaded with `?e2e` (same idea as the
// hash-gated `#debug` hook): lets `debris/server/tools/client-e2e-main.js`
// drive the real, built client against a real server.
if (e2eMode) {
  (window as unknown as { __debrisGame: Phaser.Game }).__debrisGame = game;
}

// Dev-only balance overlay for the v2 tuning pass - a no-op unless the
// page is loaded with `?tune=1`, so it can never appear in normal play.
// See systems/TuningPanel.ts, including its note about reviewing this
// before the 2.0.0 tag.
mountTuningPanel();
