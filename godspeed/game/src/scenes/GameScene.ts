import Phaser from 'phaser';
import { nextStepAway, nextStepToward } from '../ai/ChaseBehavior';
import { computeDistanceField, hasClearCorridor, type Cell } from '../ai/Pathfinding';
import { pauseMusic, playLoopingMusic, resumeMusic, stopMusic } from '../audio/MusicController';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  BIOMES,
  BOSS,
  BULWARK,
  COLORS,
  ENEMY,
  MAZE,
  PICKUP,
  PLAYER,
  PROJECTILE,
  SEEKER,
  SKIRMISHER,
} from '../config/GameConfig';
import { Boss } from '../entities/Boss';
import { Bulwark } from '../entities/Bulwark';
import { Drone } from '../entities/Drone';
import { Enemy } from '../entities/Enemy';
import { createEnemy } from '../entities/EnemyFactory';
import { MazeView } from '../entities/MazeView';
import { Pickup } from '../entities/Pickup';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { Seeker } from '../entities/Seeker';
import { Sentinel } from '../entities/Sentinel';
import { Skirmisher } from '../entities/Skirmisher';
import { selectBiome } from '../systems/BiomeSelection';
import { canFire, projectileVelocity } from '../systems/CombatSystem';
import { circleIntersectsAnyRect, circlesIntersect, hasLineOfSight } from '../systems/CollisionSystem';
import { difficultyForFloor, type FloorDifficulty } from '../systems/FloorDifficulty';
import { pickupTypesForFloor } from '../systems/FloorPickups';
import { enemyRosterForFloor } from '../systems/FloorRoster';
import { applyHit, grantExtraLife, isGameOver, isInvulnerable } from '../systems/HealthSystem';
import { InputSystem } from '../systems/InputSystem';
import { MENU_MUSIC_KEY, mazeTrackForFloor } from '../systems/MazeMusic';
import { chooseSpawnCells } from '../systems/PickupPlacement';
import {
  bonusStartingLives,
  loadProgression,
  recordMazeCleared,
  saveProgression,
  type ProgressionState,
} from '../systems/ProgressionStorage';
import {
  applyUpgrade,
  consumeShieldCharge,
  defaultUpgradeState,
  hasShieldCharge,
  type UpgradeState,
} from '../systems/UpgradeSystem';
import { HUD } from '../ui/HUD';
import type { Rect } from '../utilities/Rect';
import { rotate, type Vector2 } from '../utilities/Vector2';

const ENEMY_SPAWN_CELLS: Cell[] = [
  { row: 0, col: 0 },
  { row: 0, col: MAZE.cols - 1 },
  { row: MAZE.rows - 1, col: 0 },
  { row: MAZE.rows - 1, col: MAZE.cols - 1 },
];

// Emergency fallback if chooseSpawnCells somehow returns nothing (it can't,
// on any maze bigger than one cell, but noUncheckedIndexedAccess still
// needs a value to fall back to) - see spawnBoss().
const BOSS_SPAWN_CELL: Cell = ENEMY_SPAWN_CELLS[0]!;

const PAUSE_ITEMS = ['CONTINUE', 'RESTART', 'MAIN MENU'] as const;

type RunState = 'playing' | 'paused' | 'gameover' | 'victory';

interface RunData {
  floor?: number;
  lives?: number;
  upgrades?: UpgradeState;
}

export class GameScene extends Phaser.Scene {
  private maze!: MazeView;
  private player!: Player;
  private input$!: InputSystem;
  private hud!: HUD;
  private wallRects: Rect[] = [];
  private spawnPoint!: Vector2;
  private projectiles: Projectile[] = [];
  private enemies: Enemy[] = [];
  private boss: Boss | undefined;
  /** Boss's aimed shots plus Skirmishers' sniper shots - anything ranged that damages the player. */
  private enemyProjectiles: Projectile[] = [];
  private pickups: Pickup[] = [];
  private upgrades: UpgradeState = defaultUpgradeState();
  private progression: ProgressionState = { mazesCleared: 0 };
  private difficulty: FloorDifficulty = difficultyForFloor(1);
  private floor = 1;
  private lastFiredAtMs = 0;
  private lastPathUpdateAtMs = 0;
  private lastSeekerPathUpdateAtMs = 0;
  private lastHitAtMs = -Infinity;
  private lives: number = PLAYER.lives;
  private state: RunState = 'playing';
  private currentMazeTrackKey: string | undefined;
  private pauseTexts: Phaser.GameObjects.Text[] = [];
  private pauseOverlayObjects: Phaser.GameObjects.GameObject[] = [];
  private pauseIndex = 0;

  constructor() {
    super('Game');
  }

  create(data?: RunData): void {
    this.floor = data?.floor ?? 1;
    const continuingRun = this.floor > 1;
    this.difficulty = difficultyForFloor(this.floor);

    this.progression = loadProgression(localStorage);
    const biome = selectBiome(this.floor - 1, BIOMES);

    this.cameras.main.setBackgroundColor(biome.background);

    this.maze = new MazeView(this, ARENA_WIDTH, ARENA_HEIGHT, Math.random, biome.wall);
    this.wallRects = this.maze.wallRects;

    const centerCell: Cell = { row: Math.floor(MAZE.rows / 2), col: Math.floor(MAZE.cols / 2) };
    this.spawnPoint = this.maze.cellCenter(centerCell.row, centerCell.col);
    this.player = new Player(this, this.spawnPoint.x, this.spawnPoint.y);
    this.input$ = new InputSystem(this);
    this.hud = new HUD(this);

    if (continuingRun) {
      this.lives = data?.lives ?? PLAYER.lives;
      this.upgrades = data?.upgrades ?? defaultUpgradeState();
    } else {
      this.lives = PLAYER.lives + bonusStartingLives(this.progression);
      this.upgrades = defaultUpgradeState();
    }

    this.lastHitAtMs = -Infinity;
    this.state = 'playing';
    this.boss = undefined;
    this.enemyProjectiles = [];
    this.pauseTexts = [];
    this.pauseOverlayObjects = [];
    this.pauseIndex = 0;

    this.input.keyboard?.on('keydown-ESC', () => this.togglePause());
    this.input.keyboard?.on('keydown-UP', () => {
      if (this.state === 'paused') this.movePause(-1);
    });
    this.input.keyboard?.on('keydown-DOWN', () => {
      if (this.state === 'paused') this.movePause(1);
    });
    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.state === 'paused') this.activatePause();
    });
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (this.state === 'paused') this.activatePause();
    });

    this.showBiomeIntro(`Floor ${this.floor} — ${biome.name}`);

    const roster = enemyRosterForFloor(this.floor);
    const enemyCells = ENEMY_SPAWN_CELLS.slice(0, roster.length);
    this.enemies = roster.map((type, index) => {
      const cell = enemyCells[index]!;
      return createEnemy(
        this,
        type,
        cell,
        this.maze.cellCenter(cell.row, cell.col),
        this.difficulty.enemySpeedMultiplier,
      );
    });

    const pickupCells = chooseSpawnCells(
      MAZE.rows,
      MAZE.cols,
      [centerCell, ...enemyCells],
      PICKUP.count,
    );
    const pickupTypes = pickupTypesForFloor(this.floor);
    this.pickups = pickupCells.map(
      (cell, index) =>
        new Pickup(this, this.maze.cellCenter(cell.row, cell.col), pickupTypes[index]!),
    );

    stopMusic(this, MENU_MUSIC_KEY);
    this.syncMazeMusic();
  }

  /** Starts this floor's track unless it's already the one playing (floor ->
   * floor with the same track, or a pause-menu Restart) - see docs request:
   * stage music only stops on death, otherwise keeps going uninterrupted. */
  private syncMazeMusic(): void {
    const trackKey = mazeTrackForFloor(this.floor);
    if (this.currentMazeTrackKey && this.currentMazeTrackKey !== trackKey) {
      stopMusic(this, this.currentMazeTrackKey);
    }
    this.currentMazeTrackKey = trackKey;
    playLoopingMusic(this, trackKey);
  }

  /** Regular enemies plus the boss (if spawned) - for movement/collision only. */
  private get activeChasers(): Enemy[] {
    return this.boss ? [...this.enemies, this.boss] : this.enemies;
  }

  update(_time: number, deltaMs: number): void {
    if (this.state !== 'playing') return;

    const deltaSeconds = deltaMs / 1000;
    const nowMs = this.time.now;

    this.player.move(
      this.input$.moveDirection,
      deltaSeconds,
      this.wallRects,
      this.upgrades.speedMultiplier,
    );

    const fireCooldownMs = PROJECTILE.fireCooldownMs * this.upgrades.fireCooldownMultiplier;
    if (this.input$.isFiring && canFire(this.lastFiredAtMs, nowMs, fireCooldownMs)) {
      this.fireProjectile(nowMs);
      this.lastFiredAtMs = nowMs;
    }

    for (const projectile of this.projectiles) {
      projectile.update(deltaSeconds, nowMs);
      if (circleIntersectsAnyRect(projectile.position, PROJECTILE.radius, this.wallRects)) {
        projectile.destroy();
      }
    }
    for (const projectile of this.enemyProjectiles) {
      projectile.update(deltaSeconds, nowMs);
      if (circleIntersectsAnyRect(projectile.position, PROJECTILE.radius, this.wallRects)) {
        projectile.destroy();
      }
    }

    this.updateEnemies(nowMs, deltaSeconds);
    this.updateBossAttack(nowMs);
    this.updateSkirmisherAttacks(nowMs);
    this.resolveProjectileEnemyHits();
    this.resolvePlayerContact(nowMs);
    this.resolvePickups();

    this.projectiles = this.projectiles.filter((projectile) => projectile.isAlive);
    this.enemyProjectiles = this.enemyProjectiles.filter((projectile) => projectile.isAlive);
    this.enemies = this.enemies.filter((enemy) => enemy.isAlive);
    this.pickups = this.pickups.filter((pickup) => pickup.isAlive);

    if (this.state === 'playing') {
      if (this.enemies.length === 0 && !this.boss) {
        this.spawnBoss();
      } else if (this.boss && !this.boss.isAlive) {
        this.enterFloorCleared();
      }
    }

    this.hud.update({
      floor: this.floor,
      lives: this.lives,
      shieldCharges: this.upgrades.shieldCharges,
      enemiesRemaining: this.enemies.length,
      bossHitsRemaining: this.boss?.hitsRemaining ?? null,
    });
  }

  private updateEnemies(nowMs: number, deltaSeconds: number): void {
    const chasers = this.activeChasers;
    const playerCell = this.maze.cellFromPosition(this.player.position);

    for (const chaser of chasers) {
      if (chaser instanceof Sentinel) {
        chaser.updateAlertness(this.player.position, nowMs);
      }
    }

    if (nowMs - this.lastPathUpdateAtMs >= ENEMY.pathUpdateIntervalMs) {
      this.lastPathUpdateAtMs = nowMs;
      const distanceField = computeDistanceField(this.maze.maze, playerCell);

      for (const chaser of chasers) {
        this.updateSpeedBoost(chaser, playerCell);
      }

      for (const chaser of chasers) {
        if (chaser instanceof Seeker) continue; // retargeted on its own faster cadence below
        if (chaser instanceof Sentinel && !chaser.isActive) continue;
        if (!chaser.hasArrived) continue;

        const next = this.chooseNextStep(chaser, distanceField);
        if (next) {
          chaser.setTarget(next, this.maze.cellCenter(next.row, next.col));
        }
      }
    }

    if (nowMs - this.lastSeekerPathUpdateAtMs >= SEEKER.pathUpdateIntervalMs) {
      this.lastSeekerPathUpdateAtMs = nowMs;
      const seekerField = computeDistanceField(this.maze.maze, playerCell);

      for (const chaser of chasers) {
        if (!(chaser instanceof Seeker) || !chaser.hasArrived) continue;
        const next = nextStepToward(this.maze.maze, chaser.cell, seekerField);
        if (next) {
          chaser.setTarget(next, this.maze.cellCenter(next.row, next.col));
        }
      }
    }

    for (const chaser of chasers) {
      chaser.update(deltaSeconds);
    }
  }

  private chooseNextStep(chaser: Enemy, distanceField: number[][]): Cell | null {
    if (chaser instanceof Skirmisher && chaser.shouldFlee(this.player.position)) {
      return nextStepAway(this.maze.maze, chaser.cell, distanceField);
    }
    return nextStepToward(this.maze.maze, chaser.cell, distanceField);
  }

  /** Drives Drone's "lunge" and Bulwark's "charge": a brief speed-up when
   * there's a clear straight corridor to the player at least the type's
   * required minimum length - see ai/Pathfinding.ts's hasClearCorridor. */
  private updateSpeedBoost(chaser: Enemy, playerCell: Cell): void {
    if (chaser instanceof Drone) {
      const boosted = this.hasChargeCorridor(chaser.cell, playerCell, ENEMY.lungeMinCells);
      chaser.setSpeedBoost(boosted ? ENEMY.lungeSpeedMultiplier : 1);
    } else if (chaser instanceof Bulwark) {
      const boosted = this.hasChargeCorridor(chaser.cell, playerCell, BULWARK.chargeMinCells);
      chaser.setSpeedBoost(boosted ? BULWARK.chargeSpeedMultiplier : 1);
    }
  }

  private hasChargeCorridor(from: Cell, to: Cell, minCells: number): boolean {
    const cellDistance = Math.abs(from.row - to.row) + Math.abs(from.col - to.col);
    return cellDistance >= minCells && hasClearCorridor(this.maze.maze, from, to);
  }

  /** Skirmishers fire a fast "sniper" shot the moment they have a clear
   * line of sight to the player and their cooldown is ready - independent
   * of whether they're currently fleeing or chasing (see shouldFlee/
   * chooseNextStep for that separate movement decision). A real pixel-space
   * raycast against the wall rects, not the maze cell grid - hasClearCorridor
   * requires exact row/column alignment, which was so rare in practice it
   * read as "never fires"; line of sight works at any angle. */
  private updateSkirmisherAttacks(nowMs: number): void {
    for (const chaser of this.enemies) {
      if (!(chaser instanceof Skirmisher) || !chaser.isAlive) continue;
      if (!chaser.canFireSniper(nowMs)) continue;
      if (!hasLineOfSight(chaser.position, this.player.position, this.wallRects)) continue;

      const aim = {
        x: this.player.position.x - chaser.position.x,
        y: this.player.position.y - chaser.position.y,
      };
      const velocity = projectileVelocity(aim, SKIRMISHER.sniperSpeed);
      this.enemyProjectiles.push(
        new Projectile(this, chaser.position, velocity, nowMs, COLORS.skirmisherBeam),
      );
      chaser.recordSniperFired(nowMs);
    }
  }

  /** One aimed shot normally; past BOSS.phaseTwoHpFraction remaining HP, a
   * spread of BOSS.phaseTwoShotCount shots instead (see Boss.isPhaseTwo -
   * canAttack() there also fires faster in phase two). */
  private updateBossAttack(nowMs: number): void {
    if (!this.boss?.isAlive || !this.boss.canAttack(nowMs)) return;

    const aim = {
      x: this.player.position.x - this.boss.position.x,
      y: this.player.position.y - this.boss.position.y,
    };
    const shotCount = this.boss.isPhaseTwo ? BOSS.phaseTwoShotCount : 1;
    const spreadStep = (BOSS.phaseTwoSpreadDegrees * Math.PI) / 180;
    const centerIndex = (shotCount - 1) / 2;

    for (let i = 0; i < shotCount; i += 1) {
      const angle = (i - centerIndex) * spreadStep;
      const velocity = projectileVelocity(rotate(aim, angle), PROJECTILE.speed);
      this.enemyProjectiles.push(
        new Projectile(this, this.boss.position, velocity, nowMs, COLORS.danger),
      );
    }
    this.boss.recordAttack(nowMs);
    this.boss.playAttack();
  }

  private resolveProjectileEnemyHits(): void {
    for (const projectile of this.projectiles) {
      if (!projectile.isAlive) continue;
      for (const chaser of this.activeChasers) {
        if (!chaser.isAlive) continue;
        if (
          circlesIntersect(projectile.position, PROJECTILE.radius, chaser.position, chaser.radius)
        ) {
          projectile.destroy();
          chaser.takeHit();
        }
      }
    }
  }

  private resolvePlayerContact(nowMs: number): void {
    if (isInvulnerable(this.lastHitAtMs, nowMs, PLAYER.invulnerabilityMs)) return;

    const touchedByChaser = this.activeChasers.some(
      (chaser) =>
        chaser.isAlive &&
        circlesIntersect(this.player.position, PLAYER.radius, chaser.position, chaser.radius),
    );
    const hitByEnemyProjectile = this.enemyProjectiles.find(
      (projectile) =>
        projectile.isAlive &&
        circlesIntersect(
          this.player.position,
          PLAYER.radius,
          projectile.position,
          PROJECTILE.radius,
        ),
    );

    if (!touchedByChaser && !hitByEnemyProjectile) return;

    hitByEnemyProjectile?.destroy();
    this.lastHitAtMs = nowMs;

    if (hasShieldCharge(this.upgrades)) {
      this.upgrades = consumeShieldCharge(this.upgrades);
      return;
    }

    this.lives = applyHit(this.lives);
    this.player.teleportTo(this.spawnPoint);

    if (isGameOver(this.lives)) {
      this.player.playDie();
      this.enterGameOver();
    } else {
      this.player.playHurt();
    }
  }

  private resolvePickups(): void {
    for (const pickup of this.pickups) {
      if (!pickup.isAlive) continue;
      if (!circlesIntersect(this.player.position, PLAYER.radius, pickup.position, PICKUP.radius))
        continue;

      if (pickup.type === 'extraLife') {
        this.lives = grantExtraLife(this.lives);
      } else {
        this.upgrades = applyUpgrade(this.upgrades, pickup.type);
      }
      pickup.destroy();
    }
  }

  private fireProjectile(nowMs: number): void {
    const velocity = projectileVelocity(this.input$.aimDirection, PROJECTILE.speed);
    this.projectiles.push(new Projectile(this, this.player.position, velocity, nowMs));
    this.player.playShoot();
  }

  private showBiomeIntro(label: string): void {
    const intro = this.add
      .text(ARENA_WIDTH / 2, 32, label.toUpperCase(), {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.time.delayedCall(1800, () => intro.destroy());
  }

  private spawnBoss(): void {
    const playerCell = this.maze.cellFromPosition(this.player.position);
    const [randomCell] = chooseSpawnCells(MAZE.rows, MAZE.cols, [playerCell], 1);
    const spawnCell = randomCell ?? BOSS_SPAWN_CELL;

    this.boss = new Boss(
      this,
      spawnCell,
      this.maze.cellCenter(spawnCell.row, spawnCell.col),
      this.difficulty.bossMaxHits,
      this.difficulty.bossAttackCooldownMs,
    );
    this.playBossEntranceEffect();

    const intro = this.add
      .text(ARENA_WIDTH / 2, 32, 'THE GUARDIAN AWAKENS', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: Phaser.Display.Color.IntegerToColor(COLORS.danger).rgba,
      })
      .setOrigin(0.5);
    this.time.delayedCall(1800, () => intro.destroy());
  }

  /** Lightning-flicker (white/gold/white) plus a screen shake, built entirely from Phaser's
   * camera FX - no extra assets needed. */
  private playBossEntranceEffect(): void {
    const camera = this.cameras.main;
    camera.shake(500, 0.015);
    camera.flash(120, 255, 255, 255);
    this.time.delayedCall(160, () => camera.flash(100, 255, 215, 0));
    this.time.delayedCall(320, () => camera.flash(140, 255, 255, 255));
  }

  private enterGameOver(): void {
    this.state = 'gameover';
    stopMusic(this, this.currentMazeTrackKey);
    this.showEndScreen('GAME OVER', COLORS.danger, () => this.scene.start('Menu'), true);
  }

  private enterFloorCleared(): void {
    this.state = 'victory';
    this.progression = recordMazeCleared(this.progression);
    saveProgression(this.progression, localStorage);
    const nextFloor = this.floor + 1;
    this.showEndScreen(`FLOOR ${this.floor} CLEARED`, COLORS.player, () => {
      this.scene.restart({ floor: nextFloor, lives: this.lives, upgrades: this.upgrades });
    });
  }

  private showEndScreen(
    message: string,
    color: number,
    onContinue: () => void,
    anyKey = false,
  ): void {
    this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 20, message, {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: Phaser.Display.Color.IntegerToColor(color).rgba,
      })
      .setOrigin(0.5);

    this.add
      .text(
        ARENA_WIDTH / 2,
        ARENA_HEIGHT / 2 + 30,
        anyKey ? 'Press any key to continue' : 'Press SPACE to continue',
        {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: '#ffffff',
        },
      )
      .setOrigin(0.5);

    if (anyKey) {
      this.input.keyboard?.once('keydown', onContinue);
    } else {
      this.input.keyboard?.once('keydown-SPACE', onContinue);
    }
  }

  private togglePause(): void {
    if (this.state === 'playing') {
      this.enterPause();
    } else if (this.state === 'paused') {
      this.resumeFromPause();
    }
  }

  private enterPause(): void {
    this.state = 'paused';
    pauseMusic(this, this.currentMazeTrackKey);
    this.pauseIndex = 0;
    this.showPauseOverlay();
  }

  private resumeFromPause(): void {
    this.hidePauseOverlay();
    this.state = 'playing';
    resumeMusic(this, this.currentMazeTrackKey);
  }

  private showPauseOverlay(): void {
    const backdrop = this.add.rectangle(
      ARENA_WIDTH / 2,
      ARENA_HEIGHT / 2,
      ARENA_WIDTH,
      ARENA_HEIGHT,
      0x000000,
      0.75,
    );
    const title = this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 80, 'PAUSED', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.pauseTexts = PAUSE_ITEMS.map((label, index) =>
      this.add
        .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 20 + index * 36, label, {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => {
          this.pauseIndex = index;
          this.refreshPauseHighlight();
        })
        .on('pointerdown', () => this.activatePause()),
    );

    this.pauseOverlayObjects = [backdrop, title, ...this.pauseTexts];
    this.refreshPauseHighlight();
  }

  private hidePauseOverlay(): void {
    this.pauseOverlayObjects.forEach((object) => object.destroy());
    this.pauseOverlayObjects = [];
    this.pauseTexts = [];
  }

  private refreshPauseHighlight(): void {
    const selectedColor = Phaser.Display.Color.IntegerToColor(COLORS.projectile).rgba;
    this.pauseTexts.forEach((text, index) => {
      text.setColor(index === this.pauseIndex ? selectedColor : '#ffffff');
    });
  }

  private movePause(delta: number): void {
    this.pauseIndex = (this.pauseIndex + delta + PAUSE_ITEMS.length) % PAUSE_ITEMS.length;
    this.refreshPauseHighlight();
  }

  private activatePause(): void {
    const item = PAUSE_ITEMS[this.pauseIndex];
    if (item === 'CONTINUE') {
      this.resumeFromPause();
    } else if (item === 'RESTART') {
      this.scene.restart();
    } else {
      stopMusic(this, this.currentMazeTrackKey);
      this.scene.start('Menu');
    }
  }
}
