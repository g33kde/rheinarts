import Phaser from 'phaser';
import { pauseSound, playLoopingSound, resumeSound, stopSound } from '../audio/LoopingSound';
import { ARENA_HEIGHT, ARENA_WIDTH, ASTEROID, COLORS, SHIELD, SHIP, UFO } from '../config/GameConfig';
import { PlayfieldBackground } from '../entities/Background';
import { Asteroid } from '../entities/Asteroid';
import { Projectile } from '../entities/Projectile';
import { Shield } from '../entities/Shield';
import { Ship } from '../entities/Ship';
import { Ufo } from '../entities/Ufo';
import { UfoShot } from '../entities/UfoShot';
import { KeyboardInput, P1_BINDINGS, P2_BINDINGS } from '../input/KeyboardInput';
import { canFire } from '../systems/CombatSystem';
import { nextAsteroidSize, splitHeading, type AsteroidSize } from '../systems/AsteroidSplit';
import { getMusicVolume, getSfxVolume } from '../systems/AudioSettings';
import { GAMEPLAY_MUSIC_KEY, MENU_MUSIC_KEY } from '../systems/Music';
import {
  ASTEROID_HIT_SFX_KEY,
  SHIELD_PICKUP_SFX_KEY,
  SHIP_DESTROYED_SFX_KEY,
  SHOT_SFX_KEY,
  THRUST_SFX_KEY,
} from '../systems/Sfx';
import { applyAimSpread, computeLeadAimHeading } from '../systems/UfoTargeting';
import type { Vector2 } from '../utilities/Vector2';

type SessionState = 'playing' | 'stageClear' | 'gameOver' | 'paused';

interface PlayerSlot {
  ship: Ship;
  input: KeyboardInput;
  lastFiredAtMs: number;
}

// P1/P2 spawn offset from center so they don't start overlapping.
const PLAYER_SPAWN_OFFSET_X = 150;

/**
 * Two keyboard ships (P1/P2 - see docs/controls.md; P3/P4 gamepad slots
 * are a separate roadmap item), a procedural asteroid field, shooting,
 * and split-on-hit - proving out the Matter-based movement and collision
 * architecture decided in docs/technical_design.md. Now also: a Shield
 * pickup, a UFO (periodic spawn, lead-the-target fire, destroyed by a
 * shot/asteroid/ship-ram), ship destruction on an unshielded hit, and a
 * stage-cleared/game-over pause-for-input flow.
 *
 * No lives/respawn system yet (a separate, bigger roadmap item) and no
 * Cooperative/Competitive mode logic either (`MenuScene`'s mode toggle
 * still isn't consumed here) - what's here is the closest thing to
 * Cooperative by default: both ships share the arena and the asteroid
 * field, projectiles only ever target asteroids (never the other ship -
 * "no friendly fire" falls out of `Projectile`'s own collision mask, not
 * a mode check), and the round only ends once *both* ships are
 * destroyed, not the first one.
 */
export class GameScene extends Phaser.Scene {
  private background!: PlayfieldBackground;
  private players: PlayerSlot[] = [];
  private asteroids: Asteroid[] = [];
  private projectiles: Projectile[] = [];
  private shields: Shield[] = [];
  private ufos: Ufo[] = [];
  private ufoShots: UfoShot[] = [];
  private lastShieldSpawnAtMs = -Infinity;
  private lastUfoSpawnAtMs = -Infinity;
  private score = 0;
  private scoreText!: Phaser.GameObjects.Text;
  // Shared engine sound - one thrust loop for however many ships are
  // currently thrusting, not a per-ship instance. Tracks the *aggregate*
  // press/release edge, not any single player's.
  private wasAnyThrusting = false;
  private state: SessionState = 'playing';
  private overlayTexts: Phaser.GameObjects.Text[] = [];
  private pauseMenuObjects: Phaser.GameObjects.GameObject[] = [];

  // Hits/pickups are queued here by the 'collisionstart' handler and only
  // actually destroy/spawn bodies in update(), never inside the handler
  // itself - Matter is still mid-step when that event fires, and adding/
  // removing bodies from the world while it's iterating its own collision
  // pairs is a real crash risk, not just a style preference.
  private pendingHits: { asteroid: Asteroid; projectile: Projectile }[] = [];
  private pendingShieldPickups: { ship: Ship; shield: Shield }[] = [];
  private pendingShipHits: Ship[] = [];
  private pendingUfoHits: { ufo: Ufo; projectile: Projectile | undefined; awardScore: boolean }[] = [];
  private pendingUfoShotHits: UfoShot[] = [];

  constructor() {
    super('Game');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.background = new PlayfieldBackground(this);
    stopSound(this, MENU_MUSIC_KEY);
    playLoopingSound(this, GAMEPLAY_MUSIC_KEY, getMusicVolume());

    // scene.restart() reuses this same instance (no fresh constructor
    // call), so every field a round can leave in a non-default state -
    // not just the arrays below - needs an explicit reset here now that
    // restart is an actual reachable path (game over -> press key).
    this.players = [
      {
        ship: new Ship(this, ARENA_WIDTH / 2 - PLAYER_SPAWN_OFFSET_X, ARENA_HEIGHT / 2, COLORS.players[0]),
        input: new KeyboardInput(P1_BINDINGS),
        lastFiredAtMs: -Infinity,
      },
      {
        ship: new Ship(this, ARENA_WIDTH / 2 + PLAYER_SPAWN_OFFSET_X, ARENA_HEIGHT / 2, COLORS.players[1]),
        input: new KeyboardInput(P2_BINDINGS),
        lastFiredAtMs: -Infinity,
      },
    ];

    this.asteroids = [];
    this.projectiles = [];
    this.shields = [];
    this.ufos = [];
    this.ufoShots = [];
    this.score = 0;
    this.state = 'playing';
    this.lastShieldSpawnAtMs = this.time.now;
    this.lastUfoSpawnAtMs = this.time.now;
    this.wasAnyThrusting = false;
    this.pendingHits = [];
    this.pendingShieldPickups = [];
    this.pendingShipHits = [];
    this.pendingUfoHits = [];
    this.pendingUfoShotHits = [];
    this.overlayTexts = [];
    this.pauseMenuObjects = [];
    this.spawnWave(ASTEROID.spawnCountPerWave);

    this.scoreText = this.add.text(12, 8, 'SCORE 0', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffffff',
    });

    this.matter.world.on('collisionstart', (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
      event.pairs.forEach((pair) => this.handleCollision(pair));
    });

    // Same Escape toggle as HyperOut: PLAYING <-> PAUSED. Persistent
    // listener (not `.once`), unlike stageClear/gameOver's "any key"
    // waitForKeyPress - Escape needs to keep working every time, not
    // just the first. No effect during stageClear/gameOver; those still
    // only respond to "any key" advancing them, same as before.
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.state === 'playing') this.enterPaused();
      else if (this.state === 'paused') this.exitPaused();
    });

    this.events.on('shutdown', () => {
      this.players.forEach((player) => player.input.destroy());
      stopSound(this, THRUST_SFX_KEY);
    });
  }

  update(_time: number, deltaMs: number): void {
    const deltaSeconds = deltaMs / 1000;
    const nowMs = this.time.now;

    this.processPendingHits();
    this.processPendingShieldPickups();
    this.processPendingShipHits();
    this.processPendingUfoHits();
    this.processPendingUfoShotHits();
    // Must happen before this frame's per-entity update() calls below, not
    // just before next frame - an entity destroyed above still has its
    // Matter body/Graphics destroyed *this* frame, so calling update() on
    // it before it's filtered out throws (Phaser GameObject methods on a
    // destroyed object). This was the real "crash when hitting a rock" bug.
    this.asteroids = this.asteroids.filter((asteroid) => asteroid.isAlive);
    this.projectiles = this.projectiles.filter((projectile) => projectile.isAlive);
    this.shields = this.shields.filter((shield) => shield.isAlive);
    this.ufos = this.ufos.filter((ufo) => ufo.isAlive);
    this.ufoShots = this.ufoShots.filter((shot) => shot.isAlive);

    this.background.update(deltaSeconds);

    if (this.state !== 'playing') return;

    this.players.forEach((player, ownerIndex) => {
      if (!player.ship.isAlive) return;

      const turn = player.input.turnDirection;
      if (turn !== 0) {
        player.ship.setRotation(player.ship.heading + turn * SHIP.turnRateRadPerSec * deltaSeconds);
      }
      player.ship.setThrusting(player.input.isThrusting);

      const ownProjectileCount = this.projectiles.filter((p) => p.ownerIndex === ownerIndex).length;
      if (
        player.input.isFiring &&
        ownProjectileCount < SHIP.maxOnScreenShots &&
        canFire(player.lastFiredAtMs, nowMs, SHIP.fireCooldownMs)
      ) {
        this.fireProjectile(player, ownerIndex, nowMs);
        player.lastFiredAtMs = nowMs;
      }

      player.ship.update(deltaSeconds, ARENA_WIDTH, ARENA_HEIGHT);
    });

    // One shared engine sound for however many ships are thrusting right
    // now, not a per-ship instance - see the `wasAnyThrusting` field doc.
    const isAnyThrusting = this.players.some((player) => player.ship.isAlive && player.input.isThrusting);
    if (isAnyThrusting && !this.wasAnyThrusting) {
      // stopSound first: sound.play() on an already-playing looping sound
      // just no-ops rather than restarting it, and "from the beginning
      // next acceleration" means a fresh press must always restart, even
      // if the previous release's stop somehow hasn't landed yet.
      stopSound(this, THRUST_SFX_KEY);
      playLoopingSound(this, THRUST_SFX_KEY, getSfxVolume());
    } else if (!isAnyThrusting && this.wasAnyThrusting) {
      stopSound(this, THRUST_SFX_KEY);
    }
    this.wasAnyThrusting = isAnyThrusting;

    this.asteroids.forEach((asteroid) => asteroid.update(deltaSeconds, ARENA_WIDTH, ARENA_HEIGHT));
    this.projectiles.forEach((projectile) => projectile.update(nowMs, ARENA_WIDTH, ARENA_HEIGHT));
    this.shields.forEach((shield) => shield.update(deltaSeconds, ARENA_WIDTH, ARENA_HEIGHT));
    this.updateUfos(deltaSeconds, nowMs);
    this.ufoShots.forEach((shot) => shot.update(nowMs, ARENA_WIDTH, ARENA_HEIGHT));

    this.asteroids = this.asteroids.filter((asteroid) => asteroid.isAlive);
    this.projectiles = this.projectiles.filter((projectile) => projectile.isAlive);
    this.shields = this.shields.filter((shield) => shield.isAlive);
    this.ufos = this.ufos.filter((ufo) => ufo.isAlive);
    this.ufoShots = this.ufoShots.filter((shot) => shot.isAlive);

    if (nowMs - this.lastShieldSpawnAtMs >= SHIELD.spawnIntervalMs) {
      this.spawnShield();
      this.lastShieldSpawnAtMs = nowMs;
    }

    if (nowMs - this.lastUfoSpawnAtMs >= UFO.spawnIntervalMs) {
      this.spawnUfo();
      this.lastUfoSpawnAtMs = nowMs;
    }

    if (this.asteroids.length === 0) {
      this.enterStageClear();
    }
  }

  /** Moves every UFO, then has each one fire independently if its own cooldown and a live target both allow it. */
  private updateUfos(deltaSeconds: number, nowMs: number): void {
    for (const ufo of this.ufos) {
      ufo.update(deltaSeconds, ARENA_WIDTH, ARENA_HEIGHT);

      const target = this.nearestAliveShip(ufo.position);
      if (!target || !ufo.canFire(nowMs)) continue;

      const lead = computeLeadAimHeading(ufo.position, target.ship.position, target.ship.velocity, UFO.shotSpeed);
      const heading = applyAimSpread(lead, UFO.aimSpreadRad);
      this.ufoShots.push(new UfoShot(this, ufo.position, heading, nowMs));
      ufo.recordFired(nowMs);
    }
  }

  private nearestAliveShip(fromPos: Vector2): PlayerSlot | undefined {
    let nearest: PlayerSlot | undefined;
    let nearestDistanceSq = Infinity;
    for (const player of this.players) {
      if (!player.ship.isAlive) continue;
      const dx = player.ship.position.x - fromPos.x;
      const dy = player.ship.position.y - fromPos.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < nearestDistanceSq) {
        nearestDistanceSq = distanceSq;
        nearest = player;
      }
    }
    return nearest;
  }

  private fireProjectile(player: PlayerSlot, ownerIndex: number, nowMs: number): void {
    this.sound.play(SHOT_SFX_KEY, { volume: getSfxVolume() });
    this.projectiles.push(
      new Projectile(this, player.ship.position, player.ship.heading, nowMs, player.ship.color, ownerIndex),
    );
  }

  private spawnWave(count: number): void {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = 300 + Math.random() * 500;
      const x = Phaser.Math.Wrap(ARENA_WIDTH / 2 + Math.cos(angle) * distance, 0, ARENA_WIDTH);
      const y = Phaser.Math.Wrap(ARENA_HEIGHT / 2 + Math.sin(angle) * distance, 0, ARENA_HEIGHT);
      const heading = Math.random() * Math.PI * 2;
      this.asteroids.push(new Asteroid(this, x, y, 'large', heading));
    }
  }

  private spawnShield(): void {
    const x = Math.random() * ARENA_WIDTH;
    const y = Math.random() * ARENA_HEIGHT;
    const heading = Math.random() * Math.PI * 2;
    this.shields.push(new Shield(this, x, y, heading));
  }

  /**
   * Enters from a random edge, heading broadly toward the opposite side
   * (±45° jitter off the cardinal direction, not a razor-straight line) -
   * per docs/gameplay.md. No cap on concurrent UFOs, decided: this fires
   * on its own timer regardless of whether an earlier UFO is still alive.
   */
  private spawnUfo(): void {
    const edge = Math.floor(Math.random() * 4);
    let x: number;
    let y: number;
    let baseHeadingRad: number;
    if (edge === 0) {
      x = -UFO.radius;
      y = Math.random() * ARENA_HEIGHT;
      baseHeadingRad = 0; // moving right
    } else if (edge === 1) {
      x = ARENA_WIDTH + UFO.radius;
      y = Math.random() * ARENA_HEIGHT;
      baseHeadingRad = Math.PI; // moving left
    } else if (edge === 2) {
      x = Math.random() * ARENA_WIDTH;
      y = -UFO.radius;
      baseHeadingRad = Math.PI / 2; // moving down
    } else {
      x = Math.random() * ARENA_WIDTH;
      y = ARENA_HEIGHT + UFO.radius;
      baseHeadingRad = -Math.PI / 2; // moving up
    }
    const heading = baseHeadingRad + (Math.random() * 2 - 1) * (Math.PI / 4);
    this.ufos.push(new Ufo(this, x, y, heading));
  }

  private handleCollision(pair: Phaser.Types.Physics.Matter.MatterCollisionPair): void {
    const entityA = this.entityOf(pair.bodyA);
    const entityB = this.entityOf(pair.bodyB);

    const projectile = entityA instanceof Projectile ? entityA : entityB instanceof Projectile ? entityB : undefined;
    const asteroid = entityA instanceof Asteroid ? entityA : entityB instanceof Asteroid ? entityB : undefined;
    const ship = entityA instanceof Ship ? entityA : entityB instanceof Ship ? entityB : undefined;
    const shield = entityA instanceof Shield ? entityA : entityB instanceof Shield ? entityB : undefined;
    const ufo = entityA instanceof Ufo ? entityA : entityB instanceof Ufo ? entityB : undefined;
    const ufoShot = entityA instanceof UfoShot ? entityA : entityB instanceof UfoShot ? entityB : undefined;

    if (projectile?.isAlive && asteroid?.isAlive) {
      // A projectile can touch two asteroids in the same physics step
      // (e.g. clipping the corner where a pair has already split apart) -
      // only queue it once so destroyAsteroid isn't asked to consume it
      // twice.
      if (!this.pendingHits.some((hit) => hit.projectile === projectile)) {
        this.pendingHits.push({ asteroid, projectile });
      }
      return;
    }

    if (projectile?.isAlive && ufo?.isAlive) {
      if (!this.pendingUfoHits.some((hit) => hit.ufo === ufo)) {
        this.pendingUfoHits.push({ ufo, projectile, awardScore: true });
      }
      return;
    }

    if (ufo?.isAlive && asteroid?.isAlive) {
      // Decided: the UFO "can be destroyed by... colliding with"
      // asteroids per docs/gameplay.md - the asteroid itself is
      // unaffected, no score (only a player's own shot scores).
      if (!this.pendingUfoHits.some((hit) => hit.ufo === ufo)) {
        this.pendingUfoHits.push({ ufo, projectile: undefined, awardScore: false });
      }
      return;
    }

    if (ufoShot?.isAlive && ship?.isAlive) {
      if (!this.pendingShipHits.includes(ship)) {
        this.pendingShipHits.push(ship);
      }
      if (!this.pendingUfoShotHits.includes(ufoShot)) {
        this.pendingUfoShotHits.push(ufoShot);
      }
      return;
    }

    if (ufo?.isAlive && ship?.isAlive) {
      // Decided: ramming a UFO destroys both, not just the ship (the
      // ship's own shield can still save the *ship* half of that, same
      // as an asteroid ram - the UFO dies either way).
      if (!this.pendingShipHits.includes(ship)) {
        this.pendingShipHits.push(ship);
      }
      if (!this.pendingUfoHits.some((hit) => hit.ufo === ufo)) {
        this.pendingUfoHits.push({ ufo, projectile: undefined, awardScore: false });
      }
      return;
    }

    if (ship?.isAlive && shield?.isAlive) {
      if (!this.pendingShieldPickups.some((pickup) => pickup.shield === shield)) {
        this.pendingShieldPickups.push({ ship, shield });
      }
      return;
    }

    if (ship?.isAlive && asteroid?.isAlive) {
      if (!this.pendingShipHits.includes(ship)) {
        this.pendingShipHits.push(ship);
      }
    }
  }

  private entityOf(body: MatterJS.BodyType): Asteroid | Projectile | Ship | Shield | Ufo | UfoShot | undefined {
    const gameObject = body.gameObject as Phaser.GameObjects.GameObject | undefined;
    return gameObject?.getData('entity') as Asteroid | Projectile | Ship | Shield | Ufo | UfoShot | undefined;
  }

  private processPendingHits(): void {
    if (this.pendingHits.length === 0) return;
    const hits = this.pendingHits;
    this.pendingHits = [];
    for (const { asteroid, projectile } of hits) {
      if (asteroid.isAlive && projectile.isAlive) {
        this.destroyAsteroid(asteroid, projectile);
      }
    }
  }

  private processPendingShieldPickups(): void {
    if (this.pendingShieldPickups.length === 0) return;
    const pickups = this.pendingShieldPickups;
    this.pendingShieldPickups = [];
    for (const { ship, shield } of pickups) {
      if (!shield.isAlive) continue;
      this.sound.play(SHIELD_PICKUP_SFX_KEY, { volume: getSfxVolume() });
      shield.destroy();
      if (ship.isAlive) ship.grantShield();
    }
  }

  /** Destroys individual ships as their hits come in; the round only ends once every ship is gone. */
  private processPendingShipHits(): void {
    if (this.pendingShipHits.length === 0) return;
    const hits = this.pendingShipHits;
    this.pendingShipHits = [];
    if (this.state !== 'playing') return;

    for (const ship of hits) {
      if (!ship.isAlive) continue;

      if (ship.hasShield) {
        ship.consumeShield();
        continue;
      }

      this.sound.play(SHIP_DESTROYED_SFX_KEY, { volume: getSfxVolume() });
      ship.destroy();
    }

    if (this.players.every((player) => !player.ship.isAlive)) {
      stopSound(this, THRUST_SFX_KEY);
      this.wasAnyThrusting = false;
      this.enterGameOver();
    }
  }

  /** A projectile-killed UFO scores; an asteroid- or ship-ram-killed one doesn't, but still explodes. */
  private processPendingUfoHits(): void {
    if (this.pendingUfoHits.length === 0) return;
    const hits = this.pendingUfoHits;
    this.pendingUfoHits = [];
    for (const { ufo, projectile, awardScore } of hits) {
      if (!ufo.isAlive) continue;
      projectile?.destroy();
      ufo.destroy();
      // No dedicated UFO-destruction SFX yet (docs/roadmap.md's one
      // remaining SFX gap) - reusing the ship's own explosion since a
      // downed UFO is a bigger deal than a regular asteroid.
      this.sound.play(SHIP_DESTROYED_SFX_KEY, { volume: getSfxVolume() });
      if (awardScore) {
        this.score += UFO.score;
        this.scoreText.setText(`SCORE ${this.score}`);
      }
    }
  }

  private processPendingUfoShotHits(): void {
    if (this.pendingUfoShotHits.length === 0) return;
    const shots = this.pendingUfoShotHits;
    this.pendingUfoShotHits = [];
    for (const shot of shots) {
      shot.destroy();
    }
  }

  private destroyAsteroid(asteroid: Asteroid, projectile: Projectile): void {
    this.sound.play(ASTEROID_HIT_SFX_KEY, { volume: getSfxVolume() });
    projectile.destroy();

    const position = asteroid.position;
    const parentHeading = asteroid.headingRad;
    const size = asteroid.size;
    asteroid.destroy();

    this.score += ASTEROID[size].score;
    this.scoreText.setText(`SCORE ${this.score}`);

    const childSize: AsteroidSize | null = nextAsteroidSize(size);
    if (childSize) {
      for (let i = 0; i < 2; i += 1) {
        const heading = splitHeading(parentHeading);
        this.asteroids.push(new Asteroid(this, position.x, position.y, childSize, heading));
      }
    }
  }

  private enterStageClear(): void {
    this.state = 'stageClear';
    this.matter.world.pause();
    this.showOverlay(['STAGE CLEARED', 'PRESS ANY KEY FOR NEXT LEVEL']);
    this.waitForKeyPress(() => this.beginNextLevel());
  }

  private beginNextLevel(): void {
    this.hideOverlay();
    this.state = 'playing';
    this.matter.world.resume();
    this.spawnWave(ASTEROID.spawnCountPerWave + ASTEROID.waveGrowthPerLevel);
  }

  private enterGameOver(): void {
    this.state = 'gameOver';
    this.matter.world.pause();
    this.showOverlay(['GAME OVER', 'PRESS ANY KEY TO RESTART']);
    this.waitForKeyPress(() => this.scene.restart());
  }

  /**
   * Escape during play - mirrors HyperOut's `pauseGame()`/`pauseMenu`
   * exactly (title + Continue/Restart/Main Menu, see hyperout/index.html),
   * skipping only its live music/SFX volume sliders - Debris doesn't have
   * a working volume system anywhere yet (the start screen's are inert
   * too), so real sliders here would be the one control on this screen
   * that's misleadingly functional.
   */
  private enterPaused(): void {
    this.state = 'paused';
    this.matter.world.pause();
    stopSound(this, THRUST_SFX_KEY); // mirrors HyperOut's muteEngines()
    this.wasAnyThrusting = false; // don't resume into a stuck thrust-sound state, mirrors its boostHeld reset
    pauseSound(this, GAMEPLAY_MUSIC_KEY);
    this.showPauseMenu();
  }

  private exitPaused(): void {
    this.hidePauseMenu();
    this.state = 'playing';
    this.matter.world.resume();
    resumeSound(this, GAMEPLAY_MUSIC_KEY);
  }

  private goToMainMenu(): void {
    stopSound(this, GAMEPLAY_MUSIC_KEY);
    stopSound(this, THRUST_SFX_KEY);
    this.scene.start('Menu');
  }

  private showPauseMenu(): void {
    const centerX = ARENA_WIDTH / 2;
    const centerY = ARENA_HEIGHT / 2;
    const backdrop = this.add.rectangle(centerX, centerY, ARENA_WIDTH, ARENA_HEIGHT, 0x05050a, 0.75);
    const title = this.add
      .text(centerX, centerY - 160, 'PAUSED', {
        fontFamily: 'monospace',
        fontSize: '64px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const continueButton = this.makeMenuButton(centerX, centerY - 20, 'CONTINUE', () => this.exitPaused());
    const restartButton = this.makeMenuButton(centerX, centerY + 60, 'RESTART', () => this.scene.restart());
    const mainMenuButton = this.makeMenuButton(centerX, centerY + 140, 'MAIN MENU', () => this.goToMainMenu());
    this.pauseMenuObjects = [
      backdrop,
      title,
      continueButton.bg,
      continueButton.text,
      restartButton.bg,
      restartButton.text,
      mainMenuButton.bg,
      mainMenuButton.text,
    ];
  }

  private hidePauseMenu(): void {
    this.pauseMenuObjects.forEach((object) => object.destroy());
    this.pauseMenuObjects = [];
  }

  /**
   * `Rectangle` + `Text`, not `Text`'s own `backgroundColor` - Phaser's
   * canvas-backed Text texture bleeds a dark fringe at its edges once the
   * game canvas is scaled (Phaser.Scale.FIT always scales it), which is
   * what the reported "black borders" on the menu's Start button actually
   * was. Same fix applied here since this button used the identical
   * pattern.
   */
  private makeMenuButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ): { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text } {
    const bg = this.add.rectangle(x, y, 280, 64, 0x14141c, 1).setStrokeStyle(2, COLORS.players[0], 1);
    const text = this.add
      .text(x, y, label, { fontFamily: 'monospace', fontSize: '26px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
    return { bg, text };
  }

  private waitForKeyPress(callback: () => void): void {
    this.input.keyboard?.once('keydown', callback);
    this.input.gamepad?.once('down', callback);
    this.input.once('pointerdown', callback);
  }

  private showOverlay(lines: string[]): void {
    const startY = ARENA_HEIGHT / 2 - ((lines.length - 1) * 24);
    this.overlayTexts = lines.map((line, i) =>
      this.add
        .text(ARENA_WIDTH / 2, startY + i * 48, line, {
          fontFamily: 'monospace',
          fontSize: i === 0 ? '48px' : '20px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    );
  }

  private hideOverlay(): void {
    this.overlayTexts.forEach((text) => text.destroy());
    this.overlayTexts = [];
  }
}
