import Phaser from 'phaser';
import { DedicatedServer } from '../systems/DedicatedServer';

const REGISTRY_KEY = 'dedicatedServer';

/**
 * The dedicated server's entry scene (docs/roadmap.md's "Windows + LAN
 * multiplayer" - online phase 4). `BootScene` hands over here instead of
 * the splash screen when the page was loaded with `?server=1`
 * (`ServerBridge.ts`'s `isServerMode`), and a finished match returns here.
 *
 * It draws nothing and decides nothing - the rules live in
 * `DedicatedLobby`, the connection handling in `DedicatedServer`. This
 * scene only owns the one `DedicatedServer` for the process (kept in the
 * game registry, because connections must survive the Game <-> lobby scene
 * switches) and starts/stops `GameScene` on its behalf.
 */
export class DedicatedServerScene extends Phaser.Scene {
  constructor() {
    super('DedicatedServer');
  }

  create(): void {
    const existing = this.registry.get(REGISTRY_KEY) as DedicatedServer | undefined;
    if (existing) {
      existing.resume();
      return;
    }

    const bridge = window.debrisServer;
    if (!bridge) {
      console.error('DedicatedServerScene started without window.debrisServer - not running under the server shell.');
      return;
    }

    void bridge.getConfig().then((config) => {
      const server = new DedicatedServer(config, {
        log: bridge.log,
        setStatus: bridge.setStatus,
        startMatch: (start) => this.scene.start('Game', start),
        // Through GameScene's own scene plugin, not this one's: only the
        // caller's plugin stops the caller, and it is GameScene that must stop.
        returnToLobby: () => this.scene.get('Game').scene.start('DedicatedServer'),
      });
      this.registry.set(REGISTRY_KEY, server);
      server.start();
      bridge.ready();
    });
  }
}
