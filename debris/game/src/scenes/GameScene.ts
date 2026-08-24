import Phaser from 'phaser';
import { pauseSound, playLoopingSound, resumeSound, stopSound } from '../audio/LoopingSound';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  ASTEROID,
  COLORS,
  COMMANDER,
  EFFECTS,
  LIVES_PER_PLAYER,
  SHIELD,
  SHIP,
  UFO,
} from '../config/GameConfig';
import { PlayfieldBackground } from '../entities/Background';
import { Asteroid } from '../entities/Asteroid';
import { Commander } from '../entities/Commander';
import { DestructionBurst } from '../entities/DestructionBurst';
import { Projectile } from '../entities/Projectile';
import { Shield } from '../entities/Shield';
import { Ship } from '../entities/Ship';
import { SpaceStation } from '../entities/SpaceStation';
import { Ufo } from '../entities/Ufo';
import { UfoShot } from '../entities/UfoShot';
import { GamepadInput } from '../input/GamepadInput';
import { KeyboardInput, P1_BINDINGS, P2_BINDINGS } from '../input/KeyboardInput';
import type { PlayerInput } from '../input/PlayerInput';
import { canFire } from '../systems/CombatSystem';
import { nextAsteroidSize, splitHeading, type AsteroidSize } from '../systems/AsteroidSplit';
import { getMusicVolume, getSfxVolume } from '../systems/AudioSettings';
import { hasRescueWindowExpired, isWithinDropOffRange } from '../systems/CommanderRescue';
import { computeSlotAssignments, type InputSource } from '../systems/GamepadAssignment';
import { filterStandardGamepads } from '../systems/GamepadDetection';
import { fetchLeaderboard, qualifiesForLeaderboard, submitHighScore } from '../systems/HighScoreApi';
import { GAMEPLAY_MUSIC_KEY, MENU_MUSIC_KEY } from '../systems/Music';
import { evaluateRoundOutcome, GAME_MODE_LABELS, type GameMode } from '../systems/RoundOutcome';
import {
  ASTEROID_HIT_SFX_KEY,
  SHIELD_PICKUP_SFX_KEY,
  SHIP_DESTROYED_SFX_KEY,
  SHOT_SFX_KEY,
  THRUST_SFX_KEY,
} from '../systems/Sfx';
import { applyAimSpread, computeLeadAimHeading } from '../systems/UfoTargeting';
import { toCssHex } from '../utilities/Color';
import type { Vector2 } from '../utilities/Vector2';

type SessionState = 'playing' | 'stageClear' | 'gameOver' | 'paused' | 'enteringInitials';

interface PlayerSlot {
  /** The original P1-P4 slot number (0-3) - NOT this player's position in the (possibly sparse, inactive-slots-skipped) `players` array. Everything that needs a stable "which player" identity (scoring, ship color, self-hit immunity) keys off this, never array position. */
  slotIndex: number;
  ship: Ship;
  input: PlayerInput;
  lastFiredAtMs: number;
  /** Remaining lives (starts at LIVES_PER_PLAYER). Competitive/Single Player only - Cooperative uses `eliminated` instead (see below), lives genuinely don't matter there anymore. */
  lives: number;
  /** True once this player is permanently out for the round. Competitive/Single Player: set when `lives` hits 0. Cooperative: set when a Commander goes unrescued past COMMANDER.rescueWindowMs, or is destroyed by a hazard first - lives are never decremented in that mode at all. */
  eliminated: boolean;
  /** The Commander this player is currently towing toward the space station, if any (Cooperative only) - null otherwise, including while this player has no Commander to carry. */
  towedCommander: Commander | null;
  /** This player's own corner HUD (see PLAYER_HUD_CORNERS) - one Text object per active player, refreshed by refreshAllPlayerHud() whenever score, lives, or Cooperative rescue status change. */
  hudText: Phaser.GameObjects.Text;
}

const MAX_PLAYER_SLOTS = 4;

// Fixed per-slot spawn offset from arena center, in a small diamond -
// doesn't shift around based on how many slots actually end up active,
// so "where does P1 start" never depends on who else is playing.
const PLAYER_SPAWN_OFFSETS: readonly Vector2[] = [
  { x: -150, y: -100 },
  { x: 150, y: -100 },
  { x: -150, y: 100 },
  { x: 150, y: 100 },
];

const HUD_MARGIN = 12;

/**
 * One screen corner per slot - P1 top-left, P2 top-right, P3 bottom-left,
 * P4 bottom-right, the same quadrant layout as PLAYER_SPAWN_OFFSETS'
 * diamond so "which corner is mine" matches "which corner did I spawn
 * near." `origin`/`align` anchor each Text from its own true corner (top
 * corners grow downward, bottom corners grow upward) so adding more
 * stat lines later doesn't drift the text off-screen or across the
 * midline.
 */
const PLAYER_HUD_CORNERS: readonly {
  x: number;
  y: number;
  origin: readonly [number, number];
  align: 'left' | 'right';
}[] = [
  { x: HUD_MARGIN, y: HUD_MARGIN, origin: [0, 0], align: 'left' },
  { x: ARENA_WIDTH - HUD_MARGIN, y: HUD_MARGIN, origin: [1, 0], align: 'right' },
  { x: HUD_MARGIN, y: ARENA_HEIGHT - HUD_MARGIN, origin: [0, 1], align: 'left' },
  { x: ARENA_WIDTH - HUD_MARGIN, y: ARENA_HEIGHT - HUD_MARGIN, origin: [1, 1], align: 'right' },
];

/**
 * Up to 4 ships (P1-P4 - see docs/controls.md), keyboard for P1/P2 by
 * default (switchable to gamepad) and gamepad-only for P3/P4 - which
 * slots are actually active each round is decided by `MenuScene`'s
 * per-slot `sources` selection plus how many gamepads are actually
 * connected at Start (`systems/GamepadAssignment.ts`'s
 * `computeSlotAssignments`, the same connection-order-priority function
 * the menu's own READY/WAITING cards use, so the menu can never promise
 * a slot the round doesn't deliver). A procedural asteroid field,
 * shooting, and split-on-hit - proving out the Matter-based movement and
 * collision architecture decided in docs/technical_design.md. Now also:
 * a Shield pickup, a UFO (periodic spawn, lead-the-target fire,
 * destroyed by a shot/asteroid/ship-ram), ship destruction on an
 * unshielded hit, a stage-cleared/game-over pause-for-input flow, and
 * Cooperative/Competitive mode logic (`MenuScene`'s mode toggle,
 * consumed via `init(data)` now - see docs/gameplay.md's "Modes"
 * section):
 *
 * - **Cooperative** (default): no friendly fire and ships can't even
 *   physically touch each other (`Ship`'s own collision mask excludes
 *   other ships entirely, not just "no damage"). **Lives don't apply
 *   here at all** (decided, on request - see docs/gameplay.md's
 *   "Emergency Ejection & Rescue"): an unshielded hit ejects the pilot
 *   as a drifting `Commander` instead of costing a life. Another player
 *   can pick them up on touch and fly them to the arena-center
 *   `SpaceStation` to respawn them (`processStationDropOffs`) - or leave
 *   them to run out `COMMANDER.rescueWindowMs` (10s) or get caught by an
 *   asteroid/UFO while adrift (`processCommanderExpiry`,
 *   `pendingCommanderHazardHits`), either of which permanently
 *   eliminates that player for the round (`PlayerSlot.eliminated`).
 *   Round ends once every active player is eliminated.
 * - **Competitive**: player shots and ship-to-ship ramming are both
 *   lethal (a shooter is immune to their own shot - see
 *   `pendingFriendlyFireHits`), each player's score is tracked and shown
 *   separately instead of pooled, and the round ends the instant only
 *   one ship remains ("last ship standing wins" - `systems/
 *   RoundOutcome.ts`, tested). Keeps the lives/respawn/invulnerability
 *   system (below) exactly as it was before Cooperative's rescue
 *   mechanic replaced it there - no Commander/SpaceStation involved.
 * - **Single Player**: `buildPlayers()` locks the round to slot 0 only,
 *   regardless of `sources`' other entries - `MenuScene` reflects the
 *   same lock (P2-P4 cards read LOCKED) but this is what actually
 *   enforces it. Uses the same lives/respawn system as Competitive, not
 *   Cooperative's rescue mechanic - there's no one around to rescue a
 *   solo player. The one real difference from Competitive: a loss checks
 *   the run's score against a persisted personal best
 *   (`systems/HighScore.ts`) and shows it on the GAME OVER screen - the
 *   thing Cooperative's own "not competing for a personal high score"
 *   framing (docs/gameplay.md) explicitly isn't about.
 *
 * `aliveFlagsBySlot()` (round-outcome input) reads uniformly as
 * `!eliminated` across all three modes now - only *how* `eliminated`
 * gets set differs (lives hitting 0 for Competitive/Single Player, a
 * failed rescue for Cooperative), so `evaluateRoundOutcome` itself never
 * needed to know which mechanism produced it.
 *
 * Lives, respawn, and a brief post-respawn invulnerability window
 * (`PlayerSlot.lives`, `pendingRespawns`, `Ship.isInvulnerable`) apply to
 * Competitive and Single Player only now - a hit there still destroys a
 * ship outright, but only costs the round once it was that player's
 * last life.
 */
export class GameScene extends Phaser.Scene {
  private background!: PlayfieldBackground;
  private mode: GameMode = 'cooperative';
  private sources: InputSource[] = ['keyboard', 'keyboard', 'gamepad', 'gamepad'];
  private players: PlayerSlot[] = [];
  private asteroids: Asteroid[] = [];
  private projectiles: Projectile[] = [];
  private shields: Shield[] = [];
  private ufos: Ufo[] = [];
  private ufoShots: UfoShot[] = [];
  private bursts: DestructionBurst[] = [];
  // Cooperative only - both stay empty/undefined in Competitive/Single
  // Player, since that's the only mode with a rescue mechanic to track.
  private commanders: Commander[] = [];
  private spaceStation: SpaceStation | undefined;
  private lastShieldSpawnAtMs = -Infinity;
  private lastUfoSpawnAtMs = -Infinity;
  private scores: number[] = [];
  // Destruction -> a beat -> reappear-invulnerable (decided) isn't instant,
  // so a destroyed-with-lives-remaining ship's respawn is queued here and
  // only actually rebuilt once its timer's due - same queued-mutation
  // pattern as the pendingX hit arrays below, not a Phaser delayedCall,
  // so it drains predictably alongside everything else in update().
  private pendingRespawns: { slotIndex: number; respawnAtMs: number }[] = [];
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
  // Competitive-only: a ship hit by an *enemy* player's shot. The
  // shooter's own shot is filtered out in handleCollision before this is
  // ever populated - see the self-hit-immunity note there.
  private pendingFriendlyFireHits: { ship: Ship; projectile: Projectile }[] = [];
  // Cooperative only. A pickup only fires for an adrift Commander (never
  // a carried one) - see handleCollision. A hazard hit also destroys the
  // asteroid/UFO shot involved where applicable, same as the equivalent
  // ship-hit paths above.
  private pendingCommanderPickups: { commander: Commander; ship: Ship }[] = [];
  private pendingCommanderHazardHits: Commander[] = [];

  constructor() {
    super('Game');
  }

  /** Called before create() on every start *and* every scene.restart(data) - the mode/sources-carrying explicit-data restarts elsewhere in this file rely on that. */
  init(data: { mode?: GameMode; sources?: InputSource[] }): void {
    this.mode = data?.mode ?? 'cooperative';
    this.sources = data?.sources ?? ['keyboard', 'keyboard', 'gamepad', 'gamepad'];
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
    this.buildPlayers();

    this.asteroids = [];
    this.projectiles = [];
    this.shields = [];
    this.ufos = [];
    this.ufoShots = [];
    this.bursts = [];
    this.commanders = [];
    // Only Cooperative has a rescue mechanic to send anyone to - see the
    // class doc comment's mode breakdown.
    this.spaceStation =
      this.mode === 'cooperative' ? new SpaceStation(this, { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 }) : undefined;
    this.scores = [0, 0, 0, 0]; // fixed, indexed by slotIndex - not sized to how many players are actually active
    this.state = 'playing';
    this.lastShieldSpawnAtMs = this.time.now;
    this.lastUfoSpawnAtMs = this.time.now;
    this.wasAnyThrusting = false;
    this.pendingHits = [];
    this.pendingShieldPickups = [];
    this.pendingShipHits = [];
    this.pendingUfoHits = [];
    this.pendingUfoShotHits = [];
    this.pendingFriendlyFireHits = [];
    this.pendingRespawns = [];
    this.pendingCommanderPickups = [];
    this.pendingCommanderHazardHits = [];
    this.overlayTexts = [];
    this.pauseMenuObjects = [];
    this.spawnWave(ASTEROID.spawnCountPerWave);
    this.refreshAllPlayerHud();

    this.add
      .text(ARENA_WIDTH / 2, 8, GAME_MODE_LABELS[this.mode], {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#9a9ab0',
      })
      .setOrigin(0.5, 0);

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
      this.players.forEach((player) => player.input.destroy?.());
      stopSound(this, THRUST_SFX_KEY);
    });
  }

  /**
   * Builds `this.players` from `this.sources` and whatever gamepads are
   * actually connected right now, via the same connection-order
   * assignment `MenuScene`'s READY/WAITING cards already used
   * (`computeSlotAssignments`) - a slot that read WAITING on the menu
   * won't silently get a ship here. P1 (slot 0) and P2 (slot 1) are the
   * only slots that can ever be 'keyboard' (`MenuScene` never shows the
   * toggle for P3/P4), so the keyboard-bindings choice below is safe.
   */
  private buildPlayers(): void {
    const shipCollisionEnabled = this.mode === 'competitive';
    const connectedGamepads = filterStandardGamepads(this.input.gamepad?.getAll() ?? []);
    // Single Player is locked to exactly P1 (decided) - every other
    // slot's source choice is ignored outright, not just left
    // un-toggleable on the menu. Slicing to length 1 means
    // computeSlotAssignments never even considers slots 1-3.
    const sources = this.mode === 'singlePlayer' ? this.sources.slice(0, 1) : this.sources;
    const assignments = computeSlotAssignments(sources, connectedGamepads.length);

    this.players = [];
    assignments.forEach((assignment, slotIndex) => {
      const source = this.sources[slotIndex];
      const active = source === 'keyboard' || assignment.ready;
      if (!active) return;

      const input: PlayerInput =
        source === 'keyboard'
          ? new KeyboardInput(slotIndex === 0 ? P1_BINDINGS : P2_BINDINGS)
          : new GamepadInput(connectedGamepads[assignment.gamepadIndex!]!);

      const offset = this.spawnOffsetFor(slotIndex);
      const corner = PLAYER_HUD_CORNERS[slotIndex]!;
      const hudText = this.add
        .text(corner.x, corner.y, '', {
          fontFamily: 'monospace',
          fontSize: '18px',
          color: toCssHex(COLORS.players[slotIndex]!),
          align: corner.align,
        })
        .setOrigin(corner.origin[0], corner.origin[1]);

      this.players.push({
        slotIndex,
        ship: new Ship(
          this,
          ARENA_WIDTH / 2 + offset.x,
          ARENA_HEIGHT / 2 + offset.y,
          COLORS.players[slotIndex]!,
          shipCollisionEnabled,
        ),
        input,
        lastFiredAtMs: -Infinity,
        lives: LIVES_PER_PLAYER,
        eliminated: false,
        towedCommander: null,
        hudText,
      });
    });
  }

  /** Solo play spawns dead-center - the 4-point diamond exists to keep simultaneous players apart, which is moot with only one ship ever on screen. Shared by buildPlayers() and processPendingRespawns() so a respawn lands in the same place a round-start spawn would. */
  private spawnOffsetFor(slotIndex: number): Vector2 {
    return this.mode === 'singlePlayer' ? { x: 0, y: 0 } : PLAYER_SPAWN_OFFSETS[slotIndex]!;
  }

  update(_time: number, deltaMs: number): void {
    const deltaSeconds = deltaMs / 1000;
    const nowMs = this.time.now;

    this.processPendingHits();
    this.processPendingShieldPickups();
    this.processPendingFriendlyFireHits();
    this.processPendingShipHits(nowMs);
    this.processPendingUfoHits();
    this.processPendingUfoShotHits();
    this.processPendingRespawns(nowMs);
    this.processPendingCommanderPickups();
    this.processPendingCommanderHazardHits();
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
    this.commanders = this.commanders.filter((commander) => commander.isAlive);

    this.background.update(deltaSeconds);
    this.spaceStation?.update(nowMs);

    this.bursts.forEach((burst) => burst.update(nowMs, deltaSeconds));
    this.bursts = this.bursts.filter((burst) => burst.isAlive);

    if (this.state === 'enteringInitials') {
      this.updateInitialsEntry();
      return;
    }

    if (this.state !== 'playing') return;

    this.players.forEach((player) => {
      if (!player.ship.isAlive) return;

      const turn = player.input.turnDirection;
      if (turn !== 0) {
        player.ship.setRotation(player.ship.heading + turn * SHIP.turnRateRadPerSec * deltaSeconds);
      }
      player.ship.setThrusting(player.input.isThrusting);

      const ownProjectileCount = this.projectiles.filter((p) => p.ownerIndex === player.slotIndex).length;
      if (
        player.input.isFiring &&
        !player.ship.isInvulnerable(nowMs) && // respawn grace period: can move, can't shoot (decided)
        ownProjectileCount < SHIP.maxOnScreenShots &&
        canFire(player.lastFiredAtMs, nowMs, SHIP.fireCooldownMs)
      ) {
        this.fireProjectile(player, nowMs);
        player.lastFiredAtMs = nowMs;
      }

      player.ship.update(nowMs, deltaSeconds, ARENA_WIDTH, ARENA_HEIGHT);
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
    this.commanders.forEach((commander) => commander.update(nowMs, ARENA_WIDTH, ARENA_HEIGHT));
    this.processCommanderExpiry(nowMs);
    this.processStationDropOffs(nowMs);

    this.asteroids = this.asteroids.filter((asteroid) => asteroid.isAlive);
    this.projectiles = this.projectiles.filter((projectile) => projectile.isAlive);
    this.shields = this.shields.filter((shield) => shield.isAlive);
    this.ufos = this.ufos.filter((ufo) => ufo.isAlive);
    this.ufoShots = this.ufoShots.filter((shot) => shot.isAlive);
    this.commanders = this.commanders.filter((commander) => commander.isAlive);

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

  private fireProjectile(player: PlayerSlot, nowMs: number): void {
    this.sound.play(SHOT_SFX_KEY, { volume: getSfxVolume() });
    this.projectiles.push(
      new Projectile(
        this,
        player.ship.position,
        player.ship.heading,
        nowMs,
        player.ship.color,
        player.slotIndex,
        this.mode === 'competitive',
      ),
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
    const nowMs = this.time.now;
    const entityA = this.entityOf(pair.bodyA);
    const entityB = this.entityOf(pair.bodyB);

    const projectile = entityA instanceof Projectile ? entityA : entityB instanceof Projectile ? entityB : undefined;
    const asteroid = entityA instanceof Asteroid ? entityA : entityB instanceof Asteroid ? entityB : undefined;
    const ship = entityA instanceof Ship ? entityA : entityB instanceof Ship ? entityB : undefined;
    const shield = entityA instanceof Shield ? entityA : entityB instanceof Shield ? entityB : undefined;
    const ufo = entityA instanceof Ufo ? entityA : entityB instanceof Ufo ? entityB : undefined;
    const ufoShot = entityA instanceof UfoShot ? entityA : entityB instanceof UfoShot ? entityB : undefined;
    const commander = entityA instanceof Commander ? entityA : entityB instanceof Commander ? entityB : undefined;

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

    if (projectile?.isAlive && ship?.isAlive) {
      // Competitive only - Cooperative shots never carry CATEGORY.SHIP in
      // their mask, so this pair can't occur there at all. A shot spawns
      // exactly at its own ship's position, so without the ownerIndex
      // check it would register a hit against its own shooter on the
      // very first physics step. `.find()`, not `.findIndex()` - the
      // owning player's *slotIndex* is what matters here, not their
      // position in `this.players` (which skips inactive slots).
      const shooterSlot = this.players.find((p) => p.ship === ship)?.slotIndex;
      if (projectile.ownerIndex !== shooterSlot && !ship.isInvulnerable(nowMs)) {
        if (!this.pendingFriendlyFireHits.some((hit) => hit.projectile === projectile)) {
          this.pendingFriendlyFireHits.push({ ship, projectile });
        }
      }
      return;
    }

    if (this.mode === 'competitive' && entityA instanceof Ship && entityB instanceof Ship) {
      // Ramming is mutually lethal in Competitive too, same spirit as
      // UFO ramming below - "player ships... do collide with each other
      // - friendly fire is the point" (docs/gameplay.md). Each ship's
      // own shield can still save it individually. A ship mid-respawn-
      // invulnerability is skipped entirely, same as every other damage
      // path below.
      if (entityA.isAlive && !entityA.isInvulnerable(nowMs) && !this.pendingShipHits.includes(entityA)) {
        this.pendingShipHits.push(entityA);
      }
      if (entityB.isAlive && !entityB.isInvulnerable(nowMs) && !this.pendingShipHits.includes(entityB)) {
        this.pendingShipHits.push(entityB);
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
      if (!ship.isInvulnerable(nowMs) && !this.pendingShipHits.includes(ship)) {
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
      // as an asteroid ram - the UFO dies either way, even against an
      // invulnerable ship - only the ship's own damage is skipped).
      if (!ship.isInvulnerable(nowMs) && !this.pendingShipHits.includes(ship)) {
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

    // Commander (Cooperative's rescue mechanic - see the class doc
    // comment) only ever pairs with SHIP/ASTEROID/UFO/UFO_SHOT at all
    // (its own collision mask), and only while adrift - a carried one is
    // still a live sensor body, but GameScene ignores both branches
    // below for it (already rescued, already attached to its carrier).
    if (commander?.isAlive && commander.isAdrift) {
      if (asteroid?.isAlive || ufoShot?.isAlive || ufo?.isAlive) {
        if (!this.pendingCommanderHazardHits.includes(commander)) {
          this.pendingCommanderHazardHits.push(commander);
        }
        if (ufoShot?.isAlive && !this.pendingUfoShotHits.includes(ufoShot)) {
          this.pendingUfoShotHits.push(ufoShot);
        }
        return;
      }

      if (ship?.isAlive) {
        // .find() by object identity, same pattern as the friendly-fire
        // shooter check above - a defensive self-pickup guard that can't
        // actually trigger (the ejected player has no live ship to touch
        // their own Commander with), kept for the same reason that check
        // is: cheap insurance against a future refactor breaking the
        // invariant silently.
        const rescuer = this.players.find((p) => p.ship === ship);
        if (rescuer && !rescuer.towedCommander && rescuer.slotIndex !== commander.slotIndex) {
          if (!this.pendingCommanderPickups.some((pickup) => pickup.commander === commander)) {
            this.pendingCommanderPickups.push({ commander, ship });
          }
        }
        return;
      }
    }

    if (ship?.isAlive && asteroid?.isAlive) {
      if (!ship.isInvulnerable(nowMs) && !this.pendingShipHits.includes(ship)) {
        this.pendingShipHits.push(ship);
      }
    }
  }

  private entityOf(
    body: MatterJS.BodyType,
  ): Asteroid | Projectile | Ship | Shield | Ufo | UfoShot | Commander | undefined {
    const gameObject = body.gameObject as Phaser.GameObjects.GameObject | undefined;
    return gameObject?.getData('entity') as
      | Asteroid
      | Projectile
      | Ship
      | Shield
      | Ufo
      | UfoShot
      | Commander
      | undefined;
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

  /** Feeds into `pendingShipHits` (same shield-check/destroy path as any other hit) - destroys the hitting shot either way, whether or not the target's shield absorbs it. */
  private processPendingFriendlyFireHits(): void {
    if (this.pendingFriendlyFireHits.length === 0) return;
    const hits = this.pendingFriendlyFireHits;
    this.pendingFriendlyFireHits = [];
    for (const { ship, projectile } of hits) {
      if (projectile.isAlive) projectile.destroy();
      if (ship.isAlive && !this.pendingShipHits.includes(ship)) {
        this.pendingShipHits.push(ship);
      }
    }
  }

  /**
   * Destroys individual ships as their hits come in. Competitive/Single
   * Player: spends one of that player's lives and (if any remain) queues
   * a respawn - only a life-0 hit is a permanent elimination. Cooperative:
   * lives never enter into it - the pilot ejects as a Commander instead
   * (`ejectCommander`), and elimination only happens later, if the
   * rescue itself fails (`processCommanderExpiry`,
   * `pendingCommanderHazardHits`). Either way, finishes by checking the
   * mode-aware round-over rule (`checkRoundOutcome`).
   */
  private processPendingShipHits(nowMs: number): void {
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

      const position = ship.position;
      const color = ship.color;
      this.sound.play(SHIP_DESTROYED_SFX_KEY, { volume: getSfxVolume() });
      ship.destroy();
      this.spawnBurst(position, color, EFFECTS.shipBurst);
      this.shakeCamera(EFFECTS.majorShake);

      const player = this.players.find((p) => p.ship === ship);
      if (player) {
        // A Commander this player was towing doesn't go down with them -
        // dropped back into open space instead (Commander.ts's class doc
        // covers this edge case's reasoning: it stays rescued, just needs
        // a new carrier).
        if (player.towedCommander) {
          player.towedCommander.drop(Math.random() * Math.PI * 2);
          player.towedCommander = null;
        }

        if (this.mode === 'cooperative') {
          this.ejectCommander(player, position, color, nowMs);
        } else {
          player.lives -= 1;
          if (player.lives > 0) {
            this.pendingRespawns.push({ slotIndex: player.slotIndex, respawnAtMs: nowMs + SHIP.respawnDelayMs });
          } else {
            player.eliminated = true;
          }
        }
        this.refreshAllPlayerHud();
      }
    }

    this.checkRoundOutcome();
  }

  /** Cooperative's "emergency exit" - see the class doc comment. */
  private ejectCommander(player: PlayerSlot, position: Vector2, color: number, nowMs: number): void {
    const headingRad = Math.random() * Math.PI * 2;
    this.commanders.push(new Commander(this, position, player.slotIndex, color, headingRad, nowMs));
  }

  /**
   * The mode-aware round-over check (systems/RoundOutcome.ts), shared by
   * every way a player can become eliminated now - a ship hit
   * (`processPendingShipHits`), a Commander's rescue window running out
   * (`processCommanderExpiry`), or a Commander being caught by a hazard
   * while adrift (`processPendingCommanderHazardHits`). Guards on
   * `this.state` itself so callers don't each need to re-check it.
   */
  private checkRoundOutcome(): void {
    if (this.state !== 'playing') return;

    // A full 4-slot array indexed by slotIndex, not `this.players.map()`
    // (which would be indexed by array position - wrong the moment any
    // slot is inactive, since `winnerIndex` needs to name the actual P1-4
    // slot). An inactive slot reads as "not alive," which is exactly
    // right for round-outcome purposes - it was never in the fight.
    const outcome = evaluateRoundOutcome(this.aliveFlagsBySlot(), this.mode);
    if (outcome.status === 'continue') return;

    // The round is over - drop any respawns still in flight so a
    // just-eliminated player's earlier death doesn't pop a ghost ship
    // back in after the GAME OVER overlay is already up.
    this.pendingRespawns = [];
    stopSound(this, THRUST_SFX_KEY);
    this.wasAnyThrusting = false;
    if (outcome.status === 'win') {
      this.enterGameOver([`PLAYER ${outcome.winnerIndex + 1} WINS`, 'PRESS ANY KEY TO RESTART']);
    } else if (outcome.status === 'draw') {
      this.enterGameOver(['DRAW', 'PRESS ANY KEY TO RESTART']);
    } else if (this.mode === 'singlePlayer') {
      // The one place a loss also does something besides end the round:
      // check the run's score against the global top-10 leaderboard
      // (systems/HighScoreApi.ts - a real backend now, not localStorage)
      // and, if it qualifies, let the player enter 3-letter initials
      // before the usual GAME OVER overlay. Pausing here (not waiting for
      // the fetch) freezes the round immediately either way.
      this.matter.world.pause();
      void this.finishSinglePlayerRound(this.scores[0] ?? 0);
    } else {
      this.enterGameOver(['GAME OVER', 'PRESS ANY KEY TO RESTART']);
    }
  }

  /** Fetches the current leaderboard, decides whether `finalScore` qualifies (the same check the server itself re-verifies as the actual authority - see HighScoreApi.ts), and either starts initials entry or goes straight to the normal GAME OVER overlay. */
  private async finishSinglePlayerRound(finalScore: number): Promise<void> {
    const leaderboard = await fetchLeaderboard();
    if (qualifiesForLeaderboard(leaderboard, finalScore)) {
      this.enterInitialsEntry(finalScore);
      return;
    }

    const topLine = leaderboard[0] ? `TOP SCORE ${leaderboard[0].score}` : 'NO SCORES YET';
    this.enterGameOver(['GAME OVER', `SCORE ${finalScore}`, topLine, 'PRESS ANY KEY TO RESTART']);
  }

  /**
   * Classic-arcade 3-letter initials entry (Single Player, on a
   * qualifying score). Reuses whatever input the player was already
   * using to fly - `this.players[0].input` is still live (not destroyed
   * until scene shutdown) - `turnDirection` (edge-triggered) cycles the
   * active slot's letter A-Z, `isFiring` (edge-triggered) confirms and
   * advances; confirming the third slot submits and proceeds to the
   * normal GAME OVER overlay. Driven by `updateInitialsEntry()`, called
   * from `update()` while `this.state === 'enteringInitials'` - a
   * different per-frame path than every other overlay in this file
   * (`waitForKeyPress`'s one-shot "any key" listeners), since this one
   * needs to read direction/fire every frame, not just detect a single
   * press.
   */
  private initialsEntry: {
    letters: [string, string, string];
    activeSlot: 0 | 1 | 2;
    letterTexts: [Phaser.GameObjects.Text, Phaser.GameObjects.Text, Phaser.GameObjects.Text];
    titleText: Phaser.GameObjects.Text;
    scoreText: Phaser.GameObjects.Text;
    instructionText: Phaser.GameObjects.Text;
    prevTurnDirection: -1 | 0 | 1;
    prevFiring: boolean;
    finalScore: number;
  } | null = null;

  private enterInitialsEntry(finalScore: number): void {
    this.state = 'enteringInitials';
    const centerX = ARENA_WIDTH / 2;
    const centerY = ARENA_HEIGHT / 2;

    const titleText = this.add
      .text(centerX, centerY - 120, 'NEW HIGH SCORE!', {
        fontFamily: 'monospace',
        fontSize: '40px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const scoreText = this.add
      .text(centerX, centerY - 70, `SCORE ${finalScore}`, {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#9a9ab0',
      })
      .setOrigin(0.5);

    const letterSpacing = 60;
    const letterTexts = [0, 1, 2].map((i) =>
      this.add
        .text(centerX + (i - 1) * letterSpacing, centerY, 'A', {
          fontFamily: 'monospace',
          fontSize: '56px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    ) as [Phaser.GameObjects.Text, Phaser.GameObjects.Text, Phaser.GameObjects.Text];

    const instructionText = this.add
      .text(centerX, centerY + 70, 'TURN TO CHANGE   FIRE TO CONFIRM', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#9a9ab0',
      })
      .setOrigin(0.5);

    this.initialsEntry = {
      letters: ['A', 'A', 'A'],
      activeSlot: 0,
      letterTexts,
      titleText,
      scoreText,
      instructionText,
      prevTurnDirection: 0,
      prevFiring: false,
      finalScore,
    };
    this.refreshInitialsEntryDisplay();
  }

  private refreshInitialsEntryDisplay(): void {
    const entry = this.initialsEntry;
    if (!entry) return;
    entry.letterTexts.forEach((text, i) => {
      text.setText(entry.letters[i] ?? 'A');
      if (i < entry.activeSlot) text.setColor('#8aff4d'); // already confirmed
      else if (i === entry.activeSlot) text.setColor(toCssHex(COLORS.players[0])); // active
      else text.setColor('#5a5a6e'); // not yet reached
    });
  }

  private updateInitialsEntry(): void {
    const entry = this.initialsEntry;
    const input = this.players[0]?.input;
    if (!entry || !input) return;

    const turn = input.turnDirection;
    if (turn !== 0 && entry.prevTurnDirection === 0) {
      const currentCode = entry.letters[entry.activeSlot].charCodeAt(0) - 65; // 'A' = 65
      entry.letters[entry.activeSlot] = String.fromCharCode(65 + (((currentCode + turn) % 26) + 26) % 26);
      this.refreshInitialsEntryDisplay();
    }
    entry.prevTurnDirection = turn;

    const firing = input.isFiring;
    if (firing && !entry.prevFiring) {
      if (entry.activeSlot < 2) {
        entry.activeSlot = (entry.activeSlot + 1) as 0 | 1 | 2;
        this.refreshInitialsEntryDisplay();
      } else {
        this.confirmInitialsEntry();
      }
    }
    entry.prevFiring = firing;
  }

  private confirmInitialsEntry(): void {
    const entry = this.initialsEntry;
    if (!entry) return;
    const initials = entry.letters.join('');
    const finalScore = entry.finalScore;

    [entry.titleText, entry.scoreText, entry.instructionText, ...entry.letterTexts].forEach((text) =>
      text.destroy(),
    );
    this.initialsEntry = null;

    void submitHighScore(initials, finalScore).then((result) => {
      this.enterGameOver(
        result.accepted
          ? ['GAME OVER', `SCORE ${finalScore}`, 'NEW HIGH SCORE!', 'PRESS ANY KEY TO RESTART']
          : ['GAME OVER', `SCORE ${finalScore}`, 'PRESS ANY KEY TO RESTART'],
      );
    });
  }

  /** A Commander nobody reached in time (COMMANDER.rescueWindowMs) - eliminates that player for the round, same permanence as running out of lives in the other modes. Only applies to a Commander that's still adrift and was never rescued - a dropped-but-already-rescued one (see the towedCommander drop note above) doesn't get a second countdown. */
  private processCommanderExpiry(nowMs: number): void {
    if (this.state !== 'playing') return;

    let anyExpired = false;
    for (const commander of this.commanders) {
      if (!commander.isAlive || !commander.isAdrift || commander.hasBeenRescuedOnce) continue;
      if (!hasRescueWindowExpired(commander.ejectedAtMs, nowMs, COMMANDER.rescueWindowMs)) continue;

      const player = this.players.find((p) => p.slotIndex === commander.slotIndex);
      if (player) player.eliminated = true;
      this.spawnBurst(commander.position, commander.color, EFFECTS.shipBurst);
      commander.destroy();
      anyExpired = true;
    }

    if (anyExpired) {
      this.refreshAllPlayerHud();
      this.checkRoundOutcome();
    }
  }

  /** A carried Commander's ride reaching the station - respawns the original (rescued) player there, not the carrier. */
  private processStationDropOffs(nowMs: number): void {
    const station = this.spaceStation;
    if (!station) return;

    for (const rescuer of this.players) {
      const commander = rescuer.towedCommander;
      if (!commander || !rescuer.ship.isAlive) continue;
      if (!isWithinDropOffRange(rescuer.ship.position, station.position, station.dropOffRadius)) continue;

      this.respawnRescuedPlayer(commander.slotIndex, station.position, nowMs);
      commander.destroy();
      rescuer.towedCommander = null;
      // No dedicated "docked" SFX yet - reusing the Shield pickup sound,
      // same "reuse over silence" precedent as the UFO's own destruction
      // SFX gap.
      this.sound.play(SHIELD_PICKUP_SFX_KEY, { volume: getSfxVolume() });
      this.refreshAllPlayerHud();
    }
  }

  /** The rescued player - not the rescuer - gets a fresh ship at the station, same brief invulnerability window every other respawn already grants. */
  private respawnRescuedPlayer(slotIndex: number, stationPosition: Vector2, nowMs: number): void {
    const player = this.players.find((p) => p.slotIndex === slotIndex);
    if (!player) return; // shouldn't happen - a slot doesn't disappear mid-round

    // A little jitter so simultaneous rescues don't spawn two ships
    // exactly on top of each other - the station is a trigger zone, not
    // a physical dock, so there's no "slot" to queue for.
    const jitterX = (Math.random() - 0.5) * 40;
    const jitterY = (Math.random() - 0.5) * 40;
    player.ship = new Ship(
      this,
      stationPosition.x + jitterX,
      stationPosition.y + jitterY,
      COLORS.players[slotIndex]!,
      false, // Cooperative-only - ship-vs-ship collision is always off here
    );
    player.ship.grantInvulnerability(nowMs, SHIP.respawnInvulnerabilityMs);
  }

  /** A pending respawn's target ship (see `processPendingRespawns`) fires after `SHIP.respawnDelayMs`, at the player's own original spawn point, already invulnerable for `SHIP.respawnInvulnerabilityMs`. */
  private processPendingRespawns(nowMs: number): void {
    if (this.pendingRespawns.length === 0) return;
    const due = this.pendingRespawns.filter((respawn) => nowMs >= respawn.respawnAtMs);
    if (due.length === 0) return;
    this.pendingRespawns = this.pendingRespawns.filter((respawn) => nowMs < respawn.respawnAtMs);

    for (const { slotIndex } of due) {
      const player = this.players.find((p) => p.slotIndex === slotIndex);
      if (!player) continue; // shouldn't happen - a slot doesn't disappear mid-round

      const offset = this.spawnOffsetFor(slotIndex);
      player.ship = new Ship(
        this,
        ARENA_WIDTH / 2 + offset.x,
        ARENA_HEIGHT / 2 + offset.y,
        COLORS.players[slotIndex]!,
        this.mode === 'competitive',
      );
      player.ship.grantInvulnerability(nowMs, SHIP.respawnInvulnerabilityMs);
    }
  }

  /** A ship touching an adrift Commander (see handleCollision) - no-ops if that ship's already towing one, or if the Commander was already picked up by someone else earlier in the same frame's collision batch. */
  private processPendingCommanderPickups(): void {
    if (this.pendingCommanderPickups.length === 0) return;
    const pickups = this.pendingCommanderPickups;
    this.pendingCommanderPickups = [];

    for (const { commander, ship } of pickups) {
      if (!commander.isAlive || !commander.isAdrift) continue;
      const rescuer = this.players.find((p) => p.ship === ship);
      if (!rescuer || rescuer.towedCommander) continue;

      commander.pickUp(ship);
      rescuer.towedCommander = commander;
      // No dedicated rescue SFX yet - reusing the Shield pickup sound.
      this.sound.play(SHIELD_PICKUP_SFX_KEY, { volume: getSfxVolume() });
      this.refreshAllPlayerHud();
    }
  }

  /** An adrift Commander caught by an asteroid, UFO ram, or UFO shot - decided: adrift is a real risk, not just a countdown. Permanently eliminates that player, same as a failed rescue timer. */
  private processPendingCommanderHazardHits(): void {
    if (this.pendingCommanderHazardHits.length === 0) return;
    const hits = this.pendingCommanderHazardHits;
    this.pendingCommanderHazardHits = [];
    if (this.state !== 'playing') return;

    let anyEliminated = false;
    for (const commander of hits) {
      if (!commander.isAlive || !commander.isAdrift) continue;

      const player = this.players.find((p) => p.slotIndex === commander.slotIndex);
      if (player) player.eliminated = true;
      this.spawnBurst(commander.position, commander.color, EFFECTS.shipBurst);
      this.shakeCamera(EFFECTS.majorShake);
      commander.destroy();
      anyEliminated = true;
    }

    if (anyEliminated) {
      this.refreshAllPlayerHud();
      this.checkRoundOutcome();
    }
  }

  /** Round-outcome "alive" means `!eliminated`, uniformly across every mode now (see the class doc comment) - not "has a ship on screen this exact frame." A player mid-respawn-delay, or mid-rescue as a Commander, is still very much in the fight. */
  private aliveFlagsBySlot(): boolean[] {
    return Array.from({ length: MAX_PLAYER_SLOTS }, (_unused, slotIndex) => {
      const player = this.players.find((p) => p.slotIndex === slotIndex);
      return !(player?.eliminated ?? true);
    });
  }

  /** A projectile-killed UFO scores; an asteroid- or ship-ram-killed one doesn't, but still explodes. */
  private processPendingUfoHits(): void {
    if (this.pendingUfoHits.length === 0) return;
    const hits = this.pendingUfoHits;
    this.pendingUfoHits = [];
    for (const { ufo, projectile, awardScore } of hits) {
      if (!ufo.isAlive) continue;
      const position = ufo.position;
      projectile?.destroy();
      ufo.destroy();
      // No dedicated UFO-destruction SFX yet (docs/roadmap.md's one
      // remaining SFX gap) - reusing the ship's own explosion since a
      // downed UFO is a bigger deal than a regular asteroid.
      this.sound.play(SHIP_DESTROYED_SFX_KEY, { volume: getSfxVolume() });
      this.spawnBurst(position, COLORS.ufo, EFFECTS.ufoBurst);
      this.shakeCamera(EFFECTS.majorShake);
      if (awardScore && projectile) {
        this.awardScore(projectile.ownerIndex, UFO.score);
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
    this.spawnBurst(position, COLORS.asteroid, EFFECTS.asteroidBurst);
    this.shakeCamera(EFFECTS.minorShake);

    this.awardScore(projectile.ownerIndex, ASTEROID[size].score);

    const childSize: AsteroidSize | null = nextAsteroidSize(size);
    if (childSize) {
      for (let i = 0; i < 2; i += 1) {
        const heading = splitHeading(parentHeading);
        this.asteroids.push(new Asteroid(this, position.x, position.y, childSize, heading));
      }
    }
  }

  private spawnBurst(
    origin: Vector2,
    color: number,
    config: { count: number; speedRange: readonly [number, number]; lifespanMs: number },
  ): void {
    this.bursts.push(
      new DestructionBurst(this, origin, color, config.count, config.speedRange, config.lifespanMs, this.time.now),
    );
  }

  /** Honors the OS "reduce motion" setting, same courtesy HyperOut's own screen shake already extends - decorative particle bursts aren't gated, only camera motion is. */
  private shakeCamera(config: { durationMs: number; intensity: number }): void {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.cameras.main.shake(config.durationMs, config.intensity);
  }

  private awardScore(ownerIndex: number, amount: number): void {
    this.scores[ownerIndex] = (this.scores[ownerIndex] ?? 0) + amount;
    this.refreshAllPlayerHud();
  }

  /**
   * Each active player's own corner HUD (PLAYER_HUD_CORNERS), in their
   * own color - replaces the old single pooled top-left readout so every
   * player's stats have a fixed home on screen, with room to grow (more
   * per-player stats can just become more lines in `lines` below, no
   * layout rework needed).
   *
   * Score: Cooperative/Single Player show the same pooled total in every
   * corner ("score is shared/team-based," docs/gameplay.md); Competitive
   * shows each player's own tracked score, since eliminations (not
   * score) decide that mode's round anyway.
   *
   * Third line is mode-dependent: Competitive/Single Player show lives
   * (`●` held, `○` spent). Cooperative has no lives to show (decided) -
   * `cooperativeStatusLine` shows what actually matters there instead.
   */
  private refreshAllPlayerHud(): void {
    const pooledScore = this.scores.reduce((sum, score) => sum + score, 0);

    this.players.forEach((player) => {
      const score = this.mode === 'competitive' ? (this.scores[player.slotIndex] ?? 0) : pooledScore;
      const lines = [`P${player.slotIndex + 1}`, `SCORE ${score}`];

      if (this.mode === 'cooperative') {
        const status = this.cooperativeStatusLine(player);
        if (status) lines.push(status);
      } else {
        const filled = '●'.repeat(Math.max(0, player.lives));
        const hollow = '○'.repeat(Math.max(0, LIVES_PER_PLAYER - player.lives));
        lines.push(`${filled}${hollow}`);
      }

      player.hudText.setText(lines.join('\n'));
    });
  }

  /**
   * Cooperative-only per-player status - lives don't apply there
   * (decided), so this replaces that line with whatever's actually
   * happening to this player right now. `null` (no third line at all)
   * while they're just flying normally - only shown when there's
   * something worth a teammate's attention.
   */
  private cooperativeStatusLine(player: PlayerSlot): string | null {
    if (player.eliminated) return 'ELIMINATED';
    const commander = this.commanders.find((c) => c.slotIndex === player.slotIndex && c.isAlive);
    if (!commander) return null;
    return commander.isAdrift ? 'EJECTED' : 'INBOUND';
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

  private enterGameOver(lines: string[]): void {
    this.state = 'gameOver';
    this.matter.world.pause();
    this.showOverlay(lines);
    // Explicit { mode } rather than relying on scene.restart() implicitly
    // carrying the data init() first received - this is the one thing a
    // restarted round must not silently reset.
    this.waitForKeyPress(() => this.scene.restart({ mode: this.mode }));
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
    const restartButton = this.makeMenuButton(centerX, centerY + 60, 'RESTART', () =>
      this.scene.restart({ mode: this.mode }),
    );
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
