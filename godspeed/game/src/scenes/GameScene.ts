import Phaser from 'phaser';
import { nextStepAway, nextStepToward } from '../ai/ChaseBehavior';
import { computeDistanceField, type Cell } from '../ai/Pathfinding';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  BIOMES,
  COLORS,
  ENEMY,
  MAZE,
  PICKUP,
  PLAYER,
  PROJECTILE,
  SENTINEL,
} from '../config/GameConfig';
import { Boss } from '../entities/Boss';
import { Bulwark } from '../entities/Bulwark';
import { Enemy } from '../entities/Enemy';
import { createEnemy } from '../entities/EnemyFactory';
import { MazeView } from '../entities/MazeView';
import { Pickup } from '../entities/Pickup';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import { Sentinel } from '../entities/Sentinel';
import { Skirmisher } from '../entities/Skirmisher';
import { selectBiome } from '../systems/BiomeSelection';
import { canFire, projectileVelocity } from '../systems/CombatSystem';
import { circleIntersectsAnyRect, circlesIntersect } from '../systems/CollisionSystem';
import { difficultyForFloor, type FloorDifficulty } from '../systems/FloorDifficulty';
import { pickupTypesForFloor } from '../systems/FloorPickups';
import { enemyRosterForFloor } from '../systems/FloorRoster';
import { applyHit, grantExtraLife, isGameOver, isInvulnerable } from '../systems/HealthSystem';
import { InputSystem } from '../systems/InputSystem';
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
import type { Vector2 } from '../utilities/Vector2';

const ENEMY_SPAWN_CELLS: Cell[] = [
  { row: 0, col: 0 },
  { row: 0, col: MAZE.cols - 1 },
  { row: MAZE.rows - 1, col: 0 },
  { row: MAZE.rows - 1, col: MAZE.cols - 1 },
];

// Reused after all regular enemies are cleared - by then nothing else
// occupies it, so it doesn't need its own dedicated spawn point.
const BOSS_SPAWN_CELL: Cell = ENEMY_SPAWN_CELLS[0]!;

type RunState = 'playing' | 'gameover' | 'victory';

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
  private bossProjectiles: Projectile[] = [];
  private pickups: Pickup[] = [];
  private upgrades: UpgradeState = defaultUpgradeState();
  private progression: ProgressionState = { mazesCleared: 0 };
  private difficulty: FloorDifficulty = difficultyForFloor(1);
  private floor = 1;
  private lastFiredAtMs = 0;
  private lastPathUpdateAtMs = 0;
  private lastHitAtMs = -Infinity;
  private lives: number = PLAYER.lives;
  private state: RunState = 'playing';

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
    this.bossProjectiles = [];

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
    for (const projectile of this.bossProjectiles) {
      projectile.update(deltaSeconds, nowMs);
      if (circleIntersectsAnyRect(projectile.position, PROJECTILE.radius, this.wallRects)) {
        projectile.destroy();
      }
    }

    this.updateEnemies(nowMs, deltaSeconds);
    this.updateBossAttack(nowMs);
    this.resolveProjectileEnemyHits();
    this.resolvePlayerContact(nowMs);
    this.resolvePickups();

    this.projectiles = this.projectiles.filter((projectile) => projectile.isAlive);
    this.bossProjectiles = this.bossProjectiles.filter((projectile) => projectile.isAlive);
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

    for (const chaser of chasers) {
      if (chaser instanceof Sentinel) {
        chaser.activateIfNear(this.player.position, SENTINEL.triggerDistance);
      }
    }

    if (nowMs - this.lastPathUpdateAtMs >= ENEMY.pathUpdateIntervalMs) {
      this.lastPathUpdateAtMs = nowMs;
      const playerCell = this.maze.cellFromPosition(this.player.position);
      const distanceField = computeDistanceField(this.maze.maze, playerCell);

      for (const chaser of chasers) {
        if (chaser instanceof Sentinel && !chaser.isActive) continue;
        if (!chaser.hasArrived) continue;

        const next = this.chooseNextStep(chaser, distanceField);
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

  private updateBossAttack(nowMs: number): void {
    if (!this.boss?.isAlive || !this.boss.canAttack(nowMs)) return;

    const aim = {
      x: this.player.position.x - this.boss.position.x,
      y: this.player.position.y - this.boss.position.y,
    };
    const velocity = projectileVelocity(aim, PROJECTILE.speed);
    this.bossProjectiles.push(
      new Projectile(this, this.boss.position, velocity, nowMs, COLORS.danger),
    );
    this.boss.recordAttack(nowMs);
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
          if (chaser instanceof Boss || chaser instanceof Bulwark) {
            chaser.takeHit();
          } else {
            chaser.destroy();
          }
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
    const hitByBossProjectile = this.bossProjectiles.find(
      (projectile) =>
        projectile.isAlive &&
        circlesIntersect(
          this.player.position,
          PLAYER.radius,
          projectile.position,
          PROJECTILE.radius,
        ),
    );

    if (!touchedByChaser && !hitByBossProjectile) return;

    hitByBossProjectile?.destroy();
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
    this.boss = new Boss(
      this,
      BOSS_SPAWN_CELL,
      this.maze.cellCenter(BOSS_SPAWN_CELL.row, BOSS_SPAWN_CELL.col),
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
    this.showEndScreen('GAME OVER', COLORS.danger, () => this.scene.restart());
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

  private showEndScreen(message: string, color: number, onContinue: () => void): void {
    this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 20, message, {
        fontFamily: 'monospace',
        fontSize: '40px',
        color: Phaser.Display.Color.IntegerToColor(color).rgba,
      })
      .setOrigin(0.5);

    this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2 + 30, 'Press SPACE to continue', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-SPACE', onContinue);
  }
}
