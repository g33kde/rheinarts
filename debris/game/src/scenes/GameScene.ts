import Phaser from 'phaser';
import { pauseSound, playLoopingSound, resumeSound, stopSound } from '../audio/LoopingSound';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  ASTEROID,
  BLACK_HOLE,
  CARDINAL,
  COLORS,
  COMMANDER,
  EFFECTS,
  FRACTURE,
  LIVES_PER_PLAYER,
  SHIELD,
  SHIP,
  SPACE_STATION,
  UFO,
} from '../config/GameConfig';
import { PlayfieldBackground } from '../entities/Background';
import { Asteroid } from '../entities/Asteroid';
import { BlackHole } from '../entities/BlackHole';
import { Cardinal } from '../entities/Cardinal';
import { CardinalPlasmaBall } from '../entities/CardinalPlasmaBall';
import { Commander } from '../entities/Commander';
import { DestructionBurst } from '../entities/DestructionBurst';
import { Fracture } from '../entities/Fracture';
import { FractureFragment, type FractureFragmentRole } from '../entities/FractureFragment';
import { FractureLaser } from '../entities/FractureLaser';
import { FractureShard } from '../entities/FractureShard';
import { FractureSwarmBit } from '../entities/FractureSwarmBit';
import { Projectile } from '../entities/Projectile';
import { ScorePopup } from '../entities/ScorePopup';
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
import {
  computeCaptureVelocity,
  computeGravityForce,
  isCaptured,
  isLethal,
} from '../systems/BlackHoleGravity';
import { distanceToSegment, isPointOnBeam } from '../systems/BeamGeometry';
import { hasRescueWindowExpired, isWithinDropOffRange } from '../systems/CommanderRescue';
import { computeSlotAssignments, type InputSource } from '../systems/GamepadAssignment';
import { filterStandardGamepads } from '../systems/GamepadDetection';
import { fetchLeaderboard, qualifiesForLeaderboard, submitHighScore } from '../systems/HighScoreApi';
import {
  BLACK_HOLE_APPROACHING_SFX_KEY,
  CARDINAL_MUSIC_KEY,
  FRACTURE_MUSIC_KEY,
  GAMEPLAY_MUSIC_KEY,
  MENU_MUSIC_KEY,
} from '../systems/Music';
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
import { formatStageTimer } from '../utilities/StageTimer';
import { fromAngle, normalize, type Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from '../entities/MatterGameObject';

type SessionState = 'playing' | 'stageClear' | 'gameOver' | 'paused' | 'enteringInitials' | 'bossAnnouncement';

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
  /** The Fracture's Phase 3 currency (docs/roadmap.md) - starts at 0, +1 per Swarm piece collected by touch. Shown in the HUD only once nonzero, same "no line at all until it matters" convention `cooperativeStatusLine` already uses. */
  scrap: number;
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

// "The respawn point needs to be out of boss position - corner of
// screen," decided: both bosses occupy/threaten arena-center, where
// PLAYER_SPAWN_OFFSETS above would otherwise still put a fresh respawn.
// Absolute arena positions (not offsets) since SpaceStation.travelTo()
// also targets these directly for its own boss-fight relocation - inset
// from the true screen corners so nothing spawns/sits flush against the
// wrap boundary. Same quadrant order as PLAYER_HUD_CORNERS (P1 top-left,
// P2 top-right, P3 bottom-left, P4 bottom-right).
const BOSS_CORNER_INSET = 220;
const BOSS_CORNER_POSITIONS: readonly Vector2[] = [
  { x: BOSS_CORNER_INSET, y: BOSS_CORNER_INSET },
  { x: ARENA_WIDTH - BOSS_CORNER_INSET, y: BOSS_CORNER_INSET },
  { x: BOSS_CORNER_INSET, y: ARENA_HEIGHT - BOSS_CORNER_INSET },
  { x: ARENA_WIDTH - BOSS_CORNER_INSET, y: ARENA_HEIGHT - BOSS_CORNER_INSET },
];
// spawnOffsetFor() adds this to arena-center, same as PLAYER_SPAWN_OFFSETS -
// derived from the absolute corners above so the two never drift apart.
const BOSS_RESPAWN_OFFSETS: readonly Vector2[] = BOSS_CORNER_POSITIONS.map((corner) => ({
  x: corner.x - ARENA_WIDTH / 2,
  y: corner.y - ARENA_HEIGHT / 2,
}));

const HUD_MARGIN = 12;

// "Appears outside of screen... top center," decided - safely above the
// visible arena (y < 0) even accounting for FRACTURE.radius's ~85px
// visual footprint, so no part of it is visible at the moment it spawns.
const FRACTURE_SPAWN_OFFSCREEN_Y = -150;

// The Cardinal's consolidated arm/core health bar - "below the boss,"
// decided. Pure UI layout, not gameplay-relevant, so kept file-local
// rather than in GameConfig.ts (same treatment FRACTURE_SPAWN_OFFSCREEN_Y
// above already gets).
const CARDINAL_HEALTH_BAR = { width: 260, height: 14, marginTop: 40 };

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
  private scorePopups: ScorePopup[] = [];
  // Cooperative only - both stay empty/undefined in Competitive/Single
  // Player, since that's the only mode with a rescue mechanic to track.
  private commanders: Commander[] = [];
  private spaceStation: SpaceStation | undefined;
  // True only while the station is away at a boss-fight corner (or
  // gliding to/from one) - "moves before the boss fight, moves back
  // after," decided. Gates enterStageClear()'s return-trip trigger so
  // every stage-clear doesn't need to separately check "was that a boss
  // stage" - it only travels home if it's actually away.
  private spaceStationRelocated = false;
  // Mode-agnostic, unlike commanders/spaceStation - see GameConfig.ts's
  // BLACK_HOLE doc comment. At most one active at a time (decided): a
  // new one only spawns once the previous has despawned.
  private blackHole: BlackHole | undefined;
  private blackHoleDespawnedAtMs = -Infinity; // pause-timer start; also gates the very first spawn of the round
  private blackHoleSpawnedAtMs = -Infinity; // active-timer start
  // "5 seconds before black hole appears, play black-hole-approaching.mp3,"
  // decided - true once the warning has fired for the *upcoming* spawn,
  // so it only plays once per cycle. Reset whenever a fresh "waiting to
  // spawn" cycle begins: round start, every new stage (resetStageHazards()),
  // and right after a black hole actually spawns (so the next cycle,
  // later in the same stage, can warn again).
  private blackHoleWarningPlayed = false;
  // The Fracture (docs/roadmap.md) - see GameConfig.ts's FRACTURE doc
  // comment for the three-tier Core -> Fragment -> Swarm shape.
  private fracture: Fracture | undefined; // Phase 1
  private fractureFragments: FractureFragment[] = []; // Phase 2
  private fractureSwarm: FractureSwarmBit[] = []; // Phase 3 - scrap pickups, not a hazard. Also reused as-is for The Cardinal's own arm-scrap (see processPendingCardinalArmHits) - the pickup mechanic doesn't care which boss dropped it, and Cardinal's own scrap deliberately never triggers beginScrapCountdown, so it's never swept by the 10s-expiry path below either.
  private fractureLasers: FractureLaser[] = []; // Phase 1's attack
  private fractureShards: FractureShard[] = []; // Phase 2 launcher's attack
  // "Every normal stage clear is followed by a boss stage, not just the
  // first one," decided - replaces the old one-time `fractureIntroduced`
  // latch. Tracks whether the stage that just cleared was itself a boss
  // stage: false -> beginNextLevel() triggers a randomly-picked boss
  // next; true -> it spawns a normal wave instead. Starts false, so the
  // very first stage-clear of the round still triggers a boss first,
  // same as the original behavior.
  private lastStageWasBoss = false;
  private cardinal: Cardinal | undefined;
  private cardinalPlasmaBalls: CardinalPlasmaBall[] = [];
  // Set once the last Fragment dies, cleared once the countdown runs
  // out - "a 10 sec countdown on screen. time to collect the scrap,"
  // decided. Also part of isBossEncounterActive() below, so Black
  // Hole spawning stays suppressed through the collection window too.
  private scrapCountdownEndsAtMs: number | undefined;
  private scrapCountdownText: Phaser.GameObjects.Text | undefined;
  // The Cardinal's own consolidated arm/core health bar, "below the
  // boss," decided - created once (hidden) and shown/repositioned only
  // while a Cardinal fight is actually in progress.
  private cardinalHealthBarBorder: Phaser.GameObjects.Rectangle | undefined;
  private cardinalHealthBarFill: Phaser.GameObjects.Rectangle | undefined;
  private cardinalHealthBarLabel: Phaser.GameObjects.Text | undefined;
  // Cooperative only - "whichever player is still alive/last standing"
  // enters initials on a qualifying pooled score, decided. Cooperative's
  // round only ends once *everyone* is eliminated (no "win" outcome for
  // this mode - RoundOutcome.ts), so there's never someone genuinely
  // still alive at that exact moment; this tracks whoever was the last
  // to fall instead, updated at every Cooperative elimination site
  // (processCommanderExpiry, processPendingCommanderHazardHits).
  private lastEliminatedSlotIndex: number | undefined;
  // Dev-only stage timer - "add a timer during stages on the top center
  // screen, shows minutes, seconds, milliseconds of current stage,
  // resets every stage," decided; roadmap.md flags this for removal
  // before the final version. Accumulated only while `state === 'playing'`
  // (see update()'s early-return above this point) rather than read off
  // wall-clock `this.time.now`, so it pauses for free across every
  // non-playing state (paused, stageClear, bossAnnouncement,
  // enteringInitials, gameOver) without needing to track a separate
  // "when did we last resume" timestamp.
  private stageElapsedMs = 0;
  private stageTimerText: Phaser.GameObjects.Text | undefined;
  // Whichever track is currently looping for the *current* stage -
  // `GAMEPLAY_MUSIC_KEY` for a normal stage, a boss's own key
  // (`FRACTURE_MUSIC_KEY` today) once its announcement lands. Tracked
  // explicitly (not just "whatever Phaser's sound manager happens to be
  // playing") so enterPaused()/exitPaused()/goToMainMenu() pause/resume/
  // stop whichever track is actually live instead of always assuming
  // gameplay music - "boss stages get their own music, looped, swapping
  // back for normal stages," decided.
  private currentStageMusicKey: string | undefined;
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
  private pendingFractureCoreHits: { projectile: Projectile }[] = [];
  private pendingFractureFragmentHits: { fragment: FractureFragment; projectile: Projectile }[] = [];
  private pendingFractureShardHits: { ship: Ship; shard: FractureShard }[] = [];
  // The Cardinal isn't Matter-backed at all (see its own doc comment), so
  // these two are populated by a manual per-frame distance/segment check
  // in updateCardinalAttacks() instead of handleCollision() - queued the
  // same way regardless, for the same reasons every other pendingX array
  // is: dedupe multiple projectiles hitting the same target in one
  // frame, and never destroy/mutate mid-iteration.
  private pendingCardinalArmHits: { armIndex: number; projectile: Projectile }[] = [];
  private pendingCardinalCoreHits: { projectile: Projectile }[] = [];
  // Unlike the two above, this one *is* a real Matter collision (the
  // plasma ball has its own sensor body) - populated from
  // handleCollision(), same shape as pendingFractureShardHits.
  private pendingCardinalPlasmaHits: { ship: Ship; plasma: CardinalPlasmaBall }[] = [];
  // Swarm pickups are never lethal (decided) - a separate queue from
  // every other pendingX hit array above, same shape as
  // pendingShieldPickups, not a "hit" at all.
  private pendingScrapPickups: { ship: Ship; swarmBit: FractureSwarmBit }[] = [];
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
    this.currentStageMusicKey = GAMEPLAY_MUSIC_KEY;

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
    this.scorePopups = [];
    this.commanders = [];
    // Only Cooperative has a rescue mechanic to send anyone to - see the
    // class doc comment's mode breakdown.
    this.spaceStation =
      this.mode === 'cooperative' ? new SpaceStation(this, { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 }) : undefined;
    this.spaceStationRelocated = false;
    this.blackHole = undefined;
    this.fracture = undefined;
    this.fractureFragments = [];
    this.fractureSwarm = [];
    this.fractureLasers = [];
    this.fractureShards = [];
    this.lastStageWasBoss = false;
    this.cardinal = undefined;
    this.cardinalPlasmaBalls = [];
    this.cardinalHealthBarBorder = undefined;
    this.cardinalHealthBarFill = undefined;
    this.cardinalHealthBarLabel = undefined;
    this.scrapCountdownEndsAtMs = undefined;
    this.scrapCountdownText = undefined;
    this.lastEliminatedSlotIndex = undefined;
    this.stageElapsedMs = 0;
    this.scores = [0, 0, 0, 0]; // fixed, indexed by slotIndex - not sized to how many players are actually active
    this.state = 'playing';
    this.lastShieldSpawnAtMs = this.time.now;
    this.lastUfoSpawnAtMs = this.time.now;
    this.blackHoleDespawnedAtMs = this.time.now;
    this.blackHoleWarningPlayed = false;
    this.wasAnyThrusting = false;
    this.pendingHits = [];
    this.pendingShieldPickups = [];
    this.pendingShipHits = [];
    this.pendingUfoHits = [];
    this.pendingUfoShotHits = [];
    this.pendingFractureCoreHits = [];
    this.pendingFractureFragmentHits = [];
    this.pendingFractureShardHits = [];
    this.pendingCardinalArmHits = [];
    this.pendingCardinalCoreHits = [];
    this.pendingCardinalPlasmaHits = [];
    this.pendingScrapPickups = [];
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

    // Dev-only, see `stageElapsedMs`'s own comment - sits just below the
    // mode label rather than sharing its line, so neither ever has to
    // fight the other for center-x space.
    this.stageTimerText = this.add
      .text(ARENA_WIDTH / 2, 26, formatStageTimer(this.stageElapsedMs), {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#6a6a80',
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
        scrap: 0,
        hudText,
      });
    });
  }

  /**
   * Solo play spawns dead-center - the 4-point diamond exists to keep
   * simultaneous players apart, which is moot with only one ship ever on
   * screen. Shared by buildPlayers() and processPendingRespawns() so a
   * respawn lands in the same place a round-start spawn would.
   *
   * **During a boss fight, every mode (including Single Player) spawns
   * in its own corner instead** - "the respawn point needs to be out of
   * boss position," decided - since both the diamond and Single Player's
   * dead-center point sit on or near arena-center, exactly where both
   * bosses live. In practice this only ever matters for
   * processPendingRespawns() - buildPlayers() only runs at round start,
   * before any boss stage can possibly be in progress.
   */
  private spawnOffsetFor(slotIndex: number): Vector2 {
    if (this.isBossEncounterActive()) return BOSS_RESPAWN_OFFSETS[slotIndex]!;
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
    this.processPendingFractureCoreHits(nowMs);
    this.processPendingFractureFragmentHits(nowMs);
    this.processPendingFractureShardHits(nowMs);
    this.processPendingCardinalArmHits(nowMs);
    this.processPendingCardinalCoreHits(nowMs);
    this.processPendingCardinalPlasmaHits(nowMs);
    this.processPendingScrapPickups(nowMs);
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
    // Same reasoning, for entities the Fracture pending-hit processing
    // above can destroy: processPendingFractureFragmentHits (a
    // Fragment), processPendingScrapPickups (a Swarm bit), and
    // processPendingFractureShardHits (a shard) all run before this
    // point - this was the actual "crash/freeze on a golden shard hit"
    // bug, and would have hit Fragment kills and scrap pickups too,
    // just less frequently triggered in testing so far.
    this.fractureFragments = this.fractureFragments.filter((fragment) => fragment.isAlive);
    this.fractureSwarm = this.fractureSwarm.filter((swarmBit) => swarmBit.isAlive);
    this.fractureShards = this.fractureShards.filter((shard) => shard.isAlive);
    this.cardinalPlasmaBalls = this.cardinalPlasmaBalls.filter((plasma) => plasma.isAlive);

    this.background.update(deltaSeconds);
    this.spaceStation?.update(nowMs);

    this.bursts.forEach((burst) => burst.update(nowMs, deltaSeconds));
    this.bursts = this.bursts.filter((burst) => burst.isAlive);

    this.scorePopups.forEach((popup) => popup.update(nowMs));
    this.scorePopups = this.scorePopups.filter((popup) => popup.isAlive);

    if (this.state === 'enteringInitials') {
      this.updateInitialsEntry();
      return;
    }

    if (this.state !== 'playing') return;

    this.stageElapsedMs += deltaMs;
    this.stageTimerText?.setText(formatStageTimer(this.stageElapsedMs));

    // Must run before this frame's per-entity update() calls below, not
    // just before next frame - Ship.update() re-clamps/re-sets velocity
    // from thrust every frame regardless of input, so a gravity force
    // applied *after* it would just get silently overwritten. Applying
    // it first means gravity accumulates into the same Matter step as
    // thrust, exactly like the escapable outer band is supposed to work
    // (docs/gameplay.md's Gravity Well - fight it with sustained thrust).
    this.applyBlackHoleGravityForces();
    this.applyFractureGravityForces();

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
    this.blackHole?.update(nowMs, deltaSeconds);
    this.fracture?.update(nowMs, ARENA_HEIGHT);
    this.fractureFragments.forEach((fragment) => fragment.update(nowMs, deltaSeconds, ARENA_WIDTH, ARENA_HEIGHT));
    this.fractureSwarm.forEach((swarmBit) => swarmBit.update(nowMs, deltaSeconds, ARENA_WIDTH, ARENA_HEIGHT));
    this.fractureShards.forEach((shard) => shard.update(nowMs, deltaSeconds, ARENA_WIDTH, ARENA_HEIGHT));
    this.fractureLasers.forEach((laser) => laser.update(nowMs));
    this.updateFractureAttacks(nowMs);
    this.updateScrapCountdown(nowMs);
    this.cardinal?.update(nowMs);
    this.cardinalPlasmaBalls.forEach((plasma) => plasma.update(nowMs, ARENA_WIDTH, ARENA_HEIGHT));
    this.updateCardinalAttacks(nowMs);
    this.updateCardinalHealthBar();
    // After every entity's own update() this frame, same reasoning as
    // applyBlackHoleGravityForces() above but inverted: this needs the
    // *final* say, overriding whatever thrust/drift each entity's own
    // update() just produced - "once in the event horizon you cannot get
    // out" has to mean it, not just usually win.
    this.processBlackHoleCaptureAndLethal(nowMs);

    this.asteroids = this.asteroids.filter((asteroid) => asteroid.isAlive);
    this.projectiles = this.projectiles.filter((projectile) => projectile.isAlive);
    this.shields = this.shields.filter((shield) => shield.isAlive);
    this.ufos = this.ufos.filter((ufo) => ufo.isAlive);
    this.ufoShots = this.ufoShots.filter((shot) => shot.isAlive);
    this.commanders = this.commanders.filter((commander) => commander.isAlive);
    this.fractureFragments = this.fractureFragments.filter((fragment) => fragment.isAlive);
    this.fractureSwarm = this.fractureSwarm.filter((swarmBit) => swarmBit.isAlive);
    this.fractureShards = this.fractureShards.filter((shard) => shard.isAlive);
    this.fractureLasers = this.fractureLasers.filter((laser) => laser.isAlive);
    this.cardinalPlasmaBalls = this.cardinalPlasmaBalls.filter((plasma) => plasma.isAlive);

    if (nowMs - this.lastShieldSpawnAtMs >= SHIELD.spawnIntervalMs) {
      this.spawnShield();
      this.lastShieldSpawnAtMs = nowMs;
    }

    // "Boss stages spawn max 4 UFOs," decided - only capped during a
    // boss encounter; normal stages keep the original "no cap" behavior
    // (UFO.spawnIntervalMs's own doc comment). Deliberately doesn't
    // reset `lastUfoSpawnAtMs` while capped, so the instant a slot frees
    // up (a UFO dies) a new one spawns right away if the interval had
    // already elapsed, rather than waiting a fresh full interval from
    // whenever the cap happened to clear.
    const ufoSpawnCapped = this.isBossEncounterActive() && this.ufos.length >= UFO.maxConcurrentDuringBoss;
    if (!ufoSpawnCapped && nowMs - this.lastUfoSpawnAtMs >= UFO.spawnIntervalMs) {
      this.spawnUfo();
      this.lastUfoSpawnAtMs = nowMs;
    }

    // "During boss do not spawn black hole," decided - suppressed for
    // the whole encounter (Core through the scrap-collection countdown),
    // not just Phase 1. Any already-active one at the moment the Core
    // materializes is also force-despawned (materializeFracture()) -
    // this check only ever needs to worry about *new* spawns.
    if (!this.blackHole && !this.isBossEncounterActive()) {
      // "Not before 2 min into any stage - gives players time to clear
      // the rocks first," decided: the later of the usual post-despawn
      // pause and this stage's own 2-minute grace period actually gates
      // the spawn. stageElapsedMs already resets to 0 at every stage
      // transition (resetStageHazards()), so this alone gives every
      // stage a fresh grace period with no extra timestamp to track.
      const pauseRemainingMs = BLACK_HOLE.pauseDurationMs - (nowMs - this.blackHoleDespawnedAtMs);
      const stageRemainingMs = BLACK_HOLE.minStageElapsedMs - this.stageElapsedMs;
      const remainingMs = Math.max(pauseRemainingMs, stageRemainingMs);

      if (remainingMs <= 0) {
        this.spawnBlackHole(nowMs);
      } else if (remainingMs <= BLACK_HOLE.approachWarningMs && !this.blackHoleWarningPlayed) {
        this.sound.play(BLACK_HOLE_APPROACHING_SFX_KEY, { volume: getSfxVolume() });
        this.blackHoleWarningPlayed = true;
      }
    } else if (this.blackHole && nowMs - this.blackHoleSpawnedAtMs >= BLACK_HOLE.activeDurationMs) {
      this.despawnBlackHole(nowMs);
    }

    // The Cardinal's own finale - a timed countdown, not a hit that kills
    // it (see Cardinal.isDetonationReady's own doc comment). Resolved
    // here rather than inside updateCardinalAttacks() since it also
    // needs to run the frame *after* the stage-clear check below would
    // otherwise have nothing left to wait for.
    if (this.cardinal?.phase === 'critical' && this.cardinal.isDetonationReady(nowMs)) {
      this.resolveCardinalDetonation(nowMs);
    }

    // Extended once The Fracture is in play (docs/roadmap.md): the stage
    // isn't actually clear until it's dead too - not just the Core, every
    // Fragment and every Swarm bit it split into - not just the rocks.
    // "Must defeat The Fracture fully," decided. No effect before it
    // exists (all three are already empty/undefined either way).
    if (this.asteroids.length === 0 && !this.isBossEncounterActive()) {
      this.enterStageClear();
    }
  }

  /**
   * True from the moment a boss's Core materializes until its fight is
   * fully over (The Fracture: through the last Swarm bit's scrap-
   * collection countdown; The Cardinal: until its own Phase 3 detonation
   * resolves) - gates the stage-clear check above, Black Hole spawning,
   * and the UFO spawn cap above, generically across whichever boss is
   * actually in play. Named generically rather than
   * `isFractureEncounterActive` now that these rules apply to "all
   * bosses, current and future," decided.
   */
  private isBossEncounterActive(): boolean {
    return (
      this.fracture !== undefined ||
      this.fractureFragments.length > 0 ||
      this.scrapCountdownEndsAtMs !== undefined ||
      this.cardinal !== undefined
    );
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

  private spawnBlackHole(nowMs: number): void {
    this.blackHole = new BlackHole(this, this.pickBlackHoleSpawnPosition());
    this.blackHoleSpawnedAtMs = nowMs;
    this.blackHoleWarningPlayed = false; // ready to warn again for the *next* spawn cycle
  }

  /** The hole's own "it's gone now" beat - same burst/shake feedback as any other destruction, in its own violet rather than staying silent. Starts the `pauseDurationMs` clock. */
  private despawnBlackHole(nowMs: number): void {
    if (!this.blackHole) return;
    this.spawnBurst(this.blackHole.position, COLORS.blackHole, EFFECTS.shipBurst);
    this.shakeCamera(EFFECTS.minorShake);
    this.blackHole.destroy();
    this.blackHole = undefined;
    this.blackHoleDespawnedAtMs = nowMs;
  }

  /** Avoids spawning directly on top of an active ship or (Cooperative only) the Space Station - a few random attempts, then gives up and uses whatever the last attempt was rather than risk looping forever. */
  private pickBlackHoleSpawnPosition(): Vector2 {
    const maxAttempts = 20;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const candidate = { x: Math.random() * ARENA_WIDTH, y: Math.random() * ARENA_HEIGHT };

      const farFromStation =
        !this.spaceStation ||
        Math.hypot(candidate.x - this.spaceStation.position.x, candidate.y - this.spaceStation.position.y) >=
          BLACK_HOLE.minDistanceFromStation;

      const farFromShips = this.players.every(
        (player) =>
          !player.ship.isAlive ||
          Math.hypot(candidate.x - player.ship.position.x, candidate.y - player.ship.position.y) >=
            BLACK_HOLE.minDistanceFromShips,
      );

      if (farFromStation && farFromShips) return candidate;
      if (attempt === maxAttempts - 1) return candidate;
    }
    return { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 }; // unreachable - satisfies the return type
  }

  /**
   * The escapable outer band, applied to every entity type the hole
   * affects (decided: pulls everything, not just ships) - a real Matter
   * force, not an override, so it blends with whatever else is already
   * pushing an object around this frame (a ship's own thrust, most
   * importantly). Must run before this frame's per-entity update() calls
   * - see the call site's own comment for why that ordering matters.
   */
  private applyBlackHoleGravityForces(): void {
    const hole = this.blackHole;
    if (!hole) return;

    const applyGravity = (visual: MatterGameObject<Phaser.GameObjects.Graphics>, position: Vector2): void => {
      const force = computeGravityForce(
        position,
        hole.position,
        BLACK_HOLE.gravityRadius,
        BLACK_HOLE.eventHorizonRadius,
        BLACK_HOLE.pullForceMax,
      );
      if (force.x !== 0 || force.y !== 0) {
        visual.applyForce(new Phaser.Math.Vector2(force.x, force.y));
      }
    };

    this.players.forEach((player) => {
      if (player.ship.isAlive) applyGravity(player.ship.visual, player.ship.position);
    });
    this.asteroids.forEach((asteroid) => {
      if (asteroid.isAlive) applyGravity(asteroid.visual, asteroid.position);
    });
    this.ufos.forEach((ufo) => {
      if (ufo.isAlive) applyGravity(ufo.visual, ufo.position);
    });
    this.shields.forEach((shield) => {
      if (shield.isAlive) applyGravity(shield.visual, shield.position);
    });
    this.commanders.forEach((commander) => {
      if (commander.isAlive && commander.isAdrift) applyGravity(commander.visual, commander.position);
    });
  }

  /**
   * The gravity-role Fragment's own attack ("acts like a small black
   * hole, attracts everything 3x the size of itself," decided) - reuses
   * `computeGravityForce` directly rather than a second pull-force
   * implementation. Same entity scope as the Black Hole's own pull
   * (ships/asteroids/UFOs/shields/adrift Commanders) for "everything";
   * other Fracture pieces don't pull each other. Must run here, before
   * this frame's per-entity update() calls, same ordering reason as
   * applyBlackHoleGravityForces() above.
   */
  private applyFractureGravityForces(): void {
    const gravityFragments = this.fractureFragments.filter((f) => f.role === 'gravity' && f.isAlive);
    if (gravityFragments.length === 0) return;

    const pullRadius = FRACTURE.fragmentRadius * FRACTURE.gravityPullRadiusMultiplier;
    const applyGravity = (visual: MatterGameObject<Phaser.GameObjects.Graphics>, position: Vector2): void => {
      gravityFragments.forEach((fragment) => {
        const force = computeGravityForce(
          position,
          fragment.position,
          pullRadius,
          FRACTURE.fragmentRadius,
          FRACTURE.gravityPullForceMax,
        );
        if (force.x !== 0 || force.y !== 0) {
          visual.applyForce(new Phaser.Math.Vector2(force.x, force.y));
        }
      });
    };

    this.players.forEach((player) => {
      if (player.ship.isAlive) applyGravity(player.ship.visual, player.ship.position);
    });
    this.asteroids.forEach((asteroid) => {
      if (asteroid.isAlive) applyGravity(asteroid.visual, asteroid.position);
    });
    this.ufos.forEach((ufo) => {
      if (ufo.isAlive) applyGravity(ufo.visual, ufo.position);
    });
    this.shields.forEach((shield) => {
      if (shield.isAlive) applyGravity(shield.visual, shield.position);
    });
    this.commanders.forEach((commander) => {
      if (commander.isAlive && commander.isAdrift) applyGravity(commander.visual, commander.position);
    });
  }

  /**
   * Everything Fracture-attack-related that needs to check against ship
   * positions each frame. Firing *readiness* lives on the entities
   * themselves (`Fracture.canFireLaser`, `FractureFragment.canFireShard`)
   * - this is the "does the currently-active attack actually touch a
   * ship" half, plus the two attacks that need GameScene to spawn
   * something (a laser, a shard) rather than just reporting a hit
   * radius. Same split as Black Hole: the hazard owns its own timing,
   * GameScene owns hit-testing against everything else.
   */
  private updateFractureAttacks(nowMs: number): void {
    if (this.fracture?.canFireLaser(nowMs)) {
      this.spawnFractureLaser(this.fracture.position, nowMs);
      this.fracture.recordLaserFired(nowMs);
    }

    this.fractureLasers.forEach((laser) => {
      if (!laser.isActive(nowMs)) return;
      this.players.forEach((player) => {
        if (!player.ship.isAlive || player.ship.isInvulnerable(nowMs)) return;
        if (
          isPointOnBeam(player.ship.position, laser.origin, laser.angleRad, FRACTURE.laserLength, FRACTURE.laserWidth) &&
          !this.pendingShipHits.includes(player.ship)
        ) {
          this.pendingShipHits.push(player.ship);
        }
      });
    });

    this.fractureFragments.forEach((fragment) => {
      if (!fragment.isAlive) return;

      if (fragment.role === 'aggressive') {
        const ringRadius = fragment.currentRingHitRadius(nowMs);
        if (ringRadius !== undefined) {
          this.players.forEach((player) => {
            if (!player.ship.isAlive || player.ship.isInvulnerable(nowMs)) return;
            const distance = Math.hypot(
              player.ship.position.x - fragment.position.x,
              player.ship.position.y - fragment.position.y,
            );
            if (distance <= ringRadius && !this.pendingShipHits.includes(player.ship)) {
              this.pendingShipHits.push(player.ship);
            }
          });
        }
      }

      if (fragment.role === 'launcher' && fragment.canFireShard(nowMs)) {
        // "In direction of any ship," decided: a random living ship, not
        // necessarily the nearest - unlike the UFO's own lead-aim targeting.
        const livingShips = this.players.filter((p) => p.ship.isAlive).map((p) => p.ship);
        if (livingShips.length > 0) {
          const target = livingShips[Math.floor(Math.random() * livingShips.length)]!;
          const heading = Math.atan2(target.position.y - fragment.position.y, target.position.x - fragment.position.x);
          this.fractureShards.push(new FractureShard(this, fragment.position, heading, nowMs));
        }
        fragment.recordShardFired(nowMs);
      }
    });
  }

  private spawnFractureLaser(origin: Vector2, nowMs: number): void {
    const angle = Math.random() * Math.PI * 2;
    this.fractureLasers.push(new FractureLaser(this, origin, angle, nowMs));
  }

  /**
   * The Cardinal isn't Matter-backed (see its own doc comment), so all
   * three of its interactions - the laser cross vs. ships, projectiles
   * vs. its arms/core, and the ship-ram hazard the core always is - are
   * plain per-frame distance/segment checks here, the same "plain math
   * hazard" pattern `processBlackHoleCaptureAndLethal` and
   * `updateFractureAttacks`'s own laser check already use. The Phase 2
   * plasma ball is the one exception (a real Matter body), fired from
   * here but hit-tested via the normal handleCollision() path.
   */
  private updateCardinalAttacks(nowMs: number): void {
    const cardinal = this.cardinal;
    if (!cardinal) return;

    // Ship-vs-core ram - always active, every phase, same "behaves like
    // a rock" precedent The Fracture's own Core already set. Arms are
    // deliberately not a ram hazard (only their laser is dangerous) -
    // see CARDINAL's own doc comment in GameConfig.ts.
    this.players.forEach((player) => {
      if (!player.ship.isAlive || player.ship.isInvulnerable(nowMs)) return;
      const distance = Math.hypot(player.ship.position.x - cardinal.position.x, player.ship.position.y - cardinal.position.y);
      if (distance <= CARDINAL.coreRadius && !this.pendingShipHits.includes(player.ship)) {
        this.pendingShipHits.push(player.ship);
      }
    });

    if (cardinal.phase === 'armed') {
      for (let armIndex = 0; armIndex < CARDINAL.armCount; armIndex += 1) {
        if (!cardinal.isArmAlive(armIndex)) continue;
        const angle = cardinal.armAngleRad(armIndex);

        // Firing beam vs. ships - full laserLength from the core's own
        // center, same shape as The Fracture's own laser hit-test.
        if (cardinal.isLaserActiveForArm(armIndex, nowMs)) {
          this.players.forEach((player) => {
            if (!player.ship.isAlive || player.ship.isInvulnerable(nowMs)) return;
            if (
              isPointOnBeam(player.ship.position, cardinal.position, angle, CARDINAL.laserLength, CARDINAL.laserWidth) &&
              !this.pendingShipHits.includes(player.ship)
            ) {
              this.pendingShipHits.push(player.ship);
            }
          });
        }

        // Projectile vs. this specific arm's physical span (inner radius
        // to cannon tip) - independent of whether it's currently firing,
        // an arm can be shot any time it's alive.
        const direction = fromAngle(angle);
        const armStart = {
          x: cardinal.position.x + direction.x * CARDINAL.armInnerRadius,
          y: cardinal.position.y + direction.y * CARDINAL.armInnerRadius,
        };
        const armEnd = {
          x: cardinal.position.x + direction.x * CARDINAL.armReach,
          y: cardinal.position.y + direction.y * CARDINAL.armReach,
        };
        this.projectiles.forEach((projectile) => {
          if (!projectile.isAlive) return;
          if (distanceToSegment(projectile.position, armStart, armEnd) <= CARDINAL.armHitWidth / 2) {
            if (!this.pendingCardinalArmHits.some((hit) => hit.projectile === projectile)) {
              this.pendingCardinalArmHits.push({ armIndex, projectile });
            }
          }
        });
      }
    } else if (cardinal.phase === 'coreExposed') {
      // Core becomes a valid target only once every arm is down.
      this.projectiles.forEach((projectile) => {
        if (!projectile.isAlive) return;
        const distance = Math.hypot(projectile.position.x - cardinal.position.x, projectile.position.y - cardinal.position.y);
        if (distance <= CARDINAL.coreRadius && !this.pendingCardinalCoreHits.some((hit) => hit.projectile === projectile)) {
          this.pendingCardinalCoreHits.push({ projectile });
        }
      });

      if (cardinal.canFirePlasma(nowMs)) {
        const target = this.nearestAliveShip(cardinal.position);
        if (target) {
          const heading = computeLeadAimHeading(cardinal.position, target.ship.position, target.ship.velocity, CARDINAL.plasmaSpeed);
          this.cardinalPlasmaBalls.push(new CardinalPlasmaBall(this, cardinal.position, heading, nowMs));
        }
        cardinal.recordPlasmaFired(nowMs);
      }
    }
  }

  /**
   * The inescapable inner band (capture) and the lethal center, applied
   * after this frame's per-entity update() calls - see the call site's
   * comment. Ships route a non-survivable hit through the existing
   * `pendingShipHits` queue (same Cooperative-eject/Competitive-lives
   * handling as every other hazard); asteroids/UFO/Shield/Commander
   * reuse their own existing pending-hit queues the same way, rather
   * than duplicating that logic here.
   */
  private processBlackHoleCaptureAndLethal(nowMs: number): void {
    const hole = this.blackHole;
    if (!hole) return;

    const captureIfNeeded = (visual: MatterGameObject<Phaser.GameObjects.Graphics>, position: Vector2): void => {
      if (!isCaptured(position, hole.position, BLACK_HOLE.eventHorizonRadius)) return;
      const velocity = computeCaptureVelocity(
        position,
        hole.position,
        BLACK_HOLE.eventHorizonRadius,
        BLACK_HOLE.captureBaseSpeed,
        BLACK_HOLE.captureAccelerationPerPx,
      );
      visual.setVelocity(velocity.x, velocity.y);
    };

    this.players.forEach((player) => {
      const ship = player.ship;
      if (!ship.isAlive) return;
      if (isLethal(ship.position, hole.position, BLACK_HOLE.lethalRadius)) {
        if (ship.isInvulnerable(nowMs)) return;
        if (ship.hasShield) {
          ship.consumeShield();
          this.ejectShipFromBlackHole(ship, hole.position, nowMs);
        } else if (!this.pendingShipHits.includes(ship)) {
          this.pendingShipHits.push(ship);
        }
        return;
      }
      captureIfNeeded(ship.visual, ship.position);
    });

    this.asteroids.forEach((asteroid) => {
      if (!asteroid.isAlive) return;
      if (isLethal(asteroid.position, hole.position, BLACK_HOLE.lethalRadius)) {
        // No split, unlike a shot destroying it - consumed whole, not shattered.
        this.spawnBurst(asteroid.position, COLORS.asteroid, EFFECTS.asteroidBurst);
        asteroid.destroy();
        return;
      }
      captureIfNeeded(asteroid.visual, asteroid.position);
    });

    this.ufos.forEach((ufo) => {
      if (!ufo.isAlive) return;
      if (isLethal(ufo.position, hole.position, BLACK_HOLE.lethalRadius)) {
        // Same "hazard-killed, not shot" no-score rule as an asteroid/ship ram.
        if (!this.pendingUfoHits.some((hit) => hit.ufo === ufo)) {
          this.pendingUfoHits.push({ ufo, projectile: undefined, awardScore: false });
        }
        return;
      }
      captureIfNeeded(ufo.visual, ufo.position);
    });

    this.shields.forEach((shield) => {
      if (!shield.isAlive) return;
      if (isLethal(shield.position, hole.position, BLACK_HOLE.lethalRadius)) {
        shield.destroy();
        return;
      }
      captureIfNeeded(shield.visual, shield.position);
    });

    this.commanders.forEach((commander) => {
      if (!commander.isAlive || !commander.isAdrift) return;
      if (isLethal(commander.position, hole.position, BLACK_HOLE.lethalRadius)) {
        if (!this.pendingCommanderHazardHits.includes(commander)) {
          this.pendingCommanderHazardHits.push(commander);
        }
        return;
      }
      captureIfNeeded(commander.visual, commander.position);
    });
  }

  /** A shield absorbing the lethal center doesn't just "not die" - "the shield's energy discharge blows you back out," a judgment call (not asked about explicitly): teleported just past the event horizon along the same line it was pulled in on, with an outward velocity burst and a brief invulnerability window so it can't be immediately recaptured before the player reacts. */
  private ejectShipFromBlackHole(ship: Ship, holeCenter: Vector2, nowMs: number): void {
    const away = normalize({ x: ship.position.x - holeCenter.x, y: ship.position.y - holeCenter.y });
    const direction = away.x === 0 && away.y === 0 ? { x: 1, y: 0 } : away;
    const ejectDistance = BLACK_HOLE.eventHorizonRadius + 20;

    ship.visual.setPosition(holeCenter.x + direction.x * ejectDistance, holeCenter.y + direction.y * ejectDistance);
    ship.visual.setVelocity(direction.x * BLACK_HOLE.shieldEjectSpeed, direction.y * BLACK_HOLE.shieldEjectSpeed);
    ship.grantInvulnerability(nowMs, BLACK_HOLE.shieldEjectInvulnerabilityMs);
    this.spawnBurst(ship.position, COLORS.shield, EFFECTS.shipBurst);
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
    const fracture = entityA instanceof Fracture ? entityA : entityB instanceof Fracture ? entityB : undefined;
    const fractureFragment =
      entityA instanceof FractureFragment ? entityA : entityB instanceof FractureFragment ? entityB : undefined;
    const fractureSwarmBit =
      entityA instanceof FractureSwarmBit ? entityA : entityB instanceof FractureSwarmBit ? entityB : undefined;
    const fractureShard =
      entityA instanceof FractureShard ? entityA : entityB instanceof FractureShard ? entityB : undefined;
    const cardinalPlasma =
      entityA instanceof CardinalPlasmaBall ? entityA : entityB instanceof CardinalPlasmaBall ? entityB : undefined;

    // Core and Fragment: shootable (CATEGORY.PROJECTILE) and now also
    // "behave like rocks," decided - CATEGORY.SHIP too, resolved via the
    // exact same pendingShipHits path an asteroid ram already uses (see
    // that branch further below) - takes no damage from the contact
    // itself, same as an asteroid doesn't from ramming a ship.
    if (projectile?.isAlive && fracture?.isAlive) {
      if (!this.pendingFractureCoreHits.some((hit) => hit.projectile === projectile)) {
        this.pendingFractureCoreHits.push({ projectile });
      }
      return;
    }

    if (projectile?.isAlive && fractureFragment?.isAlive) {
      if (!this.pendingFractureFragmentHits.some((hit) => hit.projectile === projectile)) {
        this.pendingFractureFragmentHits.push({ fragment: fractureFragment, projectile });
      }
      return;
    }

    if (ship?.isAlive && (fracture?.isAlive || fractureFragment?.isAlive)) {
      if (!ship.isInvulnerable(nowMs) && !this.pendingShipHits.includes(ship)) {
        this.pendingShipHits.push(ship);
      }
      return;
    }

    // Swarm: always safe, decided - a pickup (pendingScrapPickups), never a pendingShipHits entry. Its own mask no longer includes CATEGORY.PROJECTILE at all (see FractureSwarmBit's doc comment), so this is the only pair it can appear in.
    if (ship?.isAlive && fractureSwarmBit?.isAlive) {
      if (!this.pendingScrapPickups.some((pickup) => pickup.swarmBit === fractureSwarmBit)) {
        this.pendingScrapPickups.push({ ship, swarmBit: fractureSwarmBit });
      }
      return;
    }

    if (ship?.isAlive && fractureShard?.isAlive) {
      // Unconditionally queued (unlike the ship-contact branch above) -
      // the shard is always consumed on contact, same as a UfoShot is;
      // only whether it actually *hurts* the ship depends on
      // invulnerability, checked at resolve time below.
      if (!this.pendingFractureShardHits.some((hit) => hit.shard === fractureShard)) {
        this.pendingFractureShardHits.push({ ship, shard: fractureShard });
      }
      return;
    }

    // The Cardinal's own Phase 2 attack - same "always consumed on
    // contact, invulnerability checked at resolve time" shape as
    // FractureShard just above. The rest of The Cardinal (arms, core,
    // ram) isn't Matter-backed at all, so this is the only Cardinal-
    // related pair that can ever reach handleCollision().
    if (ship?.isAlive && cardinalPlasma?.isAlive) {
      if (!this.pendingCardinalPlasmaHits.some((hit) => hit.plasma === cardinalPlasma)) {
        this.pendingCardinalPlasmaHits.push({ ship, plasma: cardinalPlasma });
      }
      return;
    }

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
  ):
    | Asteroid
    | Projectile
    | Ship
    | Shield
    | Ufo
    | UfoShot
    | Commander
    | Fracture
    | FractureFragment
    | FractureSwarmBit
    | FractureShard
    | CardinalPlasmaBall
    | undefined {
    const gameObject = body.gameObject as Phaser.GameObjects.GameObject | undefined;
    return gameObject?.getData('entity') as
      | Asteroid
      | Projectile
      | Ship
      | Shield
      | Ufo
      | UfoShot
      | Commander
      | Fracture
      | FractureFragment
      | FractureSwarmBit
      | FractureShard
      | CardinalPlasmaBall
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
      // Competitive's own leaderboard, decided - "behave like the one
      // for single player": the winner's own score is the one number a
      // Competitive round actually produces, checked the same way
      // Single Player's own score already is. Pausing here (not
      // waiting for the fetch) freezes the round immediately either way.
      this.matter.world.pause();
      const winner = this.players.find((p) => p.slotIndex === outcome.winnerIndex);
      void this.finishCompetitiveRound(outcome.winnerIndex, this.scores[outcome.winnerIndex] ?? 0, winner);
    } else if (outcome.status === 'draw') {
      // No single score a draw could attribute to a leaderboard entry -
      // straight to the normal overlay, same as before this feature.
      this.enterGameOver(['DRAW', 'PRESS ANY KEY FOR MAIN MENU']);
    } else if (this.mode === 'singlePlayer') {
      this.matter.world.pause();
      void this.finishSinglePlayerRound(this.scores[0] ?? 0);
    } else {
      // Cooperative loss (see RoundOutcome.ts - Competitive never
      // reaches this branch, Single Player is handled above). The
      // pooled team score is the one number the whole team already
      // sees (refreshAllPlayerHud's own pooledScore) - "behave like the
      // one for single player" applied to a shared result instead of an
      // individual one.
      this.matter.world.pause();
      void this.finishCooperativeRound(this.scores.reduce((sum, score) => sum + score, 0));
    }
  }

  /** Fetches the current leaderboard, decides whether `finalScore` qualifies (the same check the server itself re-verifies as the actual authority - see HighScoreApi.ts), and either starts initials entry or goes straight to the normal GAME OVER overlay. Shared by all three modes - only which leaderboard, whose input enters initials, and the base overlay lines differ. */
  private async finishSinglePlayerRound(finalScore: number): Promise<void> {
    const leaderboard = await fetchLeaderboard('singlePlayer');
    if (qualifiesForLeaderboard(leaderboard, finalScore)) {
      this.enterInitialsEntry(finalScore, 'singlePlayer', this.players[0]!.input, ['GAME OVER', `SCORE ${finalScore}`]);
      return;
    }

    const topLine = leaderboard[0] ? `TOP SCORE ${leaderboard[0].score}` : 'NO SCORES YET';
    this.enterGameOver(['GAME OVER', `SCORE ${finalScore}`, topLine, 'PRESS ANY KEY FOR MAIN MENU']);
  }

  /** Competitive's own leaderboard check - the winning player's own score, entered with their own input if it qualifies. No winner slot found (shouldn't happen - RoundOutcome.ts only reports a winnerIndex that was alive) degrades to the plain win overlay rather than throwing. */
  private async finishCompetitiveRound(
    winnerIndex: number,
    finalScore: number,
    winner: PlayerSlot | undefined,
  ): Promise<void> {
    const winLine = `PLAYER ${winnerIndex + 1} WINS`;
    if (!winner) {
      this.enterGameOver([winLine, 'PRESS ANY KEY FOR MAIN MENU']);
      return;
    }

    const leaderboard = await fetchLeaderboard('competitive');
    if (qualifiesForLeaderboard(leaderboard, finalScore)) {
      this.enterInitialsEntry(finalScore, 'competitive', winner.input, [winLine, `SCORE ${finalScore}`]);
      return;
    }
    this.enterGameOver([winLine, `SCORE ${finalScore}`, 'PRESS ANY KEY FOR MAIN MENU']);
  }

  /**
   * Cooperative's own leaderboard check - the pooled team score, entered
   * by "whichever player is still alive/last standing," decided
   * (`this.lastEliminatedSlotIndex`, tracked wherever a Cooperative
   * player is actually eliminated - `processCommanderExpiry`,
   * `processPendingCommanderHazardHits`). Cooperative's round only ever
   * ends once *everyone* is eliminated (RoundOutcome.ts has no "win" for
   * this mode), so there's never a truly-still-alive survivor at the
   * exact moment this runs - "last standing" here means the last one to
   * fall, not whoever's currently alive. No tracked slot (shouldn't
   * happen once any player has been eliminated at all) degrades to the
   * plain loss overlay rather than throwing.
   */
  private async finishCooperativeRound(finalScore: number): Promise<void> {
    const enterer = this.players.find((p) => p.slotIndex === this.lastEliminatedSlotIndex);
    if (!enterer) {
      this.enterGameOver(['GAME OVER', `SCORE ${finalScore}`, 'PRESS ANY KEY FOR MAIN MENU']);
      return;
    }

    const leaderboard = await fetchLeaderboard('cooperative');
    if (qualifiesForLeaderboard(leaderboard, finalScore)) {
      this.enterInitialsEntry(finalScore, 'cooperative', enterer.input, ['GAME OVER', `SCORE ${finalScore}`]);
      return;
    }
    this.enterGameOver(['GAME OVER', `SCORE ${finalScore}`, 'PRESS ANY KEY FOR MAIN MENU']);
  }

  /**
   * Classic-arcade 3-letter initials entry, on a qualifying score in any
   * of the three modes now. Reuses whichever player's input the caller
   * hands in (`this.players[0].input` for Single Player, the winner's
   * for Competitive, whoever was last eliminated for Cooperative - see
   * each `finishXRound` method) - `turnDirection` (edge-triggered)
   * cycles the active slot's letter A-Z, `isFiring` (edge-triggered)
   * confirms and advances; confirming the third slot submits (to that
   * mode's own leaderboard, `systems/HighScoreApi.ts`) and proceeds to
   * the normal GAME OVER overlay. Driven by `updateInitialsEntry()`,
   * called from `update()` while `this.state === 'enteringInitials'` -
   * a different per-frame path than every other overlay in this file
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
    mode: GameMode;
    input: PlayerInput;
    baseOverlayLines: string[];
  } | null = null;

  private enterInitialsEntry(
    finalScore: number,
    mode: GameMode,
    input: PlayerInput,
    baseOverlayLines: string[],
  ): void {
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
      mode,
      input,
      baseOverlayLines,
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
    if (!entry) return;
    const input = entry.input;

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
    const mode = entry.mode;
    const baseLines = entry.baseOverlayLines;

    [entry.titleText, entry.scoreText, entry.instructionText, ...entry.letterTexts].forEach((text) =>
      text.destroy(),
    );
    this.initialsEntry = null;

    void submitHighScore(initials, finalScore, mode).then((result) => {
      this.enterGameOver([
        ...baseLines,
        ...(result.accepted ? ['NEW HIGH SCORE!'] : []),
        'PRESS ANY KEY FOR MAIN MENU',
      ]);
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
      if (player) {
        player.eliminated = true;
        this.lastEliminatedSlotIndex = player.slotIndex;
      }
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
      if (player) {
        player.eliminated = true;
        this.lastEliminatedSlotIndex = player.slotIndex;
      }
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
        this.awardScore(projectile.ownerIndex, UFO.score, position);
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

  /**
   * Phase 1 (Core): a hit decrements hitsRemaining and, once that
   * reaches zero, spawns Phase 2's three Fragments in its place rather
   * than ending the encounter outright. Hits landed while it's still
   * materializing are no-ops (Fracture.takeHit already guards this) -
   * the shot is still consumed either way, it just doesn't count.
   */
  private processPendingFractureCoreHits(nowMs: number): void {
    if (this.pendingFractureCoreHits.length === 0) return;
    const hits = this.pendingFractureCoreHits;
    this.pendingFractureCoreHits = [];
    const fracture = this.fracture;
    for (const { projectile } of hits) {
      projectile.destroy();
      if (!fracture?.isAlive) continue;

      const destroyed = fracture.takeHit(nowMs);
      if (!destroyed) {
        this.spawnBurst(fracture.position, COLORS.fracture, EFFECTS.asteroidBurst);
        continue;
      }

      const position = fracture.position;
      fracture.destroy();
      this.fracture = undefined;
      this.spawnBurst(position, COLORS.fracture, EFFECTS.ufoBurst);
      this.sound.play(SHIP_DESTROYED_SFX_KEY, { volume: getSfxVolume() });
      this.shakeCamera(EFFECTS.majorShake);
      this.awardScore(projectile.ownerIndex, FRACTURE.score, position);
      this.spawnFractureFragments(position, nowMs);
    }
  }

  /** One of each role, decided - not three random ones, so every Phase 2 always has all three flavors present rather than possibly rolling three of the same. Spawned at the Core's own death position, same convention as an asteroid's children. */
  private spawnFractureFragments(position: Vector2, nowMs: number): void {
    const roles: FractureFragmentRole[] = ['aggressive', 'gravity', 'launcher'];
    roles.forEach((role, i) => {
      const heading = (i / roles.length) * Math.PI * 2 + Math.random() * 0.5;
      this.fractureFragments.push(new FractureFragment(this, position, role, heading, nowMs));
    });
  }

  /** Phase 2 (Fragment): a hit decrements hitsRemaining and, once that reaches zero, spawns FRACTURE.swarmCountPerFragment Phase 3 Swarm bits scattering outward from where it died. */
  private processPendingFractureFragmentHits(nowMs: number): void {
    if (this.pendingFractureFragmentHits.length === 0) return;
    const hits = this.pendingFractureFragmentHits;
    this.pendingFractureFragmentHits = [];
    for (const { fragment, projectile } of hits) {
      projectile.destroy();
      if (!fragment.isAlive) continue;

      const destroyed = fragment.takeHit(nowMs);
      if (!destroyed) {
        this.spawnBurst(fragment.position, COLORS.fracture, EFFECTS.asteroidBurst);
        continue;
      }

      const position = fragment.position;
      fragment.destroy();
      this.spawnBurst(position, COLORS.fracture, EFFECTS.asteroidBurst);
      this.shakeCamera(EFFECTS.minorShake);
      this.awardScore(projectile.ownerIndex, FRACTURE.fragmentScore, position);
      this.spawnFractureSwarm(position, nowMs);

      // "Once last Fragment is dead, launch a 10 sec countdown," decided
      // - checked here (not after the later array-filter step) since
      // this fragment is still physically in fractureFragments until
      // update()'s cleanup runs later this same frame.
      if (this.fractureFragments.every((f) => !f.isAlive)) {
        this.beginScrapCountdown(nowMs);
      }
    }
  }

  private spawnFractureSwarm(position: Vector2, nowMs: number): void {
    for (let i = 0; i < FRACTURE.swarmCountPerFragment; i += 1) {
      const heading = (i / FRACTURE.swarmCountPerFragment) * Math.PI * 2 + Math.random() * 0.5;
      this.fractureSwarm.push(new FractureSwarmBit(this, position, heading, nowMs));
    }
  }

  private beginScrapCountdown(nowMs: number): void {
    this.scrapCountdownEndsAtMs = nowMs + FRACTURE.scrapCollectionMs;
    this.scrapCountdownText = this.add
      .text(ARENA_WIDTH / 2, 40, '', { fontFamily: 'monospace', fontSize: '20px', color: toCssHex(COLORS.fracture) })
      .setOrigin(0.5, 0);
  }

  /** Ticks the on-screen countdown every frame; once it runs out, whatever scrap is left just goes with it - "optional bonus, not required for stage clear" (the whole reason this is a countdown and not a hard collect-everything gate). */
  private updateScrapCountdown(nowMs: number): void {
    if (this.scrapCountdownEndsAtMs === undefined) return;

    const remainingMs = this.scrapCountdownEndsAtMs - nowMs;
    if (remainingMs <= 0) {
      this.fractureSwarm.forEach((swarmBit) => swarmBit.destroy());
      this.fractureSwarm = [];
      this.scrapCountdownText?.destroy();
      this.scrapCountdownText = undefined;
      this.scrapCountdownEndsAtMs = undefined;
      return;
    }

    this.scrapCountdownText?.setText(`COLLECT SCRAP: ${Math.ceil(remainingMs / 1000)}s`);
  }

  /** Always safe (decided) - never lethal, just +1 scrap for whichever player touched it. Mirrors processPendingShieldPickups's shape exactly. */
  private processPendingScrapPickups(nowMs: number): void {
    if (this.pendingScrapPickups.length === 0) return;
    const pickups = this.pendingScrapPickups;
    this.pendingScrapPickups = [];
    for (const { ship, swarmBit } of pickups) {
      if (!swarmBit.isAlive || swarmBit.isMaterializing(nowMs)) continue;
      const player = this.players.find((p) => p.ship === ship);
      if (!player) continue;

      const position = swarmBit.position;
      swarmBit.destroy();
      player.scrap += 1;
      this.refreshAllPlayerHud();
      this.sound.play(SHIELD_PICKUP_SFX_KEY, { volume: getSfxVolume() }); // no dedicated scrap pickup SFX yet - reusing the closest existing "pickup" sound
      this.spawnBurst(position, COLORS.fracture, EFFECTS.asteroidBurst);
    }
  }

  /** The launcher Fragment's shot - kills an unshielded ship on contact, same generic pendingShipHits path every other hazard already uses. The shard itself is always destroyed on contact, invulnerable ship or not - same as a UfoShot. */
  private processPendingFractureShardHits(nowMs: number): void {
    if (this.pendingFractureShardHits.length === 0) return;
    const hits = this.pendingFractureShardHits;
    this.pendingFractureShardHits = [];
    for (const { ship, shard } of hits) {
      if (shard.isAlive) shard.destroy();
      if (ship.isAlive && !ship.isInvulnerable(nowMs) && !this.pendingShipHits.includes(ship)) {
        this.pendingShipHits.push(ship);
      }
    }
  }

  /** A hit decrements that specific arm's own 20 HP; once it reaches zero the arm explodes into scrap (reusing FractureSwarmBit - see this.fractureSwarm's own doc comment for why) and goes dark, but the fight continues - The Cardinal itself is never destroyed by this alone. */
  private processPendingCardinalArmHits(nowMs: number): void {
    if (this.pendingCardinalArmHits.length === 0) return;
    const hits = this.pendingCardinalArmHits;
    this.pendingCardinalArmHits = [];
    const cardinal = this.cardinal;
    for (const { armIndex, projectile } of hits) {
      projectile.destroy();
      if (!cardinal?.isAlive || !cardinal.isArmAlive(armIndex)) continue;

      const destroyed = cardinal.takeArmHit(armIndex, nowMs);
      const armPosition = cardinal.armWorldPosition(armIndex);
      if (!destroyed) {
        this.spawnBurst(armPosition, COLORS.cardinal, EFFECTS.asteroidBurst);
        continue;
      }

      this.spawnBurst(armPosition, COLORS.cardinal, EFFECTS.ufoBurst);
      this.shakeCamera(EFFECTS.minorShake);
      this.awardScore(projectile.ownerIndex, CARDINAL.armScore, armPosition);
      // "Collectible until the boss finally exploded," decided - no
      // countdown, unlike beginScrapCountdown()'s 10s window below.
      this.fractureSwarm.push(new FractureSwarmBit(this, armPosition, Math.random() * Math.PI * 2, nowMs));
      this.fractureSwarm.push(new FractureSwarmBit(this, armPosition, Math.random() * Math.PI * 2, nowMs));
    }
  }

  /** Only reachable once every arm is down (Phase 2) - a hit decrements the core's own 20 HP; once it reaches zero the fight enters Phase 3 (Cardinal.update() picks up the phase transition and starts the detonation countdown on its own - see resolveCardinalDetonation for what happens once that timer runs out). */
  private processPendingCardinalCoreHits(nowMs: number): void {
    if (this.pendingCardinalCoreHits.length === 0) return;
    const hits = this.pendingCardinalCoreHits;
    this.pendingCardinalCoreHits = [];
    const cardinal = this.cardinal;
    for (const { projectile } of hits) {
      projectile.destroy();
      if (!cardinal?.isAlive) continue;

      const destroyed = cardinal.takeCoreHit(nowMs);
      if (!destroyed) {
        this.spawnBurst(cardinal.position, COLORS.cardinal, EFFECTS.asteroidBurst);
        continue;
      }

      this.spawnBurst(cardinal.position, COLORS.ufo, EFFECTS.ufoBurst);
      this.shakeCamera(EFFECTS.majorShake);
      this.awardScore(projectile.ownerIndex, CARDINAL.coreScore, cardinal.position);
    }
  }

  /** The plasma ball always destroys itself on contact, same as a UfoShot/FractureShard - only whether it actually hurts the ship depends on invulnerability, checked here. */
  private processPendingCardinalPlasmaHits(nowMs: number): void {
    if (this.pendingCardinalPlasmaHits.length === 0) return;
    const hits = this.pendingCardinalPlasmaHits;
    this.pendingCardinalPlasmaHits = [];
    for (const { ship, plasma } of hits) {
      if (plasma.isAlive) plasma.destroy();
      if (ship.isAlive && !ship.isInvulnerable(nowMs) && !this.pendingShipHits.includes(ship)) {
        this.pendingShipHits.push(ship);
      }
    }
  }

  /**
   * The Phase 3 countdown's own payoff - a timed detonation, not a hit
   * that kills it (score for actually defeating it was already awarded
   * the moment the core died, processPendingCardinalCoreHits above).
   * "Large lethal radius... players need to take distance," decided -
   * any ship still inside CARDINAL.detonationMaxRadius dies outright,
   * same pendingShipHits path every other hazard uses. Any uncollected
   * arm-scrap goes with it - "collectible until the boss finally
   * exploded," decided.
   */
  private resolveCardinalDetonation(nowMs: number): void {
    const cardinal = this.cardinal;
    if (!cardinal) return;
    const position = cardinal.position;

    this.players.forEach((player) => {
      if (!player.ship.isAlive || player.ship.isInvulnerable(nowMs)) return;
      const distance = Math.hypot(player.ship.position.x - position.x, player.ship.position.y - position.y);
      if (distance <= CARDINAL.detonationMaxRadius && !this.pendingShipHits.includes(player.ship)) {
        this.pendingShipHits.push(player.ship);
      }
    });

    this.fractureSwarm.forEach((swarmBit) => swarmBit.destroy());
    this.fractureSwarm = [];
    cardinal.destroy();
    this.cardinal = undefined;
    this.hideCardinalHealthBar();

    this.spawnBurst(position, COLORS.ufo, EFFECTS.ufoBurst);
    this.sound.play(SHIP_DESTROYED_SFX_KEY, { volume: getSfxVolume() });
    this.shakeCamera(EFFECTS.majorShake);
  }

  /** "One consolidated bar below the boss," decided - a single Rectangle fill + border + label, created lazily on first use (materializeCardinal()) and torn down once the fight resolves, same lazy-creation shape scrapCountdownText already uses. Relabels itself Phase 1 "ARMS" -> Phase 2/3 "CORE" as the fight progresses. */
  private updateCardinalHealthBar(): void {
    const cardinal = this.cardinal;
    const border = this.cardinalHealthBarBorder;
    const fill = this.cardinalHealthBarFill;
    const label = this.cardinalHealthBarLabel;
    if (!cardinal || !border || !fill || !label) return;

    const fraction = cardinal.phase === 'armed' ? cardinal.armHpFraction() : cardinal.coreHpFraction();
    // Left-anchored (setOrigin(0, 0.5) at creation) - same "just mutate
    // .width, never reposition" pattern MenuScene's own volume sliders
    // already use, rather than recomputing .x every frame to fake it.
    fill.width = Math.max(0, CARDINAL_HEALTH_BAR.width * fraction);

    const labelText = cardinal.phase === 'armed' ? 'ARMS' : cardinal.phase === 'coreExposed' ? 'CORE' : 'CRITICAL';
    label.setText(labelText);
  }

  /** Positioned below the fixed arena-center boss, since The Cardinal (unlike The Fracture) never moves - a hardcoded offset is safe here in a way it wouldn't be for a drifting boss. */
  private createCardinalHealthBar(): void {
    const centerX = ARENA_WIDTH / 2;
    const barY = ARENA_HEIGHT / 2 + CARDINAL.coreRadius + CARDINAL_HEALTH_BAR.marginTop;
    const barLeft = centerX - CARDINAL_HEALTH_BAR.width / 2;

    this.cardinalHealthBarLabel = this.add
      .text(centerX, barY - 18, 'ARMS', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: toCssHex(COLORS.cardinal),
      })
      .setOrigin(0.5);
    this.cardinalHealthBarBorder = this.add
      .rectangle(centerX, barY, CARDINAL_HEALTH_BAR.width, CARDINAL_HEALTH_BAR.height)
      .setStrokeStyle(2, COLORS.cardinal);
    this.cardinalHealthBarFill = this.add
      .rectangle(barLeft, barY, CARDINAL_HEALTH_BAR.width, CARDINAL_HEALTH_BAR.height - 4, COLORS.cardinal)
      .setOrigin(0, 0.5);
  }

  private hideCardinalHealthBar(): void {
    this.cardinalHealthBarBorder?.destroy();
    this.cardinalHealthBarFill?.destroy();
    this.cardinalHealthBarLabel?.destroy();
    this.cardinalHealthBarBorder = undefined;
    this.cardinalHealthBarFill = undefined;
    this.cardinalHealthBarLabel = undefined;
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

    this.awardScore(projectile.ownerIndex, ASTEROID[size].score, position);

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

  /** `position` is where the hit landed - the score popup spawns there, in the scoring player's own HUD color. */
  private awardScore(ownerIndex: number, amount: number, position: Vector2): void {
    this.scores[ownerIndex] = (this.scores[ownerIndex] ?? 0) + amount;
    this.refreshAllPlayerHud();
    const color = COLORS.players[ownerIndex] ?? COLORS.players[0];
    this.scorePopups.push(new ScorePopup(this, position, color, amount, this.time.now));
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

      // "Next to their life status," decided - appended after the
      // lives/cooperative-status line, only once nonzero so the HUD
      // stays clean before The Fracture's Phase 3 is ever reached.
      if (player.scrap > 0) lines.push(`SCRAP ${player.scrap}`);

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
    // "Moves back after [the boss fight]," decided - only actually away
    // if a boss fight just ended (spaceStationRelocated), so this is a
    // safe no-op on every other stage-clear.
    if (this.spaceStation && this.spaceStationRelocated) {
      this.spaceStation.travelTo({ x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 }, this.time.now, SPACE_STATION.relocateTravelMs);
      this.spaceStationRelocated = false;
    }
  }

  /**
   * "Every normal stage clear is followed by a boss stage, not just the
   * first one," decided - replaces the old `fractureIntroduced` one-time
   * latch with a strict alternation, tracked via `lastStageWasBoss`: a
   * normal stage's own clear triggers a boss next; a boss's own clear
   * (once its fight is fully over - isBossEncounterActive() already
   * gates that) triggers a normal wave next. Starts false, so the very
   * first stage-clear of the round still triggers a boss first, matching
   * the original "after ending stage one" behavior.
   */
  private beginNextLevel(): void {
    this.hideOverlay();
    if (!this.lastStageWasBoss) {
      this.lastStageWasBoss = true;
      this.beginBossAnnouncement(this.pickRandomBoss());
      return;
    }
    this.lastStageWasBoss = false;
    this.state = 'playing';
    this.matter.world.resume();
    this.stageElapsedMs = 0;
    this.playStageMusic(GAMEPLAY_MUSIC_KEY);
    this.resetStageHazards(this.time.now);
    this.spawnWave(ASTEROID.spawnCountPerWave + ASTEROID.waveGrowthPerLevel);
  }

  /**
   * "After every stage and bossfight, start the stage fresh - remove all
   * Black Holes and reset rock count," decided - scoped to a *stage*
   * transition specifically, not a whole-round reset (create() already
   * has its own separate reset block for that). Called from every
   * stage-begin point (this method's own normal-wave branch,
   * materializeFracture(), materializeCardinal()) right before that
   * stage's own spawnWave() call. Clearing `asteroids` here is mostly
   * belt-and-suspenders - stage-clear already requires it to be empty -
   * but guarantees a genuinely fresh count regardless, and the Black
   * Hole despawn matters for real: one can still be actively alive at
   * the exact moment the last asteroid of a stage dies (its own timer is
   * independent of the asteroid count), and would otherwise carry over
   * ticking into the next stage untouched.
   */
  private resetStageHazards(nowMs: number): void {
    this.asteroids = [];
    if (this.blackHole) this.despawnBlackHole(nowMs);
    // "Not before 2 min into any stage," decided - stageElapsedMs resets
    // to 0 right after this call (beginNextLevel()/materializeFracture()/
    // materializeCardinal()), so gating the spawn check on it (below)
    // already gives every stage its own fresh grace period with no
    // extra bookkeeping here. Just needs its own warning-sound flag reset.
    this.blackHoleWarningPlayed = false;
  }

  /** "More bosses are added later," decided - a two-entry pool today (The Fracture, The Cardinal), picked with equal odds. Whoever adds a third boss extends this, not the caller. */
  private pickRandomBoss(): 'fracture' | 'cardinal' {
    return Math.random() < 0.5 ? 'fracture' : 'cardinal';
  }

  /**
   * "A big announcement... 3 seconds," decided - the game's first non-
   * interactive, timed overlay (every other one waits for a keypress
   * instead). Physics stays paused throughout, same as every other
   * overlay state - the player never gets a free hit in before it's
   * actually there. Shared across every boss (see `showBossAnnouncement`
   * below) rather than one method per boss - only which boss actually
   * materializes afterward differs.
   */
  private beginBossAnnouncement(boss: 'fracture' | 'cardinal'): void {
    this.state = 'bossAnnouncement';
    const announcementDurationMs = boss === 'fracture' ? FRACTURE.announcementDurationMs : CARDINAL.announcementDurationMs;
    this.showBossAnnouncement(boss === 'fracture' ? 'THE FRACTURE' : 'THE CARDINAL');
    this.shakeCamera(EFFECTS.majorShake);
    this.relocateSpaceStationForBoss();
    this.time.delayedCall(announcementDurationMs, () => {
      if (boss === 'fracture') this.materializeFracture();
      else this.materializeCardinal();
    });
  }

  /** "The space station moves before the boss fight to a random corner... make the move visible," decided - triggered right as the announcement starts, so the glide (SPACE_STATION.relocateTravelMs) plays out during that same overlay. Cooperative only - other modes have no Space Station to move. */
  private relocateSpaceStationForBoss(): void {
    if (!this.spaceStation) return;
    const corner = BOSS_CORNER_POSITIONS[Math.floor(Math.random() * BOSS_CORNER_POSITIONS.length)]!;
    this.spaceStation.travelTo(corner, this.time.now, SPACE_STATION.relocateTravelMs);
    this.spaceStationRelocated = true;
  }

  /**
   * Shared by every boss's announcement, not just The Fracture's -
   * "all bosses, current and future, introduced by name before the
   * stage," decided. A bigger, boss-colored variant of the plain
   * showOverlay() text, for the extra weight "a BIG announcement"
   * originally asked for.
   */
  private showBossAnnouncement(name: string): void {
    this.overlayTexts = [
      this.add
        .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, name, {
          fontFamily: 'monospace',
          fontSize: '96px',
          fontStyle: 'bold',
          color: toCssHex(COLORS.ufo),
        })
        .setOrigin(0.5),
    ];
  }

  /**
   * Spawns "together with 4 big rocks" (decided) via the existing
   * spawnWave() - no new asteroid-spawn path needed. Fracture.ts owns
   * its own materialize fade/scale-in and drift-to-center from here.
   * resetStageHazards() clears any leftover asteroids/Black Hole first,
   * same "start the stage fresh" treatment every stage-begin point gets.
   */
  private materializeFracture(): void {
    this.hideOverlay();
    this.state = 'playing';
    this.matter.world.resume();
    this.stageElapsedMs = 0;
    this.playStageMusic(FRACTURE_MUSIC_KEY);
    const nowMs = this.time.now;
    this.resetStageHazards(nowMs);
    this.spawnWave(FRACTURE.spawnAsteroidCount);
    this.fracture = new Fracture(this, { x: ARENA_WIDTH / 2, y: FRACTURE_SPAWN_OFFSCREEN_Y }, nowMs);
  }

  /**
   * Unlike The Fracture, The Cardinal never drifts in - it's a permanent
   * fixture at exact arena-center for the entire fight, so it simply
   * appears there already materializing (Cardinal's own fade/scale-in
   * beat) rather than needing a spawn-position + drift-to-center step.
   */
  private materializeCardinal(): void {
    this.hideOverlay();
    this.state = 'playing';
    this.matter.world.resume();
    this.stageElapsedMs = 0;
    this.playStageMusic(CARDINAL_MUSIC_KEY);
    const nowMs = this.time.now;
    this.resetStageHazards(nowMs);
    this.spawnWave(CARDINAL.spawnAsteroidCount);
    this.cardinal = new Cardinal(this, { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 }, nowMs);
    this.createCardinalHealthBar();
  }

  /**
   * Swaps the currently-looping stage-music track - no-op if it's
   * already the requested one, so a normal stage-to-stage transition
   * that doesn't actually change tracks (e.g. two normal stages back to
   * back) never audibly restarts the same song. "Boss stages get their
   * own music, looped, swapping back for normal stages," decided.
   */
  private playStageMusic(key: string): void {
    if (this.currentStageMusicKey === key) return;
    if (this.currentStageMusicKey) stopSound(this, this.currentStageMusicKey);
    this.currentStageMusicKey = key;
    playLoopingSound(this, key, getMusicVolume());
  }

  private enterGameOver(lines: string[]): void {
    this.state = 'gameOver';
    this.matter.world.pause();
    this.showOverlay(lines);
    // "Don't start a new round, go to main menu," decided - was
    // scene.restart({ mode: this.mode }); goToMainMenu() is the exact
    // same cleanup (stops gameplay music/thrust sound) the pause menu's
    // own "MAIN MENU" button already uses, reused rather than duplicated.
    this.waitForKeyPress(() => this.goToMainMenu());
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
    pauseSound(this, this.currentStageMusicKey);
    this.showPauseMenu();
  }

  private exitPaused(): void {
    this.hidePauseMenu();
    this.state = 'playing';
    this.matter.world.resume();
    resumeSound(this, this.currentStageMusicKey);
  }

  private goToMainMenu(): void {
    stopSound(this, this.currentStageMusicKey);
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
