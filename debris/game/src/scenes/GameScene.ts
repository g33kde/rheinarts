import Phaser from 'phaser';
import { pauseSound, playLoopingSound, resumeSound, stopSound } from '../audio/LoopingSound';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  ASTEROID,
  BLACK_HOLE,
  BOSS_STAGE_START,
  CARDINAL,
  COLORS,
  COMMANDER,
  ATTRACT_MODE,
  COMBO,
  EFFECTS,
  FRACTURE,
  HYPERSPACE,
  LIVES_PER_PLAYER,
  PROJECTILE,
  SHIELD,
  SHIP,
  type HullId,
  SPACE_STATION,
  STAGE_RANK,
  TERRAIN,
  UFO,
  SABOTEUR,
  DRIFT_MINE,
  WEAPON_UPGRADES,
} from '../config/GameConfig';
import { PlayfieldBackground } from '../entities/Background';
import { Asteroid } from '../entities/Asteroid';
import { BlackHole } from '../entities/BlackHole';
import { Cardinal } from '../entities/Cardinal';
import { CardinalPlasmaBall } from '../entities/CardinalPlasmaBall';
import { Commander } from '../entities/Commander';
import { DestructionBurst } from '../entities/DestructionBurst';
import { DriftMine } from '../entities/DriftMine';
import { Saboteur } from '../entities/Saboteur';
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
import { AiInput } from '../input/AiInput';
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
import {
  fetchLeaderboard,
  qualifiesForLeaderboard,
  submitHighScore,
} from '../systems/HighScoreApi';
import {
  BLACK_HOLE_APPROACHING_SFX_KEY,
  CARDINAL_MUSIC_KEY,
  FRACTURE_MUSIC_KEY,
  GAMEPLAY_MUSIC_KEY,
  MENU_MUSIC_KEY,
} from '../systems/Music';
import {
  evaluateRoundOutcome,
  GAME_MODE_LABELS,
  type GameMode,
  type RoundOutcome,
} from '../systems/RoundOutcome';
import {
  breakCombo,
  comboMultiplier,
  decayCombo,
  INITIAL_COMBO_STATE,
  registerKill,
  type ComboState,
} from '../systems/ComboMultiplier';
import { Wreck } from '../entities/Wreck';
import { generateTerrain, type KeepOut } from '../systems/ArenaTerrain';
import { computeBotIntent } from '../systems/DemoBot';
import { SnapshotThrottle } from '../systems/SnapshotThrottle';
import { computeStageRank, type StageRankResult } from '../systems/StageRank';
import {
  BOSS_CHOICES,
  FIELD_CHOICES,
  FIELD_MODIFIERS,
  isFieldChoice,
  nextShopRow,
  resolveStageVote,
  type FieldModifiers,
  type StageChoiceId,
  type StageChoiceOption,
} from '../systems/StageChoice';
import { playUfoDestroyedSfx, playUfoShotSfx, playUfoSpawnSfx } from '../systems/ProceduralSfx';
import { computeAsteroidSpawnCount, computeUfoSpawnIntervalMs } from '../systems/StageScaling';
import { pickDropTarget } from '../systems/SaboteurAI';
import { isWithinBlast } from '../systems/DriftMineBlast';
import { NetworkClientSession, NetworkHostSession } from '../systems/NetworkSession';
import type { RtcConnection } from '../systems/RtcConnection';
import {
  isNewerTick,
  type EntitySnapshot,
  type GameSnapshot,
  type PlayerHudSnapshot,
  type ShipSnapshot,
  type ShopPanelSnapshot,
  type ShopRowSnapshot,
  type ShopSnapshot,
} from '../systems/NetworkSnapshotProtocol';
import { EntityMirrorRegistry } from '../systems/EntityMirrorRegistry';
import { formatPlayerHud, type PlayerHudData } from '../systems/PlayerHudFormat';
import { generateAsteroidPoints, pickShapeFamily } from '../systems/AsteroidShape';
import { ringLethalRadiusAt, ringPhaseAt } from '../systems/FractureRing';
import type { SwarmBitKind } from '../entities/FractureSwarmBit';
import { RemoteInput } from '../input/RemoteInput';
import {
  ASTEROID_HIT_SFX_KEY,
  SHIELD_PICKUP_SFX_KEY,
  SHIP_DESTROYED_SFX_KEY,
  SHOT_SFX_KEY,
  THRUST_SFX_KEY,
} from '../systems/Sfx';
import { applyAimSpread, computeLeadAimHeading } from '../systems/UfoTargeting';
import {
  ALL_WEAPON_UPGRADE_IDS,
  computeFireCooldownMs,
  computeImpulseVelocity,
  computeMaxOnScreenShots,
  computeShotSpecs,
  hasUpgrade,
  WEAPON_UPGRADE_LABELS,
  type ShotSpec,
  type WeaponUpgradeConfig,
  type WeaponUpgradeId,
} from '../systems/WeaponUpgrades';
import {
  applyShotHeat,
  decayHeat,
  INITIAL_HEAT_STATE,
  isOverheated,
  type HeatState,
} from '../systems/WeaponHeat';
import { purchaseUpgrade } from '../systems/WeaponShop';
import { toCssHex } from '../utilities/Color';
import { fromAngle, normalize, type Vector2 } from '../utilities/Vector2';
import type { MatterGameObject } from '../entities/MatterGameObject';

type SessionState =
  | 'playing'
  | 'stageClear'
  | 'shop'
  | 'gameOver'
  | 'paused'
  | 'enteringInitials'
  | 'bossAnnouncement';

interface PlayerSlot {
  /** The original P1-P4 slot number (0-3) - NOT this player's position in the (possibly sparse, inactive-slots-skipped) `players` array. Everything that needs a stable "which player" identity (scoring, ship color, self-hit immunity) keys off this, never array position. */
  slotIndex: number;
  ship: Ship;
  input: PlayerInput;
  lastFiredAtMs: number;
  /** This player's vote for the next stage, reset each transition. `undefined` = abstained, which resolveStageVote simply doesn't count. */
  stageVote: StageChoiceId | undefined;
  /** The hull this player picked on the menu (config's HULLS). Lives on the slot, not the Ship, because a Ship is destroyed and rebuilt on every respawn and stage transition - the choice has to outlive all of that, same reasoning as `weapon` and `scrap`. */
  hullId: HullId;
  /** This player's own kill chain (COMBO / systems/ComboMultiplier.ts) - per-player even in Cooperative, where score itself is pooled; see COMBO's config comment for why. */
  combo: ComboState;
  /** Hyperspace cooldown (HYPERSPACE.cooldownMs) and rising-edge tracking - see the jump handling in update(). Both live on the slot rather than the Ship for the same reason `weapon` does: a Ship is destroyed and replaced on every respawn, and a jump cooldown shouldn't be cleared by dying. */
  lastHyperspaceAtMs: number;
  hyperspaceWasHeld: boolean;
  /** Remaining lives (starts at LIVES_PER_PLAYER). Competitive/Single Player only - Cooperative uses `eliminated` instead (see below), lives genuinely don't matter there anymore. */
  lives: number;
  /** True once this player is permanently out for the round. Competitive/Single Player: set when `lives` hits 0. Cooperative: set when a Commander goes unrescued past COMMANDER.rescueWindowMs, or is destroyed by a hazard first - lives are never decremented in that mode at all. */
  eliminated: boolean;
  /** The Commander this player is currently towing toward the space station, if any (Cooperative only) - null otherwise, including while this player has no Commander to carry. */
  towedCommander: Commander | null;
  /** The Fracture's Phase 3 currency (docs/roadmap.md) - starts at 0, +1 per Swarm piece collected by touch. Shown in the HUD only once nonzero, same "no line at all until it matters" convention `cooperativeStatusLine` already uses. Spent via `purchaseWeaponUpgrade()` below. */
  scrap: number;
  /**
   * This player's own weapon upgrade state (docs from the brief's weapon
   * upgrade system) - lives on the slot, not the `Ship`, deliberately:
   * `ship` gets destroyed/replaced on every respawn and every stage
   * transition (`resetStageHazards()`), but `weapon` must survive both,
   * same "for the remainder of the current game/session" requirement
   * Scrap itself already gets by living here. `active` is mutated by
   * wholesale replacement (a fresh `Set` per purchase), matching
   * `systems/WeaponShop.ts`'s pure functional-update return shape rather
   * than being mutated in place.
   */
  weapon: { active: Set<WeaponUpgradeId>; heat: HeatState };
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

// The weapon shop's per-player panel layout (GameScene.enterShop) - sized
// to fit a header + 3 upgrade rows + a READY row comfortably, with room
// for up to 4 panels side by side across the 1920px arena (4*380 +
// 3*30 = 1610px, well clear of the edges).
const SHOP_PANEL_WIDTH = 380;
// Sized for a header + 3 upgrade rows + a "NEXT STAGE" label + up to 3
// stage-vote rows + a READY row. Grew when stage choice moved into this
// panel; before that it fit the upgrades and READY alone, and adding the
// vote rows pushed READY straight out through the bottom border.
// 26 (header) + 40 + 3*32 (upgrades) + 32 (vote label) + 3*32 (the
// most stage options ever offered) + 14 (ready) + padding. Grew when
// stage choice moved into this panel; at the old 240 the READY row was
// pushed straight out through the bottom border.
const SHOP_PANEL_HEIGHT = 330;
const SHOP_PANEL_GAP = 30;
const SHOP_ROW_HEIGHT = 32;

/**
 * One player's own shop panel state + visuals. `eliminated` panels are
 * permanently `ready: true` (excludes them from `updateShop`'s all-ready
 * gate without special-casing that check) and never get row/ready text
 * objects at all - `refreshShopPanel` short-circuits on `eliminated`
 * before touching them.
 */
interface ShopPanel {
  slotIndex: number;
  eliminated: boolean;
  /** Either a `ShopCursor` (weapon upgrade or 'ready') or a `vote:<id>` row - see nextShopRow/shopRowIds. */
  cursor: string;
  ready: boolean;
  prevTurnDirection: -1 | 0 | 1;
  prevFiring: boolean;
  bg: Phaser.GameObjects.Rectangle;
  headerText: Phaser.GameObjects.Text;
  rowTexts: Phaser.GameObjects.Text[];
  /** One row per stage-choice option on offer this transition (docs: light stage choice). */
  voteTexts: Phaser.GameObjects.Text[];
  /** The "- VOTE: NEXT STAGE -" heading above those rows, kept here purely so exitShop can destroy it with the rest of the panel. */
  voteLabelText: Phaser.GameObjects.Text | undefined;
  readyText: Phaser.GameObjects.Text | undefined;
}

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
 *   them to run out `COMMANDER.rescueWindowMs` (15s) or get caught by an
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
/** A round outcome that actually ends the round - everything `RoundOutcome` can be except 'continue'. Used by the deferred round-end (see `deferredRoundEnd`/`resolveRoundOutcome`), which only ever holds a real ending. */
type ResolvedRoundOutcome = Exclude<RoundOutcome, { status: 'continue' }>;

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
  /** Static arena wreckage for this stage (TERRAIN / systems/ArenaTerrain.ts) - regenerated per stage, never during a boss fight. */
  private wrecks: Wreck[] = [];
  /** The Saboteur and its dropped ordnance (SABOTEUR/DRIFT_MINE, entities/Saboteur.ts, entities/DriftMine.ts) - all three modes, unlike the Commander/Station pair above, since its threat isn't Cooperative-specific even though the Commander-priority targeting hook only ever matters there. */
  private saboteurs: Saboteur[] = [];
  private driftMines: DriftMine[] = [];
  private lastSaboteurSpawnAtMs = -Infinity;
  private lastStageWasBoss = false;
  /** Options on offer at the current shop (bosses before a boss stage, field flavors before a normal one) - empty outside the shop. */
  private stageChoiceOptions: readonly StageChoiceOption[] = [];
  /** The crew's resolved pick, applied by beginNextLevel() and then held for the duration of that stage. */
  private chosenBoss: StageChoiceId | undefined;
  private fieldModifiers: FieldModifiers = FIELD_MODIFIERS.standard;
  /** Attract mode (docs/roadmap.md): the game playing itself on the idle menu. Suppresses everything that only makes sense for a real player - initials entry, leaderboard submission - and bails back to the menu on any input at all. */
  /** Per-slot hull choice carried in from the menu - see config's HULLS. */
  private hulls: HullId[] = ['interceptor', 'interceptor', 'interceptor', 'interceptor'];
  /**
   * LAN multiplayer (docs/roadmap.md's "Windows + LAN multiplayer,"
   * Sprint 6) - `undefined` for every existing mode (local Cooperative/
   * Competitive/Single Player), so none of the branches this gates can
   * even run unless something explicitly started a networked match
   * (`LanLobbyScene.ts`). Scoped to ship positions only for now -
   * asteroids/hazards/scoring aren't synced yet, deliberately, same
   * "prove the core loop first" reasoning the sim/render split (item
   * Sprint 3) and the host/dedicated-server reordering both already
   * used.
   *
   * - **host**: runs the exact same simulation as a local match
   *   (`update()` is unmodified for it beyond appending remote player
   *   slots and broadcasting a snapshot at the very end) - the host's
   *   own screen is just a normal game, as far as this class is
   *   concerned.
   * - **client**: a wholly separate, much smaller code path
   *   (`createNetworkClient()`/`updateNetworkClient()`) - no local
   *   physics for any ship, including its own (the "pure renderer, no
   *   prediction yet" decision) - just applies whatever `GameSnapshot`
   *   most recently arrived and sends its own local input upstream.
   */
  private networkRole: 'host' | 'client' | undefined;
  /** Which slotIndex is this machine's own local player - 0 for the host always, whatever the host assigned for a client. */
  private localSlotIndex = 0;
  private hostSession: NetworkHostSession | undefined;
  private clientSession: NetworkClientSession | undefined;
  /** Host only - slotIndex -> the RemoteInput a connected client's own InputMessages get written into. Populated as clients connect, in LanLobbyScene, before this scene ever starts. */
  private remoteInputsBySlot: Map<number, RemoteInput> = new Map();
  /** Host only - slotIndex -> that client's own RtcConnection, purely so this scene (not the now-stopped LanLobbyScene) can register its own onClosed handler once it's actually running - see registerRemoteDisconnectHandlers(). */
  private remoteConnectionsBySlot: Map<number, RtcConnection> = new Map();
  /** Host only - increments once per broadcast, never reset mid-round; lets a client's own isNewerTick check discard an out-of-order snapshot. */
  private snapshotTick = 0;
  /** Host only - decides which frames also send a snapshot, per the session's transport rate. Created lazily once `hostSession` is known. Fed `performance.now()`, not game time, so a paused scene's frozen clock can't stall it. */
  private snapshotThrottle: SnapshotThrottle | undefined;
  /** Client only - the most recently received snapshot, applied once per frame in updateNetworkClient() rather than the instant it arrives (messages and frames aren't synchronized). */
  private latestSnapshot: GameSnapshot | undefined;
  /** Client only - this machine's own real input device, always the full P1 binding set (not split P1/P2 the way local co-op shares one keyboard) since a dedicated network client has nobody else to share it with. */
  private localInput: KeyboardInput | undefined;
  /**
   * Host only - every synced non-ship entity (asteroid, projectile, and
   * every type after it, Sprint 8 onward) gets a stable network id the
   * first time it's seen in `buildEntitySnapshots()`, reused for the
   * rest of that entity's lifetime. A `WeakMap` keyed on the entity
   * object itself needs zero changes to any entity class and nothing to
   * clean up - an entity that's destroyed just stops being looked up.
   */
  private entityNetworkIds = new WeakMap<object, number>();
  private nextEntityNetworkId = 1;
  /** Client only - reconciles each frame's `GameSnapshot.entities` into visual-only mirrors (`EntityMirrorRegistry.ts`). Factories registered once in `createNetworkClient()`. */
  private entityMirrors = new EntityMirrorRegistry();
  /** Client only (docs/roadmap.md's "Windows + LAN multiplayer," Sprint 14) - mirrors the host's own `this.overlayTexts` (boss announcement/game over/paused/...). Built once per overlay, text/color refreshed every tick thereafter; torn down the instant a snapshot reports no overlay lines at all. */
  private clientOverlayTexts: Phaser.GameObjects.Text[] = [];
  /** Client only - mirrors the host's own `this.shop` (headline/subheadline/hint + per-player panels). Built once per shop session (panel count/layout never changes mid-shop), refreshed every tick thereafter; torn down the instant a snapshot reports no shop at all. */
  private clientShop:
    | {
        headlineText: Phaser.GameObjects.Text;
        subheadlineText: Phaser.GameObjects.Text;
        hintText: Phaser.GameObjects.Text;
        panels: {
          slotIndex: number;
          bg: Phaser.GameObjects.Rectangle;
          headerText: Phaser.GameObjects.Text;
          rowTexts: Phaser.GameObjects.Text[];
          voteLabelText: Phaser.GameObjects.Text | undefined;
          voteTexts: Phaser.GameObjects.Text[];
          readyText: Phaser.GameObjects.Text | undefined;
        }[];
      }
    | undefined;
  private isDemo = false;
  private demoStartedAtMs = 0;
  private demoInputSeen = false;
  // Wall-clock deadline for the EFFECTS.slowMo time dilation - see
  // triggerSlowMo() and the top of update().
  private slowMoUntilMs = -Infinity;
  // Set when a round-ending outcome lands during a slow-mo beat: the
  // outcome is snapshotted here and applied once the beat finishes, so
  // the deciding blow is actually visible before the world freezes.
  // Snapshotting (rather than re-evaluating on resolve) is deliberate -
  // the last ship can itself die inside that window, and a round
  // shouldn't retroactively turn a win into a draw after the fact.
  private deferredRoundEnd: { outcome: ResolvedRoundOutcome; resolveAtMs: number } | undefined;
  // How many normal (non-boss) stages have begun this round - 1 for the
  // round's first wave (spawned directly in create()), incremented once
  // per subsequent normal-stage transition in beginNextLevel(). Feeds
  // systems/StageScaling.ts's asteroid-count/UFO-interval curves; boss
  // stages don't advance it - they spawn their own small fixed ambient
  // wave, a separate system from this one.
  private normalStageCount = 1;
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
  // Time spent actually playing the current stage.
  //
  // This started life as a dev-only on-screen timer, which roadmap.md
  // flagged for removal before release - and the display is indeed gone
  // now. **The accumulator itself deliberately stays**: other systems
  // grew to depend on it after that removal note was written, and
  // deleting it (as the note literally instructed) would silently break
  // them - the Gravity Well's spawn gate (BLACK_HOLE.minStageElapsedMs)
  // and the stage-clear rank's own elapsed-time component
  // (systems/StageRank.ts).
  //
  // Accumulated only while `state === 'playing'` rather than read off
  // wall-clock `this.time.now`, so it pauses for free across every
  // non-playing state (paused, stageClear, bossAnnouncement,
  // enteringInitials, gameOver) without tracking a separate "when did
  // we last resume" timestamp.
  private stageElapsedMs = 0;
  // Per-stage performance tally behind the stage-clear rank
  // (systems/StageRank.ts). Reset wherever stageElapsedMs is, since
  // they measure the same window.
  private stageShotsFired = 0;
  private stageShotsHit = 0;
  private stageHitsTaken = 0;
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
  private pendingUfoHits: { ufo: Ufo; projectile: Projectile | undefined; awardScore: boolean }[] =
    [];
  private pendingUfoShotHits: UfoShot[] = [];
  private pendingFractureCoreHits: { projectile: Projectile }[] = [];
  private pendingFractureFragmentHits: { fragment: FractureFragment; projectile: Projectile }[] =
    [];
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
  // An asteroid touching a boss's own body (Fracture Core/Fragment,
  // Cardinal core/arm) - destroyed whole, no split, no score, same
  // "consumed, not shattered" precedent the Gravity Well's own lethal
  // center already set (see processBlackHoleCaptureAndLethal). One
  // shared queue regardless of which boss/body part caused it, same
  // "one array covers every source" shape pendingShipHits already uses -
  // Fracture's own Matter collision feeds it from handleCollision(),
  // Cardinal's manual core/arm distance checks feed it from
  // updateCardinalAttacks(), and any future boss can feed the same
  // queue either way.
  private pendingBossAsteroidHits: Asteroid[] = [];
  /** Shots that hit cover this frame - destroyed rather than ricocheting. */
  private pendingWreckAbsorbs: Projectile[] = [];
  // The plasma ball/shard are consumed on any contact (ship or asteroid
  // alike, same as a UfoShot) - separate typed queues since (unlike
  // pendingBossAsteroidHits above) there's a second object to destroy
  // alongside the asteroid, same shape as pendingCardinalPlasmaHits/
  // pendingFractureShardHits' own ship-side queues.
  private pendingCardinalPlasmaAsteroidHits: { asteroid: Asteroid; plasma: CardinalPlasmaBall }[] =
    [];
  private pendingFractureShardAsteroidHits: { asteroid: Asteroid; shard: FractureShard }[] = [];
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
  // A shot- or ram-killed Saboteur, same shape as pendingUfoHits -
  // either way it still drops its own parting mine (destroySaboteur()).
  private pendingSaboteurHits: {
    saboteur: Saboteur;
    projectile: Projectile | undefined;
    awardScore: boolean;
  }[] = [];
  // Two separate trigger queues rather than one, since only the
  // shot-triggered path has a projectile to destroy and an ownerIndex to
  // credit the chain to - a collision trigger is anonymous, same
  // "hazard-killed, not shot" distinction pendingUfoHits' own
  // `awardScore` flag already draws.
  private pendingMineShotTriggers: { mine: DriftMine; projectile: Projectile }[] = [];
  private pendingMineCollisionTriggers: DriftMine[] = [];
  // A mine caught in another mine's own blast doesn't detonate instantly -
  // DRIFT_MINE.chainPropagationMs later, so a chain reads as a chain
  // rather than one simultaneous flash. Checked every frame in update().
  private pendingChainDetonations: {
    mine: DriftMine;
    atMs: number;
    ownerIndex: number | undefined;
  }[] = [];

  constructor() {
    super('Game');
  }

  /** Called before create() on every start *and* every scene.restart(data) - the mode/sources-carrying explicit-data restarts elsewhere in this file rely on that. */
  init(data: {
    mode?: GameMode;
    sources?: InputSource[];
    hulls?: HullId[];
    demo?: boolean;
    networkRole?: 'host' | 'client';
    localSlotIndex?: number;
    hostSession?: NetworkHostSession;
    clientSession?: NetworkClientSession;
    remoteInputsBySlot?: Map<number, RemoteInput>;
    remoteConnectionsBySlot?: Map<number, RtcConnection>;
  }): void {
    this.mode = data?.mode ?? 'cooperative';
    this.sources = data?.sources ?? ['keyboard', 'keyboard', 'gamepad', 'gamepad'];
    this.hulls = data?.hulls ?? ['interceptor', 'interceptor', 'interceptor', 'interceptor'];
    this.isDemo = data?.demo === true;
    this.networkRole = data?.networkRole;
    this.localSlotIndex = data?.localSlotIndex ?? 0;
    this.hostSession = data?.hostSession;
    this.clientSession = data?.clientSession;
    this.remoteInputsBySlot = data?.remoteInputsBySlot ?? new Map();
    this.remoteConnectionsBySlot = data?.remoteConnectionsBySlot ?? new Map();
    this.snapshotTick = 0;
    this.latestSnapshot = undefined;
    this.entityNetworkIds = new WeakMap();
    this.nextEntityNetworkId = 1;
    this.entityMirrors.clear();
    this.teardownClientOverlay();
    this.teardownClientShop();
  }

  create(): void {
    if (this.networkRole === 'client') {
      this.createNetworkClient();
      return;
    }

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
    if (this.networkRole === 'host') {
      this.addRemotePlayerSlots();
      this.registerRemoteDisconnectHandlers();
    }

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
      this.mode === 'cooperative'
        ? new SpaceStation(this, { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 })
        : undefined;
    this.spaceStationRelocated = false;
    this.blackHole = undefined;
    this.fracture = undefined;
    this.fractureFragments = [];
    this.fractureSwarm = [];
    this.fractureLasers = [];
    this.fractureShards = [];
    this.lastStageWasBoss = false;
    this.normalStageCount = 1;
    this.clearTerrain();
    this.saboteurs.forEach((saboteur) => saboteur.destroy());
    this.saboteurs = [];
    this.driftMines.forEach((mine) => mine.destroy());
    this.driftMines = [];
    this.slowMoUntilMs = -Infinity;
    this.stageChoiceOptions = [];
    this.chosenBoss = undefined;
    this.fieldModifiers = FIELD_MODIFIERS.standard;
    this.deferredRoundEnd = undefined;
    this.matter.world.engine.timing.timeScale = 1;
    this.cardinal = undefined;
    this.cardinalPlasmaBalls = [];
    this.cardinalHealthBarBorder = undefined;
    this.cardinalHealthBarFill = undefined;
    this.cardinalHealthBarLabel = undefined;
    this.scrapCountdownEndsAtMs = undefined;
    this.scrapCountdownText = undefined;
    this.lastEliminatedSlotIndex = undefined;
    this.stageElapsedMs = 0;
    this.resetStageRankStats();
    this.scores = [0, 0, 0, 0]; // fixed, indexed by slotIndex - not sized to how many players are actually active
    this.state = 'playing';
    this.lastShieldSpawnAtMs = this.time.now;
    this.lastUfoSpawnAtMs = this.time.now;
    this.lastSaboteurSpawnAtMs = this.time.now;
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
    this.pendingBossAsteroidHits = [];
    this.pendingWreckAbsorbs = [];
    this.pendingCardinalPlasmaAsteroidHits = [];
    this.pendingFractureShardAsteroidHits = [];
    this.pendingScrapPickups = [];
    this.pendingFriendlyFireHits = [];
    this.pendingRespawns = [];
    this.pendingCommanderPickups = [];
    this.pendingCommanderHazardHits = [];
    this.pendingSaboteurHits = [];
    this.pendingMineShotTriggers = [];
    this.pendingMineCollisionTriggers = [];
    this.pendingChainDetonations = [];
    this.overlayTexts = [];
    this.pauseMenuObjects = [];
    this.generateStageTerrain();
    this.spawnWave(this.modifiedAsteroidCount());
    this.refreshAllPlayerHud();

    if (this.isDemo) {
      this.demoStartedAtMs = this.time.now;
      this.demoInputSeen = false;
      this.armDemoExitListeners();
      this.showDemoBanner();
    }

    this.add
      .text(ARENA_WIDTH / 2, 8, GAME_MODE_LABELS[this.mode], {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#9a9ab0',
      })
      .setOrigin(0.5, 0);

    this.matter.world.on(
      'collisionstart',
      (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
        event.pairs.forEach((pair) => this.handleCollision(pair));
      },
    );

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

      // Attract mode flies every ship itself - whatever the menu had
      // selected for this slot is irrelevant when nobody's holding it.
      const input: PlayerInput = this.isDemo
        ? new AiInput()
        : source === 'keyboard'
          ? new KeyboardInput(slotIndex === 0 ? P1_BINDINGS : P2_BINDINGS)
          : new GamepadInput(connectedGamepads[assignment.gamepadIndex!]!);

      const hullId: HullId = this.hulls[slotIndex] ?? 'interceptor';
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
          hullId,
        ),
        hullId,
        input,
        lastFiredAtMs: -Infinity,
        combo: INITIAL_COMBO_STATE,
        stageVote: undefined,
        lastHyperspaceAtMs: -Infinity,
        hyperspaceWasHeld: false,
        lives: LIVES_PER_PLAYER,
        eliminated: false,
        towedCommander: null,
        scrap: 0,
        weapon: { active: new Set(), heat: INITIAL_HEAT_STATE },
        hudText,
      });
    });
  }

  /**
   * Host only (docs/roadmap.md's "Windows + LAN multiplayer," Sprint 6) -
   * one PlayerSlot per connected client, appended after buildPlayers()'s
   * own local-only slots rather than folded into that method's
   * source-assignment logic, which knows nothing about the network and
   * doesn't need to. Each slot's `input` is the exact same `RemoteInput`
   * instance `LanLobbyScene` already wired `hostSession`'s own
   * `onClientInput` callback to write into - this method doesn't
   * register anything of its own, it just plugs those instances into
   * `this.players` so the ordinary per-frame loop drives their ships
   * precisely like any local player's.
   */
  private addRemotePlayerSlots(): void {
    const shipCollisionEnabled = this.mode === 'competitive';

    this.remoteInputsBySlot.forEach((input, slotIndex) => {
      const hullId: HullId = this.hulls[slotIndex] ?? 'interceptor';
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
          hullId,
        ),
        hullId,
        input,
        lastFiredAtMs: -Infinity,
        combo: INITIAL_COMBO_STATE,
        stageVote: undefined,
        lastHyperspaceAtMs: -Infinity,
        hyperspaceWasHeld: false,
        lives: LIVES_PER_PLAYER,
        eliminated: false,
        towedCommander: null,
        scrap: 0,
        weapon: { active: new Set(), heat: INITIAL_HEAT_STATE },
        hudText,
      });
    });
  }

  /**
   * Host only (docs/roadmap.md's "Windows + LAN multiplayer," Sprint
   * 7's decided disconnect rules) - one `RtcConnection.onClosed` handler
   * per connected client, registered here rather than back in
   * `LanLobbyScene` (which has already stopped by the time this scene
   * is even running) so the closure that fires actually belongs to the
   * scene that's live when it does.
   */
  private registerRemoteDisconnectHandlers(): void {
    this.remoteConnectionsBySlot.forEach((connection, slotIndex) => {
      connection.onClosed(() => this.handleRemotePlayerDisconnected(slotIndex));
    });
  }

  /** "That player's ship is removed; everyone else keeps playing" - the decided rule for a non-host disconnect. Reuses the exact same eliminated/checkRoundOutcome path a Competitive loss-of-lives already takes, rather than a parallel mechanism just for this. */
  private handleRemotePlayerDisconnected(slotIndex: number): void {
    const player = this.players.find((p) => p.slotIndex === slotIndex);
    if (!player || player.eliminated) return;

    player.eliminated = true;
    if (player.ship.isAlive) player.ship.destroy();
    this.refreshAllPlayerHud();
    this.checkRoundOutcome();
  }

  /**
   * Host only - one `GameSnapshot` (ships only, see
   * `NetworkSnapshotProtocol.ts`'s own doc comment on why) per frame,
   * sent to every connected client. Reads whatever this frame's own,
   * completely ordinary simulation just produced - this method doesn't
   * run any gameplay logic of its own, only serializes the result.
   */
  /** Mints a stable network id the first time an entity is seen, reused for the rest of its lifetime - see `entityNetworkIds`' own doc comment. */
  private networkIdFor(entity: object): number {
    let id = this.entityNetworkIds.get(entity);
    if (id === undefined) {
      id = this.nextEntityNetworkId;
      this.nextEntityNetworkId += 1;
      this.entityNetworkIds.set(entity, id);
    }
    return id;
  }

  /**
   * Host only (docs/roadmap.md's "Windows + LAN multiplayer," Sprint 8) -
   * the generic entity list every `GameSnapshot` now carries alongside
   * ships. Scoped to asteroids and projectiles for this sprint; every
   * later entity type (UFOs, hazards, bosses, ...) just appends another
   * `.map()` here, same shape, no new protocol or client-side plumbing
   * required beyond registering that type's own mirror factory.
   */
  private buildEntitySnapshots(nowMs: number): EntitySnapshot[] {
    const entities: EntitySnapshot[] = [];

    this.asteroids.forEach((asteroid) => {
      if (!asteroid.isAlive) return;
      entities.push({
        id: this.networkIdFor(asteroid),
        type: 'asteroid',
        x: asteroid.position.x,
        y: asteroid.position.y,
        rotation: asteroid.visual.rotation,
        data: { size: asteroid.size },
      });
    });

    this.projectiles.forEach((projectile) => {
      if (!projectile.isAlive) return;
      entities.push({
        id: this.networkIdFor(projectile),
        type: 'projectile',
        x: projectile.position.x,
        y: projectile.position.y,
        rotation: projectile.headingRad,
        data: { ownerIndex: projectile.ownerIndex },
      });
    });

    this.ufos.forEach((ufo) => {
      if (!ufo.isAlive) return;
      entities.push({
        id: this.networkIdFor(ufo),
        type: 'ufo',
        x: ufo.position.x,
        y: ufo.position.y,
        rotation: ufo.visual.rotation,
        data: {},
      });
    });

    this.ufoShots.forEach((shot) => {
      if (!shot.isAlive) return;
      entities.push({
        id: this.networkIdFor(shot),
        type: 'ufoShot',
        x: shot.position.x,
        y: shot.position.y,
        rotation: 0,
        data: {},
      });
    });

    this.shields.forEach((shield) => {
      if (!shield.isAlive) return;
      entities.push({
        id: this.networkIdFor(shield),
        type: 'shield',
        x: shield.position.x,
        y: shield.position.y,
        rotation: shield.visual.rotation,
        data: {},
      });
    });

    this.commanders.forEach((commander) => {
      if (!commander.isAlive) return;
      const remainingMs = Math.max(0, COMMANDER.rescueWindowMs - (nowMs - commander.ejectedAtMs));
      entities.push({
        id: this.networkIdFor(commander),
        type: 'commander',
        x: commander.position.x,
        y: commander.position.y,
        rotation: 0, // the body itself is never rotated (Commander.ts's own doc comment) - facingAngleRad below drives the thruster-tell direction instead
        data: {
          slotIndex: commander.slotIndex,
          isAdrift: commander.isAdrift,
          hasBeenRescuedOnce: commander.hasBeenRescuedOnce,
          remainingSeconds: Math.ceil(remainingMs / 1000),
          isThrusterFiring: commander.isThrusterFiring,
          facingAngleRad: commander.facingAngleRad,
          puffFuelRatio: commander.remainingPuffFuelRatio,
        },
      });
    });

    this.saboteurs.forEach((saboteur) => {
      if (!saboteur.isAlive) return;
      entities.push({
        id: this.networkIdFor(saboteur),
        type: 'saboteur',
        x: saboteur.position.x,
        y: saboteur.position.y,
        rotation: 0, // the hull's own draw() never rotates by heading either (same "drifts without turning to face it" look)
        data: { minesRemaining: saboteur.minesLeft, justDropped: saboteur.hasJustDroppedAt(nowMs) },
      });
    });

    this.driftMines.forEach((mine) => {
      if (!mine.isAlive) return;
      entities.push({
        id: this.networkIdFor(mine),
        type: 'driftMine',
        x: mine.position.x,
        y: mine.position.y,
        rotation: 0,
        data: { armed: mine.isArmed(nowMs) },
      });
    });

    if (this.spaceStation) {
      entities.push({
        id: this.networkIdFor(this.spaceStation),
        type: 'spaceStation',
        x: this.spaceStation.position.x,
        y: this.spaceStation.position.y,
        rotation: 0,
        data: {},
      });
    }

    if (this.blackHole?.isAlive) {
      entities.push({
        id: this.networkIdFor(this.blackHole),
        type: 'blackHole',
        x: this.blackHole.position.x,
        y: this.blackHole.position.y,
        rotation: 0,
        data: {},
      });
    }

    if (this.fracture?.isAlive) {
      entities.push({
        id: this.networkIdFor(this.fracture),
        type: 'fracture',
        x: this.fracture.position.x,
        y: this.fracture.position.y,
        rotation: 0,
        data: { materializeProgress: this.fracture.materializeProgress(nowMs) },
      });
    }

    this.fractureFragments.forEach((fragment) => {
      if (!fragment.isAlive) return;
      entities.push({
        id: this.networkIdFor(fragment),
        type: 'fractureFragment',
        x: fragment.position.x,
        y: fragment.position.y,
        rotation: 0,
        data: {
          role: fragment.role,
          materializeProgress: fragment.materializeProgress(nowMs),
          ringElapsedMs: fragment.ringElapsedMsAt(nowMs),
        },
      });
    });

    this.fractureShards.forEach((shard) => {
      if (!shard.isAlive) return;
      entities.push({
        id: this.networkIdFor(shard),
        type: 'fractureShard',
        x: shard.position.x,
        y: shard.position.y,
        rotation: shard.visual.rotation,
        data: {},
      });
    });

    this.fractureSwarm.forEach((bit) => {
      if (!bit.isAlive) return;
      entities.push({
        id: this.networkIdFor(bit),
        type: 'fractureSwarmBit',
        x: bit.position.x,
        y: bit.position.y,
        rotation: 0,
        data: { kind: bit.kind, materializeProgress: bit.materializeProgress(nowMs) },
      });
    });

    this.fractureLasers.forEach((laser) => {
      if (!laser.isAlive) return;
      entities.push({
        id: this.networkIdFor(laser),
        type: 'fractureLaser',
        x: laser.origin.x,
        y: laser.origin.y,
        rotation: laser.angleRad,
        data: { elapsedMs: laser.elapsedMsAt(nowMs) },
      });
    });

    if (this.cardinal?.isAlive) {
      const healthFraction =
        this.cardinal.phase === 'armed' ? this.cardinal.armHpFraction() : this.cardinal.coreHpFraction();
      const healthLabel =
        this.cardinal.phase === 'armed' ? 'ARMS' : this.cardinal.phase === 'coreExposed' ? 'CORE' : 'CRITICAL';
      entities.push({
        id: this.networkIdFor(this.cardinal),
        type: 'cardinal',
        x: this.cardinal.position.x,
        y: this.cardinal.position.y,
        rotation: this.cardinal.rotationRad,
        data: {
          phase: this.cardinal.phase,
          armAliveMask: this.cardinal.armAliveMask(),
          materializeProgress: this.cardinal.materializeProgress(nowMs),
          cycleElapsedMs: this.cardinal.cycleElapsedMsAt(nowMs),
          detonationProgress: this.cardinal.detonationProgress(nowMs),
          healthFraction,
          healthLabel,
        },
      });
    }

    this.cardinalPlasmaBalls.forEach((plasma) => {
      if (!plasma.isAlive) return;
      entities.push({
        id: this.networkIdFor(plasma),
        type: 'cardinalPlasma',
        x: plasma.position.x,
        y: plasma.position.y,
        rotation: 0,
        data: {},
      });
    });

    return entities;
  }

  private broadcastHostSnapshot(nowMs: number): void {
    if (!this.hostSession) return;

    this.snapshotTick += 1;
    // Excludes anyone whose current Ship object is actually destroyed -
    // not just eliminated (disconnected - see
    // handleRemotePlayerDisconnected), but also a *Cooperative* hit
    // that's still alive as a player: that ejects a Commander and
    // destroys the ship outright, but doesn't set eliminated - player.ship
    // keeps pointing at the dead object until respawnRescuedPlayer()
    // replaces it at the station. Reading .position/.heading off a
    // destroyed Ship here threw and froze the host's whole update loop -
    // the actual bug behind "the game freezes on any hit in LAN mode."
    const ships: ShipSnapshot[] = this.players
      .filter((player) => !player.eliminated && player.ship.isAlive)
      .map((player) => ({
        slotIndex: player.slotIndex,
        x: player.ship.position.x,
        y: player.ship.position.y,
        heading: player.ship.heading,
        alive: player.ship.isAlive,
        thrusting: player.input.isThrusting,
        invulnerableUntilMs: player.ship.isInvulnerable(nowMs) ? nowMs + 1 : -Infinity,
      }));

    this.hostSession.broadcastSnapshot({
      type: 'debris-snapshot',
      tick: this.snapshotTick,
      nowMs,
      ships,
      entities: this.buildEntitySnapshots(nowMs),
      players: this.buildPlayerHudSnapshots(),
      state: this.state,
      overlayLines: this.overlayTexts.map((text) => text.text),
      shop: this.buildShopSnapshot(),
    });
  }

  /**
   * Host only (docs/roadmap.md's "Windows + LAN multiplayer," Sprint 14)
   * - `undefined` whenever `this.shop` isn't up, same lifecycle signal a
   * client's own shop UI tears down on. Every row is sent as the exact
   * already-formatted text + color `refreshShopPanel` would draw, not
   * the raw owned/affordable/selected/vote-count ingredients - so a
   * client's shop screen can never drift from the host's own coloring
   * rules, it just displays what the host already decided.
   */
  private buildShopSnapshot(): ShopSnapshot | undefined {
    const shop = this.shop;
    if (!shop) return undefined;

    const panels: ShopPanelSnapshot[] = shop.panels.map((panel) => {
      if (panel.eliminated) {
        return {
          slotIndex: panel.slotIndex,
          eliminated: true,
          headerText: `P${panel.slotIndex + 1}\nOUT`,
          rows: [],
          voteLabel: null,
          voteRows: [],
          readyText: null,
          readyColorHex: null,
        };
      }

      const player = this.players.find((p) => p.slotIndex === panel.slotIndex);
      if (!player) {
        return {
          slotIndex: panel.slotIndex,
          eliminated: true,
          headerText: `P${panel.slotIndex + 1}\nOUT`,
          rows: [],
          voteLabel: null,
          voteRows: [],
          readyText: null,
          readyColorHex: null,
        };
      }

      const rows: ShopRowSnapshot[] = ALL_WEAPON_UPGRADE_IDS.map((id) => {
        const owned = hasUpgrade({ active: player.weapon.active }, id);
        const affordable = player.scrap >= WEAPON_UPGRADES.costs[id];
        const selected = panel.cursor === id;
        const marker = selected ? '> ' : '  ';
        const state = owned ? 'OWNED' : String(WEAPON_UPGRADES.costs[id]);
        const colorHex = owned
          ? toCssHex(COLORS.scrap)
          : affordable
            ? selected
              ? toCssHex(COLORS.players[panel.slotIndex]!)
              : '#dfe1ef'
            : '#5a5a6e';
        return { text: `${marker}${WEAPON_UPGRADE_LABELS[id].padEnd(12)}${state}`, colorHex };
      });

      const voteRows: ShopRowSnapshot[] = this.stageChoiceOptions.map((option) => {
        const rowId = `vote:${option.id}`;
        const selected = panel.cursor === rowId;
        const votedForThis = player.stageVote === option.id;
        const votes = this.players.filter((p) => p.stageVote === option.id).length;
        const marker = selected ? '>' : ' ';
        const chosen = votedForThis ? '*' : ' ';
        const colorHex = votedForThis
          ? toCssHex(COLORS.players[panel.slotIndex]!)
          : selected
            ? '#dfe1ef'
            : '#6a6a80';
        return {
          text: `${marker}${chosen}${option.label.padEnd(14)}${votes > 0 ? votes : ''}`,
          colorHex,
        };
      });

      const readySelected = panel.cursor === 'ready';
      const readyText = panel.ready ? 'READY' : readySelected ? '> READY? <' : 'READY?';
      const readyColorHex = panel.ready
        ? toCssHex(COLORS.scrap)
        : readySelected
          ? toCssHex(COLORS.players[panel.slotIndex]!)
          : '#6a6a80';

      return {
        slotIndex: panel.slotIndex,
        eliminated: false,
        headerText: `P${panel.slotIndex + 1}   SCRAP ${player.scrap}`,
        rows,
        voteLabel: this.stageChoiceOptions.length > 0 ? '- VOTE: NEXT STAGE -' : null,
        voteRows,
        readyText,
        readyColorHex,
      };
    });

    return {
      headline: shop.headlineText.text,
      subheadline: shop.subheadlineText.text,
      hint: shop.hintText.text,
      panels,
    };
  }

  /**
   * Client only (docs/roadmap.md's "Windows + LAN multiplayer," Sprint
   * 6) - a wholly separate, much smaller `create()` path. No asteroids,
   * no terrain, no hazards, no HUD beyond what's listed below - this
   * sprint is scoped to ship positions only, deliberately (see the
   * `networkRole` field's own doc comment). Builds one Ship per slot
   * the host's welcome message described and otherwise does nothing
   * until the first snapshot arrives.
   */
  private createNetworkClient(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.background = new PlayfieldBackground(this);
    stopSound(this, MENU_MUSIC_KEY);
    playLoopingSound(this, GAMEPLAY_MUSIC_KEY, getMusicVolume());
    this.currentStageMusicKey = GAMEPLAY_MUSIC_KEY;
    this.localInput = new KeyboardInput(P1_BINDINGS);
    this.clientSession?.onSnapshot((snapshot) => {
      // Unreliable + unordered means a snapshot can arrive out of
      // sequence - only ever move forward, never back to a stale tick.
      if (!this.latestSnapshot || isNewerTick(snapshot.tick, this.latestSnapshot.tick)) {
        this.latestSnapshot = snapshot;
      }
    });
    this.clientSession?.onDisconnected(() => this.handleHostDisconnected());
    this.registerEntityMirrorFactories();

    this.players = this.hulls.map((hullId, slotIndex) => {
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

      return {
        slotIndex,
        // false: a client never simulates ship-vs-ship contact (or
        // anything else) locally at all, so Competitive's own collision
        // toggle is irrelevant here - only the host's copy of this flag
        // ever actually matters.
        ship: new Ship(
          this,
          ARENA_WIDTH / 2 + offset.x,
          ARENA_HEIGHT / 2 + offset.y,
          COLORS.players[slotIndex]!,
          false,
          hullId,
        ),
        hullId,
        input: new RemoteInput(), // unused for simulation - this slot's PlayerInput is never read client-side, only the shape is needed
        lastFiredAtMs: -Infinity,
        combo: INITIAL_COMBO_STATE,
        stageVote: undefined,
        lastHyperspaceAtMs: -Infinity,
        hyperspaceWasHeld: false,
        lives: LIVES_PER_PLAYER,
        eliminated: false,
        towedCommander: null,
        scrap: 0,
        weapon: { active: new Set(), heat: INITIAL_HEAT_STATE },
        hudText,
      };
    });

    this.state = 'playing';
  }

  /**
   * Client only (docs/roadmap.md's "Windows + LAN multiplayer," Sprint 8)
   * - registers how to draw each generic `EntitySnapshot.type` this
   * client knows about. No Matter body for either: a client never
   * simulates physics for anything, including entities it isn't the
   * local player's own ship, so these are plain Graphics/Arc objects
   * repositioned from the snapshot each frame, nothing else.
   *
   * The asteroid mirror re-rolls its own procedural silhouette locally
   * (`generateAsteroidPoints`/`pickShapeFamily`, the same pure functions
   * `Asteroid.ts` itself uses) rather than the host transmitting one -
   * cheaper than syncing a vertex list, and "a jagged rock" reads the
   * same regardless of whose RNG picked its exact silhouette.
   */
  private registerEntityMirrorFactories(): void {
    this.entityMirrors.registerFactory('asteroid', (scene, entity) => {
      const size = (typeof entity.data.size === 'string' ? entity.data.size : 'large') as AsteroidSize;
      const radius = ASTEROID[size].radius;
      const family = pickShapeFamily(ASTEROID.shapeFamilies);
      const vertexCount = Math.round(
        family.vertexCountRange[0] + Math.random() * (family.vertexCountRange[1] - family.vertexCountRange[0]),
      );
      const points = generateAsteroidPoints(vertexCount, family.jaggedness);

      const graphics = scene.add.graphics();
      graphics.fillStyle(COLORS.asteroidFill, 1);
      graphics.lineStyle(2, COLORS.asteroid, 1);
      graphics.beginPath();
      points.forEach((p, i) => {
        const px = p.x * radius;
        const py = p.y * radius;
        if (i === 0) graphics.moveTo(px, py);
        else graphics.lineTo(px, py);
      });
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();

      return {
        applySnapshot: (snapshot) => graphics.setPosition(snapshot.x, snapshot.y).setRotation(snapshot.rotation),
        destroy: () => graphics.destroy(),
      };
    });

    this.entityMirrors.registerFactory('projectile', (scene, entity) => {
      const ownerIndex = typeof entity.data.ownerIndex === 'number' ? entity.data.ownerIndex : 0;
      const color = COLORS.players[ownerIndex] ?? COLORS.players[0]!;
      const circle = scene.add.circle(entity.x, entity.y, PROJECTILE.radius, color);
      return {
        applySnapshot: (snapshot) => circle.setPosition(snapshot.x, snapshot.y),
        destroy: () => circle.destroy(),
      };
    });

    // UFO's own tilt wobble is already carried in `entity.rotation` (the
    // same value `Ufo.visual.rotation` holds host-side) - only the
    // under-light pulse, which isn't part of the generic snapshot shape,
    // needs a clock of its own. `scene.time.now` stands in for the host's
    // per-instance `elapsedSec` - same period, different phase, which
    // reads identically for a cosmetic pulse nobody's meant to compare
    // frame-for-frame against the host's own screen.
    this.entityMirrors.registerFactory('ufo', (scene) => {
      const graphics = scene.add.graphics();
      const scale = UFO.radius;
      const bodyRx = 0.85 * scale;
      const bodyRy = 0.24 * scale;
      const bodyY = 0.05 * scale;
      const domeRx = 0.4 * scale;
      const domeRy = 0.3 * scale;
      const domeY = -0.15 * scale;
      const underLightXOffsets = [-0.32, 0, 0.32];
      const underLightYOffset = 0.13;
      const underLightPulsePerSec = 3;
      const domeArcSegments = 16;

      const redraw = (): void => {
        graphics.clear();
        graphics.fillStyle(COLORS.ufoFill, 1);
        graphics.lineStyle(2, COLORS.ufo, 1);
        graphics.fillEllipse(0, bodyY, bodyRx * 2, bodyRy * 2);
        graphics.strokeEllipse(0, bodyY, bodyRx * 2, bodyRy * 2);

        graphics.beginPath();
        for (let i = 0; i <= domeArcSegments; i += 1) {
          const t = Math.PI + (i / domeArcSegments) * Math.PI;
          const px = domeRx * Math.cos(t);
          const py = domeY + domeRy * Math.sin(t);
          if (i === 0) graphics.moveTo(px, py);
          else graphics.lineTo(px, py);
        }
        graphics.closePath();
        graphics.fillPath();
        graphics.strokePath();

        const elapsedSec = scene.time.now / 1000;
        underLightXOffsets.forEach((nx, i) => {
          const phase = elapsedSec * underLightPulsePerSec + i * ((Math.PI * 2) / underLightXOffsets.length);
          const brightness = 0.4 + (Math.sin(phase) * 0.5 + 0.5) * 0.6;
          graphics.fillStyle(COLORS.ufo, brightness);
          graphics.fillCircle(nx * scale, underLightYOffset * scale, scale * 0.06);
        });
      };
      redraw();

      return {
        applySnapshot: (snapshot) => {
          graphics.setPosition(snapshot.x, snapshot.y).setRotation(snapshot.rotation);
          redraw();
        },
        destroy: () => graphics.destroy(),
      };
    });

    this.entityMirrors.registerFactory('ufoShot', (scene, entity) => {
      const circle = scene.add.circle(entity.x, entity.y, UFO.shotRadius, COLORS.ufo);
      return {
        applySnapshot: (snapshot) => circle.setPosition(snapshot.x, snapshot.y),
        destroy: () => circle.destroy(),
      };
    });

    // Shield's spin is carried in `entity.rotation` the same way UFO's
    // tilt is; only the center dot's pulse (a scale animation, not a
    // rotation, so it has no field of its own on the generic snapshot
    // shape) is re-derived locally from `scene.time.now` - same
    // approximation the UFO mirror's under-lights already make.
    this.entityMirrors.registerFactory('shield', (scene) => {
      const graphics = scene.add.graphics();
      const diamondPoints: readonly Vector2[] = [
        { x: 0, y: -0.68 },
        { x: 0.46, y: 0 },
        { x: 0, y: 0.68 },
        { x: -0.46, y: 0 },
      ];
      const pulsePeriodSec = 2;
      const pulseMinScale = 0.12;
      const pulseMaxScale = 0.18;

      const redraw = (): void => {
        graphics.clear();
        graphics.fillStyle(0x0d0d16, 1);
        graphics.lineStyle(2, COLORS.shield, 1);
        graphics.beginPath();
        diamondPoints.forEach((p, i) => {
          const px = p.x * SHIELD.radius;
          const py = p.y * SHIELD.radius;
          if (i === 0) graphics.moveTo(px, py);
          else graphics.lineTo(px, py);
        });
        graphics.closePath();
        graphics.fillPath();
        graphics.strokePath();

        const pulsePhase = ((scene.time.now / 1000) / pulsePeriodSec) * Math.PI * 2;
        const pulseScale = pulseMinScale + (Math.sin(pulsePhase) * 0.5 + 0.5) * (pulseMaxScale - pulseMinScale);
        graphics.fillStyle(COLORS.shield, 1);
        graphics.fillCircle(0, 0, pulseScale * SHIELD.radius);
      };
      redraw();

      return {
        applySnapshot: (snapshot) => {
          graphics.setPosition(snapshot.x, snapshot.y).setRotation(snapshot.rotation);
          redraw();
        },
        destroy: () => graphics.destroy(),
      };
    });

    // Commander's body is never itself rotated (its own doc comment) -
    // `facingAngleRad`/`isThrusterFiring`/`puffFuelRatio` in `data` drive
    // the thruster-tell chevron/flame/bar the same way the host's own
    // draw() does; `remainingSeconds` is computed host-side rather than
    // the client deriving it from `ejectedAtMs`, so there's no clock-
    // alignment to get right. Limb sway/bob have no per-instance
    // randomness at all (fixed phase offsets baked into the numbers
    // below), so driving them from the local clock instead of the host's
    // reproduces them exactly, same as the body itself never needing a
    // sync'd value.
    this.entityMirrors.registerFactory('commander', (scene, entity) => {
      const slotIndex = typeof entity.data.slotIndex === 'number' ? entity.data.slotIndex : 0;
      const color = COLORS.players[slotIndex] ?? COLORS.players[0]!;
      const scale = COMMANDER.visualScale;
      const graphics = scene.add.graphics();
      const timerText = scene.add
        .text(entity.x, entity.y + scale * 1.7, '', {
          fontFamily: 'monospace',
          fontSize: '14px',
          fontStyle: 'bold',
          color: toCssHex(color),
        })
        .setOrigin(0.5, 0);

      const drawLimb = (
        g: Phaser.GameObjects.Graphics,
        shoulderX: number,
        shoulderY: number,
        baseAngle: number,
        sway: number,
        length: number,
      ): void => {
        const angle = baseAngle + sway;
        const elbowX = shoulderX + Math.cos(angle) * length * 0.55;
        const elbowY = shoulderY + Math.sin(angle) * length * 0.55;
        const tipAngle = angle + sway * 0.6;
        const tipX = elbowX + Math.cos(tipAngle) * length * 0.5;
        const tipY = elbowY + Math.sin(tipAngle) * length * 0.5;
        g.lineStyle(2.2, color, 1);
        g.beginPath();
        g.moveTo(shoulderX, shoulderY);
        g.lineTo(elbowX, elbowY);
        g.lineTo(tipX, tipY);
        g.strokePath();
      };

      const redraw = (data: EntitySnapshot['data']): void => {
        const nowMs = scene.time.now;
        const g = graphics;
        g.clear();

        const bob = Math.sin(nowMs / 500) * scale * 0.04;
        g.save();
        g.translateCanvas(0, bob);

        drawLimb(g, -scale * 0.4, scale * 0.22, Math.PI * 0.85, Math.sin(nowMs / 900) * 0.35, scale * 0.85);
        drawLimb(g, scale * 0.4, scale * 0.22, Math.PI * 0.15, Math.sin(nowMs / 760 + 1.4) * 0.35, scale * 0.85);
        drawLimb(g, -scale * 0.24, scale * 0.95, Math.PI * 0.6, Math.sin(nowMs / 1100 + 2.6) * 0.3, scale * 0.9);
        drawLimb(g, scale * 0.24, scale * 0.95, Math.PI * 0.4, Math.sin(nowMs / 980 + 0.7) * 0.3, scale * 0.9);

        g.fillStyle(0x0d0d16, 1);
        g.lineStyle(2, color, 1);
        g.beginPath();
        g.moveTo(-scale * 0.4, scale * 0.2);
        g.lineTo(scale * 0.4, scale * 0.2);
        g.lineTo(scale * 0.26, scale * 0.95);
        g.lineTo(-scale * 0.26, scale * 0.95);
        g.closePath();
        g.fillPath();
        g.strokePath();

        g.fillStyle(0x0d0d16, 1);
        g.lineStyle(2, color, 1);
        g.fillCircle(0, -scale * 0.28, scale * 0.42);
        g.strokeCircle(0, -scale * 0.28, scale * 0.42);

        g.fillStyle(color, 0.5);
        g.fillCircle(-scale * 0.08, -scale * 0.34, scale * 0.14);

        g.restore();

        const isAdrift = data.isAdrift === true;
        const puffFuelRatio = typeof data.puffFuelRatio === 'number' ? data.puffFuelRatio : 0;
        if (isAdrift && puffFuelRatio > 0) {
          const facingRad = typeof data.facingAngleRad === 'number' ? data.facingAngleRad : 0;
          const isThrusterFiring = data.isThrusterFiring === true;

          const aimDistance = scale * 1.25;
          const aimX = Math.cos(facingRad) * aimDistance;
          const aimY = Math.sin(facingRad) * aimDistance;
          const wingAngle = 0.6;
          const wing = scale * 0.32;
          g.lineStyle(2, color, 0.75);
          g.beginPath();
          g.moveTo(aimX - Math.cos(facingRad - wingAngle) * wing, aimY - Math.sin(facingRad - wingAngle) * wing);
          g.lineTo(aimX, aimY);
          g.lineTo(aimX - Math.cos(facingRad + wingAngle) * wing, aimY - Math.sin(facingRad + wingAngle) * wing);
          g.strokePath();

          if (isThrusterFiring) {
            const backX = -Math.cos(facingRad) * scale * 0.7;
            const backY = -Math.sin(facingRad) * scale * 0.7;
            const flame = scale * (0.45 + Math.random() * 0.2);
            g.fillStyle(COLORS.flame, 0.85);
            g.beginPath();
            g.moveTo(
              backX - Math.cos(facingRad + 1.4) * scale * 0.18,
              backY - Math.sin(facingRad + 1.4) * scale * 0.18,
            );
            g.lineTo(backX - Math.cos(facingRad) * flame, backY - Math.sin(facingRad) * flame);
            g.lineTo(
              backX - Math.cos(facingRad - 1.4) * scale * 0.18,
              backY - Math.sin(facingRad - 1.4) * scale * 0.18,
            );
            g.closePath();
            g.fillPath();
          }

          const barWidth = scale * 0.9;
          const barY = scale * 2.6;
          g.lineStyle(1, color, 0.35);
          g.strokeRect(-barWidth / 2, barY, barWidth, 3);
          g.fillStyle(color, 0.8);
          g.fillRect(-barWidth / 2, barY, barWidth * puffFuelRatio, 3);
        }

        const hasBeenRescuedOnce = data.hasBeenRescuedOnce === true;
        if (isAdrift && !hasBeenRescuedOnce) {
          const remainingSeconds = typeof data.remainingSeconds === 'number' ? data.remainingSeconds : 0;
          timerText.setText(`${remainingSeconds}`);
          timerText.setVisible(true);
        } else {
          timerText.setVisible(false);
        }
      };
      redraw(entity.data);

      return {
        applySnapshot: (snapshot) => {
          graphics.setPosition(snapshot.x, snapshot.y);
          timerText.setPosition(snapshot.x, snapshot.y + scale * 1.7);
          redraw(snapshot.data);
        },
        destroy: () => {
          graphics.destroy();
          timerText.destroy();
        },
      };
    });

    // The hull's own draw() never rotates by heading either (it drifts
    // without visually turning to face it) - only the carousel ring's
    // ambient rotation and node pulsing change, and both are already a
    // pure function of the clock, same as the asteroid/UFO/Shield
    // mirrors' own cosmetic animations.
    this.entityMirrors.registerFactory('saboteur', (scene, entity) => {
      const METAL = 0x3c4560;
      const METAL_FILL = 0x14141c;
      const DANGER = 0xe0463c;
      const NODE_COUNT = 5;
      const RING_ROTATE_PERIOD_MS = 7000;
      const graphics = scene.add.graphics();

      const drawNode = (
        g: Phaser.GameObjects.Graphics,
        x: number,
        y: number,
        filled: boolean,
        nowMs: number,
      ): void => {
        const pulse = 0.5 + Math.sin(nowMs / 500) * 0.5;
        g.lineStyle(1.3, METAL, filled ? 1 : 0.35);
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2;
          g.beginPath();
          g.moveTo(x + Math.cos(a) * 1.8, y + Math.sin(a) * 1.8);
          g.lineTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4);
          g.strokePath();
        }
        g.fillStyle(METAL_FILL, filled ? 1 : 0.25);
        g.fillCircle(x, y, 2.2);
        g.lineStyle(1, METAL, filled ? 1 : 0.35);
        g.strokeCircle(x, y, 2.2);
        if (filled) {
          g.fillStyle(DANGER, 0.5 + pulse * 0.4);
          g.fillCircle(x, y, 1);
        }
      };

      const redraw = (data: EntitySnapshot['data']): void => {
        const nowMs = scene.time.now;
        const minesRemaining = typeof data.minesRemaining === 'number' ? data.minesRemaining : 0;
        const justDropped = data.justDropped === true;
        const g = graphics;
        g.clear();
        const hullFill = justDropped ? 0x2a1414 : METAL_FILL;

        g.lineStyle(1.5, METAL, 1);
        g.fillStyle(hullFill, 1);
        g.beginPath();
        g.moveTo(-20, -8);
        g.lineTo(14, -10);
        g.lineTo(20, -4);
        g.lineTo(20, 4);
        g.lineTo(14, 10);
        g.lineTo(-20, 8);
        g.closePath();
        g.fillPath();
        g.strokePath();
        g.lineStyle(1.5, DANGER, 0.35);
        g.strokePath();

        const ringRotation = (nowMs / RING_ROTATE_PERIOD_MS) * Math.PI * 2;
        for (let i = 0; i < NODE_COUNT; i += 1) {
          const angle = (i / NODE_COUNT) * Math.PI * 2 + ringRotation;
          const nx = Math.cos(angle) * 15;
          const ny = Math.sin(angle) * 15 * 0.55;
          drawNode(g, nx, ny, i < minesRemaining, nowMs);
        }
      };
      redraw(entity.data);

      return {
        applySnapshot: (snapshot) => {
          graphics.setPosition(snapshot.x, snapshot.y);
          redraw(snapshot.data);
        },
        destroy: () => graphics.destroy(),
      };
    });

    // `armed` is the one real gameplay fact this entity's visual depends
    // on (the blast-radius ring only shows once armed) - sent straight
    // from the host's own `isArmed(nowMs)` rather than the client trying
    // to re-derive it from a dropped-at timestamp and its own clock. The
    // prong spin's per-instance phase offset isn't synced (same
    // "re-roll it locally" choice the asteroid mirror already makes) -
    // just a different-looking spin, not a different gameplay fact.
    this.entityMirrors.registerFactory('driftMine', (scene) => {
      const graphics = scene.add.graphics();
      const ringGraphics = scene.add.graphics();
      const spinPhase = Math.random() * Math.PI * 2;
      let ringDrawnForArmedState: boolean | undefined;

      const drawRing = (armed: boolean): void => {
        if (ringDrawnForArmedState === armed) return;
        ringDrawnForArmedState = armed;
        const g = ringGraphics;
        g.clear();
        if (!armed) return;
        g.lineStyle(1.2, COLORS.ufo, 0.5);
        const dashLength = 4;
        const gapLength = 5;
        const circumference = 2 * Math.PI * DRIFT_MINE.blastRadius;
        const segments = Math.max(8, Math.floor(circumference / (dashLength + gapLength)));
        g.beginPath();
        for (let i = 0; i < segments; i += 1) {
          const a0 = (i / segments) * Math.PI * 2;
          const a1 = a0 + (dashLength / circumference) * Math.PI * 2;
          g.moveTo(Math.cos(a0) * DRIFT_MINE.blastRadius, Math.sin(a0) * DRIFT_MINE.blastRadius);
          g.arc(0, 0, DRIFT_MINE.blastRadius, a0, a1, false);
        }
        g.strokePath();
      };

      const redraw = (armed: boolean): void => {
        const nowMs = scene.time.now;
        drawRing(armed);

        const g = graphics;
        g.clear();
        const spin = nowMs / 2600 + spinPhase;
        const pulse = 0.5 + Math.sin(nowMs / 500) * 0.5;

        g.save();
        g.rotateCanvas(spin);
        for (let i = 0; i < 8; i += 1) {
          const a = (i / 8) * Math.PI * 2;
          const inner = DRIFT_MINE.radius * 0.5;
          const outer = DRIFT_MINE.radius * 1.3;
          g.lineStyle(1.6, 0x3c4560, 1);
          g.beginPath();
          g.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
          g.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
          g.strokePath();
          g.fillStyle(0x3c4560, 1);
          g.fillCircle(Math.cos(a) * outer, Math.sin(a) * outer, 1.3);
        }

        g.fillStyle(0x14141c, 1);
        g.fillCircle(0, 0, DRIFT_MINE.radius * 0.65);
        g.lineStyle(1.4, 0x3c4560, 1);
        g.strokeCircle(0, 0, DRIFT_MINE.radius * 0.65);

        g.fillStyle(COLORS.ufo, armed ? 0.55 + pulse * 0.45 : 0.3);
        g.fillCircle(0, 0, DRIFT_MINE.radius * 0.3 * (0.8 + pulse * 0.35));
        g.restore();
      };
      redraw(false);

      return {
        applySnapshot: (snapshot) => {
          graphics.setPosition(snapshot.x, snapshot.y);
          ringGraphics.setPosition(snapshot.x, snapshot.y);
          redraw(snapshot.data.armed === true);
        },
        destroy: () => {
          graphics.destroy();
          ringGraphics.destroy();
        },
      };
    });

    // Singleton, purely cosmetic beyond position (GameScene owns every
    // actual drop-off/relocate decision) - the pulsing center light is a
    // pure function of the clock, same as every other ambient-pulse
    // mirror above.
    this.entityMirrors.registerFactory('spaceStation', (scene) => {
      const graphics = scene.add.graphics();
      const pulsePeriodMs = 1800;
      const armWidth = SPACE_STATION.armLength * 0.32;
      const armLength = SPACE_STATION.armLength;

      const redraw = (): void => {
        const nowMs = scene.time.now;
        const g = graphics;
        g.clear();
        for (let i = 0; i < 4; i += 1) {
          g.save();
          g.rotateCanvas((Math.PI / 2) * i);
          g.fillStyle(0x0d0d16, 1);
          g.lineStyle(2.5, COLORS.shield, 1);
          g.beginPath();
          g.moveTo(-armWidth / 2, armWidth);
          g.lineTo(armWidth / 2, armWidth);
          g.lineTo(armWidth / 2, armLength);
          g.lineTo(-armWidth / 2, armLength);
          g.closePath();
          g.fillPath();
          g.strokePath();
          g.restore();
        }

        g.fillStyle(0x0d0d16, 1);
        g.lineStyle(2.5, COLORS.shield, 1);
        g.beginPath();
        g.moveTo(-armWidth, -armWidth);
        g.lineTo(armWidth, -armWidth);
        g.lineTo(armWidth, armWidth);
        g.lineTo(-armWidth, armWidth);
        g.closePath();
        g.fillPath();
        g.strokePath();

        const pulsePhase = (nowMs / pulsePeriodMs) * Math.PI * 2;
        const pulse = 0.6 + 0.4 * (Math.sin(pulsePhase) * 0.5 + 0.5);
        g.fillStyle(COLORS.shield, 0.6);
        g.fillCircle(0, 0, armWidth * 0.4 * pulse);
      };
      redraw();

      return {
        applySnapshot: (snapshot) => {
          graphics.setPosition(snapshot.x, snapshot.y);
          redraw();
        },
        destroy: () => graphics.destroy(),
      };
    });

    // The disk's spiraling particles are genuinely host-simulated random
    // state (`BlackHole.ts`'s own `update()`), not a pure function of
    // time - syncing all 16 every tick would cost far more than the
    // effect is worth, so this mirror runs its own independent particle
    // sim instead (own RNG, own local delta clock) - "a similar swirl,"
    // not "the exact same particles," same tradeoff the asteroid
    // mirror's re-rolled silhouette already makes.
    this.entityMirrors.registerFactory('blackHole', (scene) => {
      const diskRadius = BLACK_HOLE.eventHorizonRadius * 1.4;
      const diskSquash = 0.4;
      const particleCount = 16;
      const glowLayers = 4;
      const graphics = scene.add.graphics();
      const particles = Array.from({ length: particleCount }, () => ({
        angle: Math.random() * Math.PI * 2,
        radiusFraction: Math.random(),
      }));
      let lastUpdateMs = scene.time.now;

      const redraw = (): void => {
        const nowMs = scene.time.now;
        const deltaSeconds = Math.max(0, (nowMs - lastUpdateMs) / 1000);
        lastUpdateMs = nowMs;
        particles.forEach((particle) => {
          particle.radiusFraction -= deltaSeconds * 0.25;
          if (particle.radiusFraction <= 0) {
            particle.radiusFraction = 1;
            particle.angle = Math.random() * Math.PI * 2;
          }
        });

        const g = graphics;
        g.clear();
        for (let i = glowLayers; i >= 1; i -= 1) {
          const t = i / glowLayers;
          const radius = BLACK_HOLE.eventHorizonRadius + (BLACK_HOLE.glowRadius - BLACK_HOLE.eventHorizonRadius) * t;
          g.fillStyle(COLORS.blackHole, 0.05 * (1 - t * 0.6));
          g.fillCircle(0, 0, radius);
        }

        g.save();
        g.rotateCanvas(nowMs / 6000);
        g.lineStyle(3, COLORS.blackHole, 1);
        g.strokeEllipse(0, 0, diskRadius * 2, diskRadius * 2 * diskSquash);
        g.restore();

        particles.forEach((particle) => {
          const radius = diskRadius * (0.2 + particle.radiusFraction * 0.8);
          const x = Math.cos(particle.angle) * radius;
          const y = Math.sin(particle.angle) * radius * diskSquash;
          g.fillStyle(COLORS.blackHole, 0.5 + particle.radiusFraction * 0.5);
          g.fillCircle(x, y, 2);
        });

        g.fillStyle(0x000000, 1);
        g.fillCircle(0, 0, BLACK_HOLE.lethalRadius);

        const horizonPulse = 0.7 + 0.3 * Math.sin(nowMs / 450);
        g.lineStyle(2.5, COLORS.ufo, horizonPulse);
        g.strokeCircle(0, 0, BLACK_HOLE.eventHorizonRadius);

        const corePulse = 0.5 + 0.5 * Math.sin(nowMs / 300);
        g.fillStyle(COLORS.ufo, 0.6 + 0.4 * corePulse);
        g.fillCircle(0, 0, BLACK_HOLE.lethalRadius * 0.35 * (0.8 + 0.4 * corePulse));
      };
      redraw();

      return {
        applySnapshot: (snapshot) => {
          graphics.setPosition(snapshot.x, snapshot.y);
          redraw();
        },
        destroy: () => graphics.destroy(),
      };
    });

    // Phase 1 Core - its 6 shards are per-instance random layout
    // (`Fracture.ts`'s own constructor), re-rolled locally rather than
    // synced (same "a similar one" tradeoff the asteroid mirror already
    // makes); `materializeProgress` rides the snapshot precomputed, so
    // this mirror never needs `spawnedAtMs` or a clock aligned with the
    // host's at all.
    this.entityMirrors.registerFactory('fracture', (scene) => {
      const shardCount = 6;
      const baseDist = 46;
      const distVariance = 16;
      const minRadius = 15;
      const radiusVariance = 7;
      const shards = Array.from({ length: shardCount }, (_, i) => ({
        angle: (i / shardCount) * Math.PI * 2 + 0.3,
        dist: baseDist + (i % 2) * distVariance,
        bobPhase: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.0004,
        points: generateAsteroidPoints(6, 0.4),
        radius: minRadius + Math.random() * radiusVariance,
      }));
      const graphics = scene.add.graphics();

      const redraw = (data: EntitySnapshot['data']): void => {
        const nowMs = scene.time.now;
        const progress = typeof data.materializeProgress === 'number' ? data.materializeProgress : 1;
        const g = graphics;
        g.clear();
        g.setAlpha(progress);
        g.setScale(0.3 + 0.7 * progress);

        const pulse = 0.55 + 0.45 * Math.sin(nowMs / 500);

        shards.forEach((s) => {
          const bob = Math.sin(nowMs / 1400 + s.bobPhase) * 4;
          const x = Math.cos(s.angle) * (s.dist + bob);
          const y = Math.sin(s.angle) * (s.dist + bob);

          g.lineStyle(1, COLORS.ufo, 0.2 + 0.3 * pulse);
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo(x, y);
          g.strokePath();

          g.save();
          g.translateCanvas(x, y);
          g.rotateCanvas(nowMs * s.rotSpeed);
          g.fillStyle(COLORS.fractureFill, 1);
          g.lineStyle(1.6, COLORS.fracture, 1);
          g.beginPath();
          s.points.forEach((p, i) => {
            const px = p.x * s.radius;
            const py = p.y * s.radius;
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          });
          g.closePath();
          g.fillPath();
          g.strokePath();
          g.restore();
        });

        g.fillStyle(COLORS.ufo, 0.12 * pulse);
        g.fillCircle(0, 0, 18 + 6 * pulse);
        g.fillStyle(COLORS.ufo, 0.6 + 0.4 * pulse);
        g.fillCircle(0, 0, 8 + 2 * pulse);
      };
      redraw({});

      return {
        applySnapshot: (snapshot) => {
          graphics.setPosition(snapshot.x, snapshot.y);
          redraw(snapshot.data);
        },
        destroy: () => graphics.destroy(),
      };
    });

    // Phase 2 Fragment - `role` and the aggressive ring's `ringElapsedMs`
    // are real gameplay facts (hit-testing happens host-side, but the
    // ring telegraph/expand/fade is a fairness cue every player needs to
    // see correctly) and ride the snapshot exactly; the shard layout and
    // gravity-particle swirl are per-instance cosmetic randomness,
    // re-rolled/re-simulated locally, same tradeoff `blackHole`'s own
    // mirror already makes for its particle disk.
    this.entityMirrors.registerFactory('fractureFragment', (scene, entity) => {
      const shardCount = 3;
      const baseDist = 24;
      const distVariance = 10;
      const minRadius = 9;
      const radiusVariance = 5;
      const gravityParticleCount = 4;
      const shards = Array.from({ length: shardCount }, (_, i) => ({
        angle: (i / shardCount) * Math.PI * 2 + Math.random(),
        dist: baseDist + Math.random() * distVariance,
        bobPhase: Math.random() * Math.PI * 2,
        points: generateAsteroidPoints(6, 0.4),
        radius: minRadius + Math.random() * radiusVariance,
      }));
      const gravityParticles = Array.from({ length: gravityParticleCount }, (_, i) => ({
        angle: (i / gravityParticleCount) * Math.PI * 2,
        frac: Math.random(),
      }));
      const graphics = scene.add.graphics();
      let lastUpdateMs = scene.time.now;

      const roleColor = (role: string): number => {
        if (role === 'aggressive') return COLORS.ufo;
        if (role === 'gravity') return COLORS.blackHole;
        return COLORS.fractureLauncher;
      };

      const redraw = (data: EntitySnapshot['data']): void => {
        const nowMs = scene.time.now;
        const deltaSeconds = Math.max(0, (nowMs - lastUpdateMs) / 1000);
        lastUpdateMs = nowMs;
        const role = typeof data.role === 'string' ? data.role : 'aggressive';
        const progress = typeof data.materializeProgress === 'number' ? data.materializeProgress : 1;
        const ringElapsedMs = typeof data.ringElapsedMs === 'number' ? data.ringElapsedMs : 0;

        const g = graphics;
        g.clear();
        g.setAlpha(progress);
        g.setScale(0.3 + 0.7 * progress);

        const pulse = 0.55 + 0.45 * Math.sin(nowMs / 500);
        const color = roleColor(role);

        shards.forEach((s) => {
          const jitter = role === 'aggressive' ? Math.sin(nowMs / 90 + s.bobPhase * 10) * 0.3 : 0;
          const bob = Math.sin(nowMs / 1200 + s.bobPhase) * 3;
          const x = Math.cos(s.angle + jitter) * (s.dist + bob);
          const y = Math.sin(s.angle + jitter) * (s.dist + bob);

          g.lineStyle(1, color, 0.25 + 0.35 * pulse);
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo(x, y);
          g.strokePath();

          g.save();
          g.translateCanvas(x, y);
          g.fillStyle(COLORS.fractureFill, 1);
          g.lineStyle(1.4, COLORS.fracture, 1);
          g.beginPath();
          s.points.forEach((p, i) => {
            const px = p.x * s.radius;
            const py = p.y * s.radius;
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          });
          g.closePath();
          g.fillPath();
          g.strokePath();
          g.restore();
        });

        if (role === 'gravity') {
          gravityParticles.forEach((p) => {
            p.frac -= deltaSeconds * 0.5;
            if (p.frac <= 0) {
              p.frac = 1;
              p.angle = Math.random() * Math.PI * 2;
            }
            const r = 22 * p.frac;
            const px = Math.cos(p.angle) * r;
            const py = Math.sin(p.angle) * r;
            g.fillStyle(COLORS.blackHole, 0.3 + 0.6 * p.frac);
            g.fillCircle(px, py, 1.6);
          });
          g.lineStyle(1, COLORS.blackHole, 0.15);
          g.strokeCircle(0, 0, FRACTURE.fragmentRadius * FRACTURE.gravityPullRadiusMultiplier);
        }

        if (role === 'aggressive') {
          const ringMaxRadius = FRACTURE.fragmentRadius * FRACTURE.ringMaxRadiusMultiplier;
          const phase = ringPhaseAt(ringElapsedMs, FRACTURE.ringTelegraphMs, FRACTURE.ringExpandMs, FRACTURE.ringFadeMs);
          if (phase === 'telegraph') {
            g.lineStyle(1.5, COLORS.ufo, 0.2 + 0.4 * (ringElapsedMs / FRACTURE.ringTelegraphMs));
            g.strokeCircle(0, 0, ringMaxRadius);
          } else if (phase === 'expanding') {
            const r = ringLethalRadiusAt(ringElapsedMs, FRACTURE.ringTelegraphMs, FRACTURE.ringExpandMs, ringMaxRadius);
            g.lineStyle(3, COLORS.ufo, 0.85);
            g.strokeCircle(0, 0, r ?? 0);
          } else if (phase === 'fading') {
            const fadeT = (ringElapsedMs - FRACTURE.ringTelegraphMs - FRACTURE.ringExpandMs) / FRACTURE.ringFadeMs;
            g.lineStyle(3, COLORS.ufo, 0.85 * (1 - fadeT));
            g.strokeCircle(0, 0, ringMaxRadius);
          }
        }

        g.fillStyle(color, 0.12 * pulse);
        g.fillCircle(0, 0, 14 + 5 * pulse);
        g.fillStyle(color, 0.6 + 0.4 * pulse);
        g.fillCircle(0, 0, 6 + 1.5 * pulse);
      };
      redraw(entity.data);

      return {
        applySnapshot: (snapshot) => {
          graphics.setPosition(snapshot.x, snapshot.y);
          redraw(snapshot.data);
        },
        destroy: () => graphics.destroy(),
      };
    });

    this.entityMirrors.registerFactory('fractureShard', (scene) => {
      const points = generateAsteroidPoints(6, 0.4);
      const graphics = scene.add.graphics();
      graphics.fillStyle(COLORS.fractureFill, 1);
      graphics.lineStyle(1.3, COLORS.fractureLauncher, 1);
      graphics.beginPath();
      points.forEach((p, i) => {
        const px = p.x * FRACTURE.swarmRadius;
        const py = p.y * FRACTURE.swarmRadius;
        if (i === 0) graphics.moveTo(px, py);
        else graphics.lineTo(px, py);
      });
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();

      return {
        applySnapshot: (snapshot) => graphics.setPosition(snapshot.x, snapshot.y).setRotation(snapshot.rotation),
        destroy: () => graphics.destroy(),
      };
    });

    // Phase 3 pickup - `kind` is synced (it's this instance's fixed
    // identity, same reasoning asteroid `size` is synced but its
    // silhouette isn't); the tumble itself (spin/bob phase/speed) is
    // per-instance cosmetic randomness, re-rolled locally.
    this.entityMirrors.registerFactory('fractureSwarmBit', (scene, entity) => {
      const halfExtentsByKind: Record<SwarmBitKind, { x: number; y: number; z: number }> = {
        core: { x: 15, y: 15, z: 15 },
        cargo: { x: 19, y: 7.6, z: 7.6 },
      };
      const baseTilt = 0.55;
      const signs = [-1, 1];
      const prismEdges: readonly (readonly [number, number])[] = [
        [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7],
      ];
      const prismVertices = (half: { x: number; y: number; z: number }) => {
        const verts: { x: number; y: number; z: number }[] = [];
        for (const sx of signs) {
          for (const sy of signs) {
            for (const sz of signs) {
              verts.push({ x: sx * half.x, y: sy * half.y, z: sz * half.z });
            }
          }
        }
        return verts;
      };
      const project3D = (p: { x: number; y: number; z: number }, spin: number, tilt: number) => {
        const cosSpin = Math.cos(spin);
        const sinSpin = Math.sin(spin);
        const x1 = p.x * cosSpin + p.z * sinSpin;
        const z1 = -p.x * sinSpin + p.z * cosSpin;
        const cosTilt = Math.cos(tilt);
        const sinTilt = Math.sin(tilt);
        const y2 = p.y * cosTilt - z1 * sinTilt;
        const z2 = p.y * sinTilt + z1 * cosTilt;
        return { x: x1, y: y2, z: z2 };
      };

      const kind: SwarmBitKind = entity.data.kind === 'cargo' ? 'cargo' : 'core';
      const halfExtents = halfExtentsByKind[kind];
      const depthRange = Math.hypot(halfExtents.x, halfExtents.z);
      const spinSpeed = (Math.random() - 0.5) * 0.8;
      const spinPhase = Math.random() * Math.PI * 2;
      const bobPhase = Math.random() * Math.PI * 2;
      const spawnedAtMs = scene.time.now;
      const graphics = scene.add.graphics();

      const redraw = (data: EntitySnapshot['data']): void => {
        const nowMs = scene.time.now;
        const progress = typeof data.materializeProgress === 'number' ? data.materializeProgress : 1;
        const pulse = 0.5 + Math.sin(nowMs / 700) * 0.5;
        const g = graphics;
        g.clear();
        g.setAlpha(progress);
        g.setScale((0.3 + 0.7 * progress) * (1 + pulse * 0.08));

        const bobY = Math.sin(nowMs / 900 + bobPhase) * 1.5;
        const elapsedSec = (nowMs - spawnedAtMs) / 1000;
        const spin = elapsedSec * spinSpeed + spinPhase;
        const tilt = baseTilt + Math.sin(nowMs / 1300 + bobPhase) * 0.12;

        const glowRadius = depthRange * (0.85 + pulse * 0.3);
        g.fillStyle(COLORS.scrap, 0.16 + pulse * 0.1);
        g.fillCircle(0, bobY, glowRadius);

        const projected = prismVertices(halfExtents).map((v) => project3D(v, spin, tilt));

        prismEdges.forEach(([ia, ib]) => {
          const a = projected[ia]!;
          const b = projected[ib]!;
          const depthT = Math.max(0, Math.min(1, ((a.z + b.z) / 2 + depthRange) / (depthRange * 2)));
          const alpha = 0.5 + depthT * 0.5;
          const ax = a.x;
          const ay = a.y + bobY;
          const bx = b.x;
          const by = b.y + bobY;

          g.lineStyle(1.4, 0x3c4560, alpha);
          g.beginPath();
          g.moveTo(ax, ay);
          g.lineTo(bx, by);
          g.strokePath();

          g.lineStyle(1.4, COLORS.scrap, Math.min(1, (0.45 + pulse * 0.55) * alpha));
          g.beginPath();
          g.moveTo(ax, ay);
          g.lineTo(bx, by);
          g.strokePath();
        });
      };
      redraw(entity.data);

      return {
        applySnapshot: (snapshot) => {
          graphics.setPosition(snapshot.x, snapshot.y);
          redraw(snapshot.data);
        },
        destroy: () => graphics.destroy(),
      };
    });

    // The Core's laser - not Matter-backed host-side either (pure beam
    // math), so this mirror is purely `elapsedMs`-driven, reproducing
    // `FractureLaser.draw()`'s own telegraph/active/fading phases exactly
    // since that elapsed value rides the snapshot precomputed.
    this.entityMirrors.registerFactory('fractureLaser', (scene, entity) => {
      const graphics = scene.add.graphics();

      const redraw = (snapshot: EntitySnapshot): void => {
        const elapsedMs = typeof snapshot.data.elapsedMs === 'number' ? snapshot.data.elapsedMs : 0;
        const direction = fromAngle(snapshot.rotation);
        const end = { x: direction.x * FRACTURE.laserLength, y: direction.y * FRACTURE.laserLength };
        const g = graphics;
        g.clear();
        g.setPosition(snapshot.x, snapshot.y);

        if (elapsedMs < FRACTURE.laserTelegraphMs) {
          const t = elapsedMs / FRACTURE.laserTelegraphMs;
          g.lineStyle(1.5, COLORS.ufo, 0.25 + 0.35 * t);
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo(end.x, end.y);
          g.strokePath();
          return;
        }

        if (elapsedMs < FRACTURE.laserTelegraphMs + FRACTURE.laserActiveMs) {
          g.lineStyle(FRACTURE.laserWidth, COLORS.ufo, 0.95);
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo(end.x, end.y);
          g.strokePath();
          g.lineStyle(Math.max(2, FRACTURE.laserWidth * 0.35), 0xffffff, 0.85);
          g.beginPath();
          g.moveTo(0, 0);
          g.lineTo(end.x, end.y);
          g.strokePath();
          return;
        }

        const fadeT =
          (elapsedMs - FRACTURE.laserTelegraphMs - FRACTURE.laserActiveMs) / FRACTURE.laserFadeMs;
        g.lineStyle(FRACTURE.laserWidth, COLORS.ufo, 0.9 * Math.max(0, 1 - fadeT));
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(end.x, end.y);
        g.strokePath();
      };
      redraw(entity);

      return {
        applySnapshot: (snapshot) => redraw(snapshot),
        destroy: () => graphics.destroy(),
      };
    });

    // The Cardinal - singleton, fixed at arena-center. Bundles its boss
    // health bar UI (`createCardinalHealthBar`/`updateCardinalHealthBar`'s
    // own host-side counterparts) into this same mirror rather than a
    // separate one, since both only ever exist exactly while this entity
    // does - one create, one destroy, same lifecycle.
    this.entityMirrors.registerFactory('cardinal', (scene, entity) => {
      const armTrussWidth = 34;
      const cannonLen = 60;
      const cannonWidth = 56;
      const metalMid = 0x232a3c;
      const metalLight = 0x3c4560;
      const coreSides = 8;

      const graphics = scene.add.graphics();
      graphics.setPosition(entity.x, entity.y);
      const countdownText = scene.add
        .text(entity.x, entity.y, '', {
          fontFamily: 'monospace',
          fontStyle: 'bold',
          fontSize: '56px',
          color: '#0a0b13',
        })
        .setOrigin(0.5)
        .setVisible(false);

      const centerX = entity.x;
      const barY = entity.y + CARDINAL.coreRadius + CARDINAL_HEALTH_BAR.marginTop;
      const barLeft = centerX - CARDINAL_HEALTH_BAR.width / 2;
      const healthLabelText = scene.add
        .text(centerX, barY - 18, 'ARMS', {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: toCssHex(COLORS.cardinal),
        })
        .setOrigin(0.5);
      const healthBorder = scene.add
        .rectangle(centerX, barY, CARDINAL_HEALTH_BAR.width, CARDINAL_HEALTH_BAR.height)
        .setStrokeStyle(2, COLORS.cardinal);
      const healthFill = scene.add
        .rectangle(barLeft, barY, CARDINAL_HEALTH_BAR.width, CARDINAL_HEALTH_BAR.height - 4, COLORS.cardinal)
        .setOrigin(0, 0.5);

      const drawArm = (
        g: Phaser.GameObjects.Graphics,
        glowColor: number,
        glowStrength: number,
        targetAlpha: number,
        beamAlpha: number,
      ): void => {
        const innerX = CARDINAL.armInnerRadius;
        const trussLen = CARDINAL.armReach - cannonLen - innerX;

        g.fillStyle(COLORS.cardinalFill, 1);
        g.lineStyle(3, metalLight, 1);
        g.fillRect(innerX, -armTrussWidth / 2, trussLen, armTrussWidth);
        g.strokeRect(innerX, -armTrussWidth / 2, trussLen, armTrussWidth);

        g.lineStyle(4, glowColor, 0.5 + glowStrength * 0.5);
        g.beginPath();
        g.moveTo(innerX + 6, 0);
        g.lineTo(innerX + trussLen - 4, 0);
        g.strokePath();

        g.lineStyle(2, metalLight, 1);
        g.strokeCircle(innerX + trussLen * 0.55, 0, armTrussWidth * 0.42);

        const cannonX = CARDINAL.armReach - cannonLen;
        g.fillStyle(COLORS.cardinalFill, 1);
        g.lineStyle(3, metalLight, 1);
        g.fillRect(cannonX, -cannonWidth / 2, cannonLen, cannonWidth);
        g.strokeRect(cannonX, -cannonWidth / 2, cannonLen, cannonWidth);

        g.fillStyle(glowColor, 0.35 + glowStrength * 0.65);
        g.fillCircle(CARDINAL.armReach - 10, 0, cannonWidth * 0.28);

        if (targetAlpha > 0) {
          g.lineStyle(1.5, COLORS.ufo, targetAlpha);
          g.beginPath();
          g.moveTo(innerX + 40, 0);
          g.lineTo(CARDINAL.armReach, 0);
          g.strokePath();
        }

        if (beamAlpha > 0) {
          g.fillStyle(COLORS.ufo, beamAlpha);
          g.fillRect(
            CARDINAL.armReach,
            -CARDINAL.laserWidth / 2,
            CARDINAL.laserLength - CARDINAL.armReach,
            CARDINAL.laserWidth,
          );
          g.fillStyle(0xffffff, beamAlpha * 0.85);
          g.fillRect(
            CARDINAL.armReach,
            -Math.max(2, CARDINAL.laserWidth * 0.35) / 2,
            CARDINAL.laserLength - CARDINAL.armReach,
            Math.max(2, CARDINAL.laserWidth * 0.35),
          );
        }
      };

      const drawArmWreck = (g: Phaser.GameObjects.Graphics): void => {
        const stubLen = 44;
        const innerX = CARDINAL.armInnerRadius;

        g.fillStyle(COLORS.cardinalFill, 1);
        g.lineStyle(3, metalMid, 1);
        g.fillRect(innerX, -armTrussWidth / 2, stubLen, armTrussWidth);
        g.strokeRect(innerX, -armTrussWidth / 2, stubLen, armTrussWidth);

        const bx = innerX + stubLen;
        g.lineStyle(2, metalLight, 1);
        g.beginPath();
        g.moveTo(bx, -armTrussWidth / 2);
        g.lineTo(bx + 14, -armTrussWidth / 4);
        g.lineTo(bx + 4, 0);
        g.lineTo(bx + 18, armTrussWidth / 4);
        g.lineTo(bx, armTrussWidth / 2);
        g.strokePath();

        g.fillStyle(COLORS.fractureLauncher, 0.35);
        g.fillCircle(bx - 10, 0, 3);
      };

      const drawCore = (g: Phaser.GameObjects.Graphics, glowColor: number, glowStrength: number): void => {
        const radius = CARDINAL.coreRadius;

        g.fillStyle(COLORS.cardinalFill, 1);
        g.lineStyle(3, metalLight, 1);
        g.beginPath();
        for (let i = 0; i < coreSides; i += 1) {
          const a = (i / coreSides) * Math.PI * 2 + Math.PI / coreSides;
          const px = Math.cos(a) * radius;
          const py = Math.sin(a) * radius;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
        g.fillPath();
        g.strokePath();

        const innerR = radius * 0.55;
        g.fillStyle(glowColor, 0.55 + glowStrength * 0.45);
        g.beginPath();
        for (let i = 0; i < coreSides; i += 1) {
          const a = (i / coreSides) * Math.PI * 2 + Math.PI / coreSides;
          const px = Math.cos(a) * innerR;
          const py = Math.sin(a) * innerR;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
        g.fillPath();
      };

      const redraw = (snapshot: EntitySnapshot): void => {
        const nowMs = scene.time.now;
        const data = snapshot.data;
        const phase = typeof data.phase === 'string' ? data.phase : 'armed';
        const armAliveMask = typeof data.armAliveMask === 'number' ? data.armAliveMask : 0;
        const progress = typeof data.materializeProgress === 'number' ? data.materializeProgress : 1;
        const cycleElapsedMs = typeof data.cycleElapsedMs === 'number' ? data.cycleElapsedMs : 0;
        const detonationProgress = typeof data.detonationProgress === 'number' ? data.detonationProgress : 0;
        const healthFraction = typeof data.healthFraction === 'number' ? data.healthFraction : 0;
        const healthLabel = typeof data.healthLabel === 'string' ? data.healthLabel : 'ARMS';

        const g = graphics;
        g.clear();
        g.setAlpha(progress);
        g.setScale(0.3 + 0.7 * progress);
        g.setRotation(snapshot.rotation);

        let glowColor: number = COLORS.cardinal;
        let glowStrength = 0.2 + Math.sin(nowMs / 500) * 0.05;
        let targetAlpha = 0;
        let beamAlpha = 0;

        if (phase === 'armed') {
          if (cycleElapsedMs < CARDINAL.laserCooldownMs) {
            // idle - defaults above stand
          } else if (cycleElapsedMs < CARDINAL.laserCooldownMs + CARDINAL.laserTelegraphMs) {
            const t = (cycleElapsedMs - CARDINAL.laserCooldownMs) / CARDINAL.laserTelegraphMs;
            glowColor = COLORS.fractureLauncher;
            glowStrength = 0.3 + t * 0.7;
            targetAlpha = (Math.max(0, t - 0.3) / 0.7) * 0.6;
          } else if (cycleElapsedMs < CARDINAL.laserCooldownMs + CARDINAL.laserTelegraphMs + CARDINAL.laserActiveMs) {
            glowColor = COLORS.ufo;
            glowStrength = 1;
            beamAlpha = 1;
          } else {
            const t =
              (cycleElapsedMs - CARDINAL.laserCooldownMs - CARDINAL.laserTelegraphMs - CARDINAL.laserActiveMs) /
              CARDINAL.laserFadeMs;
            glowColor = COLORS.ufo;
            glowStrength = 1 - t;
            beamAlpha = 1 - t;
          }
        } else if (phase === 'critical') {
          const pulse = 0.5 + Math.sin(nowMs / 180) * 0.5;
          glowColor = COLORS.ufo;
          glowStrength = 0.6 + pulse * 0.4;
        }

        for (let i = 0; i < CARDINAL.armCount; i += 1) {
          g.save();
          g.rotateCanvas(i * (Math.PI / 2));
          if ((armAliveMask & (1 << i)) !== 0) {
            drawArm(g, glowColor, glowStrength, targetAlpha, beamAlpha);
          } else {
            drawArmWreck(g);
          }
          g.restore();
        }

        drawCore(g, glowColor, glowStrength);

        if (phase === 'critical') {
          const r = detonationProgress * CARDINAL.detonationMaxRadius;
          g.fillStyle(COLORS.ufo, 0.05 + detonationProgress * 0.05);
          g.fillCircle(0, 0, r);
          g.lineStyle(3 + detonationProgress * 2, COLORS.ufo, 0.45 + detonationProgress * 0.4);
          g.strokeCircle(0, 0, r);

          const secondsLeft = Math.max(
            1,
            Math.ceil((CARDINAL.detonationCountdownMs - detonationProgress * CARDINAL.detonationCountdownMs) / 1000),
          );
          countdownText.setText(String(secondsLeft)).setVisible(true);
        } else {
          countdownText.setVisible(false);
        }

        healthFill.width = Math.max(0, CARDINAL_HEALTH_BAR.width * healthFraction);
        healthLabelText.setText(healthLabel);
      };
      redraw(entity);

      return {
        applySnapshot: (snapshot) => {
          graphics.setPosition(snapshot.x, snapshot.y);
          countdownText.setPosition(snapshot.x, snapshot.y);
          redraw(snapshot);
        },
        destroy: () => {
          graphics.destroy();
          countdownText.destroy();
          healthLabelText.destroy();
          healthBorder.destroy();
          healthFill.destroy();
        },
      };
    });

    this.entityMirrors.registerFactory('cardinalPlasma', (scene, entity) => {
      const graphics = scene.add.graphics();
      graphics.fillStyle(COLORS.fractureLauncher, 0.18);
      graphics.fillCircle(0, 0, CARDINAL.plasmaRadius * 1.8);
      graphics.fillStyle(COLORS.fractureLauncher, 1);
      graphics.fillCircle(0, 0, CARDINAL.plasmaRadius);
      graphics.setPosition(entity.x, entity.y);

      return {
        applySnapshot: (snapshot) => graphics.setPosition(snapshot.x, snapshot.y),
        destroy: () => graphics.destroy(),
      };
    });
  }

  /**
   * Client only - the entire per-frame loop for a network client,
   * standing in for the ordinary `update()` below exactly once (see
   * `update()`'s own early-return). Sends this machine's own local
   * input upstream, then applies whatever `GameSnapshot` most recently
   * arrived - no local physics for any ship runs here at all.
   */
  private updateNetworkClient(deltaSeconds: number): void {
    const localPlayer = this.players.find((player) => player.slotIndex === this.localSlotIndex);
    if (localPlayer && this.localInput) {
      this.clientSession?.sendInput({
        type: 'debris-input',
        slotIndex: this.localSlotIndex,
        turnDirection: this.localInput.turnDirection,
        isThrusting: this.localInput.isThrusting,
        isFiring: this.localInput.isFiring,
        isHyperspacing: this.localInput.isHyperspacing,
      });
    }

    const snapshot = this.latestSnapshot;
    if (snapshot) {
      snapshot.ships.forEach((shipSnapshot) => {
        const player = this.players.find((p) => p.slotIndex === shipSnapshot.slotIndex);
        player?.ship.applyNetworkSnapshot(shipSnapshot, snapshot.nowMs);
      });
      this.entityMirrors.reconcile(this, snapshot.entities);
      snapshot.players.forEach((hud) => {
        const player = this.players.find((p) => p.slotIndex === hud.slotIndex);
        player?.hudText.setText(formatPlayerHud(this.mode, hud, LIVES_PER_PLAYER));
      });
      this.applyClientOverlay(snapshot.state, snapshot.overlayLines);
      this.applyClientShop(snapshot.shop);
    }

    this.background.update(deltaSeconds);
  }

  /**
   * Client only (docs/roadmap.md's "Windows + LAN multiplayer," Sprint
   * 14) - mirrors whatever `this.overlayTexts` currently shows
   * host-side (boss announcement/game over/paused/...). Torn down the
   * instant a snapshot reports no overlay at all, regardless of
   * `state` - presence of actual lines is the lifecycle signal, `state`
   * only picks which of the two styles below to use.
   *
   * `enteringInitials` is the one host state with no `overlayTexts`
   * equivalent at all - it's the host's own local high-score entry
   * (its own machine's keyboard, its own leaderboard file), genuinely
   * nothing for a remote client to do there. A plain "GAME OVER" is
   * shown instead of leaving the client's screen with no explanation
   * at all for why nothing's moving.
   */
  private applyClientOverlay(state: string, lines: readonly string[]): void {
    const linesToShow = lines.length === 0 && state === 'enteringInitials' ? ['GAME OVER'] : lines;

    if (linesToShow.length === 0) {
      this.teardownClientOverlay();
      return;
    }

    if (this.clientOverlayTexts.length !== linesToShow.length) {
      this.teardownClientOverlay();
      // "A bigger, boss-colored variant," same distinction
      // `showBossAnnouncement` draws host-side versus the plain
      // multi-line `showOverlay` every other overlay state uses.
      if (state === 'bossAnnouncement' && linesToShow.length === 1) {
        this.clientOverlayTexts = [
          this.add
            .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, linesToShow[0]!, {
              fontFamily: 'monospace',
              fontSize: '96px',
              fontStyle: 'bold',
              color: toCssHex(COLORS.ufo),
            })
            .setOrigin(0.5),
        ];
      } else {
        const startY = ARENA_HEIGHT / 2 - (linesToShow.length - 1) * 24;
        this.clientOverlayTexts = linesToShow.map((line, i) =>
          this.add
            .text(ARENA_WIDTH / 2, startY + i * 48, line, {
              fontFamily: 'monospace',
              fontSize: i === 0 ? '48px' : '20px',
              color: '#ffffff',
            })
            .setOrigin(0.5),
        );
      }
      return;
    }

    this.clientOverlayTexts.forEach((text, i) => text.setText(linesToShow[i]!));
  }

  private teardownClientOverlay(): void {
    this.clientOverlayTexts.forEach((text) => text.destroy());
    this.clientOverlayTexts = [];
  }

  /**
   * Client only (docs/roadmap.md's "Windows + LAN multiplayer," Sprint
   * 14) - mirrors the host's own shop screen from `ShopSnapshot`'s
   * already-fully-formatted text/color, same layout math
   * `enterShop`/`buildShopPanel` use host-side. Built once per shop
   * session (the panel count/layout never changes mid-shop) and just
   * text/color-refreshed every tick after that; torn down the instant a
   * snapshot stops carrying one at all.
   */
  private applyClientShop(shop: ShopSnapshot | undefined): void {
    if (!shop) {
      this.teardownClientShop();
      return;
    }

    if (!this.clientShop) {
      this.clientShop = this.buildClientShop(shop);
    }
    this.refreshClientShop(shop);
  }

  private buildClientShop(shop: ShopSnapshot): NonNullable<typeof this.clientShop> {
    const headlineText = this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 220, shop.headline, {
        fontFamily: 'monospace',
        fontSize: '48px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const subheadlineText = this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 168, shop.subheadline, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#9a9ab0',
      })
      .setOrigin(0.5);
    const hintText = this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2 + 230, shop.hint, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#6a6a80',
      })
      .setOrigin(0.5);

    const panelCount = shop.panels.length;
    const totalWidth = panelCount * SHOP_PANEL_WIDTH + (panelCount - 1) * SHOP_PANEL_GAP;
    const startX = ARENA_WIDTH / 2 - totalWidth / 2 + SHOP_PANEL_WIDTH / 2;
    const panelY = ARENA_HEIGHT / 2 + 10;

    const panels = shop.panels.map((panelSnapshot, i) =>
      this.buildClientShopPanel(panelSnapshot, startX + i * (SHOP_PANEL_WIDTH + SHOP_PANEL_GAP), panelY),
    );

    return { headlineText, subheadlineText, hintText, panels };
  }

  private buildClientShopPanel(
    panel: ShopPanelSnapshot,
    x: number,
    y: number,
  ): NonNullable<typeof this.clientShop>['panels'][number] {
    const color = COLORS.players[panel.slotIndex]!;
    const bg = this.add
      .rectangle(x, y, SHOP_PANEL_WIDTH, SHOP_PANEL_HEIGHT, 0x0a0a12, 1)
      .setStrokeStyle(2, color, panel.eliminated ? 0.35 : 1);

    const headerY = y - SHOP_PANEL_HEIGHT / 2 + 26;
    const headerText = this.add
      .text(x, headerY, panel.headerText, {
        fontFamily: 'monospace',
        fontSize: '20px',
        fontStyle: 'bold',
        color: toCssHex(color),
        align: 'center',
      })
      .setOrigin(0.5);

    if (panel.eliminated) {
      return { slotIndex: panel.slotIndex, bg, headerText, rowTexts: [], voteLabelText: undefined, voteTexts: [], readyText: undefined };
    }

    const rowStartY = headerY + 40;
    const rowTexts = panel.rows.map((row, i) =>
      this.add
        .text(x - SHOP_PANEL_WIDTH / 2 + 24, rowStartY + i * SHOP_ROW_HEIGHT, row.text, {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: row.colorHex,
        })
        .setOrigin(0, 0.5),
    );

    const voteLabelY = rowStartY + panel.rows.length * SHOP_ROW_HEIGHT + 6;
    const voteLabelText = panel.voteLabel
      ? this.add
          .text(x, voteLabelY, panel.voteLabel, {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#6a6a80',
          })
          .setOrigin(0.5)
      : undefined;
    const voteStartY = voteLabelY + 26;
    const voteTexts = panel.voteRows.map((row, i) =>
      this.add
        .text(x - SHOP_PANEL_WIDTH / 2 + 24, voteStartY + i * SHOP_ROW_HEIGHT, row.text, {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: row.colorHex,
        })
        .setOrigin(0, 0.5),
    );

    const readyText = this.add
      .text(x, voteStartY + panel.voteRows.length * SHOP_ROW_HEIGHT + 14, panel.readyText ?? '', {
        fontFamily: 'monospace',
        fontSize: '17px',
        fontStyle: 'bold',
        color: panel.readyColorHex ?? '#6a6a80',
      })
      .setOrigin(0.5);

    return { slotIndex: panel.slotIndex, bg, headerText, rowTexts, voteLabelText, voteTexts, readyText };
  }

  private refreshClientShop(shop: ShopSnapshot): void {
    const clientShop = this.clientShop;
    if (!clientShop) return;

    clientShop.headlineText.setText(shop.headline);
    clientShop.subheadlineText.setText(shop.subheadline);
    clientShop.hintText.setText(shop.hint);

    clientShop.panels.forEach((panel) => {
      const snapshot = shop.panels.find((p) => p.slotIndex === panel.slotIndex);
      if (!snapshot) return;
      panel.headerText.setText(snapshot.headerText);
      snapshot.rows.forEach((row, i) => {
        const text = panel.rowTexts[i];
        if (!text) return;
        text.setText(row.text).setColor(row.colorHex);
      });
      snapshot.voteRows.forEach((row, i) => {
        const text = panel.voteTexts[i];
        if (!text) return;
        text.setText(row.text).setColor(row.colorHex);
      });
      if (panel.readyText && snapshot.readyText !== null) {
        panel.readyText.setText(snapshot.readyText).setColor(snapshot.readyColorHex ?? '#6a6a80');
      }
    });
  }

  private teardownClientShop(): void {
    if (!this.clientShop) return;
    this.clientShop.headlineText.destroy();
    this.clientShop.subheadlineText.destroy();
    this.clientShop.hintText.destroy();
    this.clientShop.panels.forEach((panel) => {
      panel.bg.destroy();
      panel.headerText.destroy();
      panel.rowTexts.forEach((text) => text.destroy());
      panel.voteLabelText?.destroy();
      panel.voteTexts.forEach((text) => text.destroy());
      panel.readyText?.destroy();
    });
    this.clientShop = undefined;
  }

  /**
   * Client only (docs/roadmap.md's "Windows + LAN multiplayer," Sprint
   * 7's decided rule: the host disconnecting ends the round immediately
   * for everyone, no pause-and-wait, no host migration). There's
   * nothing to clean up on the host's own side from here - a host
   * disconnecting is simply the host's process going away, not a
   * message this scene could ever receive in that direction.
   */
  private handleHostDisconnected(): void {
    this.clientSession?.stop();
    this.entityMirrors.clear();
    this.teardownClientOverlay();
    this.teardownClientShop();
    stopSound(this, GAMEPLAY_MUSIC_KEY);
    this.scene.start('Menu');
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
    const nowMs = this.time.now;

    if (this.networkRole === 'client') {
      this.updateNetworkClient(deltaMs / 1000);
      return;
    }

    // Slow-motion on a round-deciding moment (EFFECTS.slowMo). Applied
    // to Matter's own physics clock and to the delta every entity's
    // update() below is driven by, so the two stay in step - a
    // half-slowed world where the rocks crawl but the ship's animation
    // doesn't would read as a frame hitch, not an effect. Wall-clock
    // `nowMs` is deliberately untouched (see the config comment).
    const timeScale = nowMs < this.slowMoUntilMs ? EFFECTS.slowMo.timeScale : 1;
    this.matter.world.engine.timing.timeScale = timeScale;
    const deltaSeconds = (deltaMs / 1000) * timeScale;

    if (this.isDemo) {
      this.updateDemoBots();
      if (this.checkDemoExit(nowMs)) return;
    }

    // A round-ending blow holds the world open for the slow-mo beat
    // before actually freezing it and raising the overlay - see
    // checkRoundOutcome(), which snapshots the outcome and defers here.
    if (this.deferredRoundEnd && nowMs >= this.deferredRoundEnd.resolveAtMs) {
      const { outcome } = this.deferredRoundEnd;
      this.deferredRoundEnd = undefined;
      this.resolveRoundOutcome(outcome);
    }

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
    this.processPendingWreckAbsorbs();
    this.processPendingBossAsteroidHits();
    this.processPendingCardinalPlasmaAsteroidHits();
    this.processPendingFractureShardAsteroidHits();
    this.processPendingScrapPickups(nowMs);
    this.processPendingRespawns(nowMs);
    this.processPendingCommanderPickups();
    this.processPendingCommanderHazardHits();
    this.processPendingSaboteurHits(nowMs);
    this.processPendingMineTriggers(nowMs);
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
    this.saboteurs = this.saboteurs.filter((saboteur) => saboteur.isAlive);
    this.driftMines = this.driftMines.filter((mine) => mine.isAlive);
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
    this.spaceStation?.render(nowMs);

    this.bursts.forEach((burst) => burst.update(nowMs, deltaSeconds));
    this.bursts = this.bursts.filter((burst) => burst.isAlive);

    this.scorePopups.forEach((popup) => popup.update(nowMs));
    this.scorePopups = this.scorePopups.filter((popup) => popup.isAlive);

    if (this.state === 'enteringInitials') {
      this.updateInitialsEntry();
      return;
    }

    if (this.state === 'shop') {
      this.updateShop();
      return;
    }

    if (this.state !== 'playing') return;

    this.stageElapsedMs += deltaMs;

    // Must run before this frame's per-entity update() calls below, not
    // just before next frame - Ship.update() re-clamps/re-sets velocity
    // from thrust every frame regardless of input, so a gravity force
    // applied *after* it would just get silently overwritten. Applying
    // it first means gravity accumulates into the same Matter step as
    // thrust, exactly like the escapable outer band is supposed to work
    // (docs/gameplay.md's Gravity Well - fight it with sustained thrust).
    // Tracks which asteroids get pulled by anything this frame, so the
    // per-asteroid update() pass below knows not to decay their speed
    // back down while they're still actively being accelerated - see
    // Asteroid.update()'s own doc comment on the Gravity Well bug fix.
    const pulledAsteroids = new Set<Asteroid>();
    this.applyBlackHoleGravityForces(pulledAsteroids);
    this.applyFractureGravityForces(pulledAsteroids);

    this.players.forEach((player) => {
      if (!player.ship.isAlive) return;

      const turn = player.input.turnDirection;
      if (turn !== 0) {
        player.ship.setRotation(
          player.ship.heading + turn * player.ship.hull.turnRateRadPerSec * deltaSeconds,
        );
      }
      player.ship.setThrusting(player.input.isThrusting);

      // Passive heat decay runs every frame regardless of firing - "slowly
      // decreases while not firing," decided. No-ops if the heat system is
      // disabled (WEAPON_UPGRADES.rapidFire.heat.enabled).
      player.weapon.heat = decayHeat(
        player.weapon.heat,
        deltaSeconds,
        WEAPON_UPGRADES.rapidFire.heat,
      );

      // Kill chain lapses on its own if nothing's died recently - the
      // HUD reads it every frame, so this has to run even for a player
      // who isn't currently shooting.
      const previousMultiplier = comboMultiplier(player.combo, COMBO);
      player.combo = decayCombo(player.combo, nowMs, COMBO);
      if (comboMultiplier(player.combo, COMBO) !== previousMultiplier) this.refreshAllPlayerHud();

      const weaponConfig = this.weaponUpgradeConfig();
      const cooldownMs = computeFireCooldownMs(
        player.weapon,
        player.ship.hull.fireCooldownMs,
        weaponConfig,
      );
      const maxOnScreenShots = computeMaxOnScreenShots(
        player.weapon,
        player.ship.hull.maxOnScreenShots,
      );
      const ownProjectileCount = this.projectiles.filter(
        (p) => p.ownerIndex === player.slotIndex,
      ).length;

      if (
        player.input.isFiring &&
        !player.ship.isInvulnerable(nowMs) && // respawn grace period: can move, can't shoot (decided)
        !isOverheated(player.weapon.heat, nowMs) &&
        canFire(player.lastFiredAtMs, nowMs, cooldownMs)
      ) {
        // Splitshot fires up to 3 projectiles per trigger-pull - only fire
        // if the *whole* volley fits under this player's own (possibly
        // upgrade-scaled) cap, rather than letting a volley get silently
        // truncated to 1-2 pellets when the budget is nearly full.
        const shots = computeShotSpecs(player.weapon, player.ship.heading, weaponConfig);
        if (ownProjectileCount + shots.length <= maxOnScreenShots) {
          this.fireProjectile(player, nowMs, shots);
          player.lastFiredAtMs = nowMs;
          player.weapon.heat = applyShotHeat(
            player.weapon.heat,
            nowMs,
            WEAPON_UPGRADES.rapidFire.heat,
          );
        }
      }

      // Hyperspace: rising edge only (holding the key must not chain
      // jumps), plus its own cooldown. Edge detection lives here rather
      // than in the input adapters, same division of labour as firing -
      // adapters report a held level, the scene owns the timing rules.
      const hyperspaceHeld = player.input.isHyperspacing;
      if (
        hyperspaceHeld &&
        !player.hyperspaceWasHeld &&
        nowMs - player.lastHyperspaceAtMs >= HYPERSPACE.cooldownMs
      ) {
        this.jumpHyperspace(player);
        player.lastHyperspaceAtMs = nowMs;
      }
      player.hyperspaceWasHeld = hyperspaceHeld;

      player.ship.update(nowMs, deltaSeconds, ARENA_WIDTH, ARENA_HEIGHT);
      player.ship.render();
    });

    // One shared engine sound for however many ships are thrusting right
    // now, not a per-ship instance - see the `wasAnyThrusting` field doc.
    const isAnyThrusting = this.players.some(
      (player) => player.ship.isAlive && player.input.isThrusting,
    );
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

    this.asteroids.forEach((asteroid) =>
      asteroid.update(deltaSeconds, ARENA_WIDTH, ARENA_HEIGHT, pulledAsteroids.has(asteroid)),
    );
    this.projectiles.forEach((projectile) => projectile.update(nowMs, ARENA_WIDTH, ARENA_HEIGHT));
    this.shields.forEach((shield) => {
      shield.update(deltaSeconds, ARENA_WIDTH, ARENA_HEIGHT);
      shield.render();
    });
    this.updateUfos(deltaSeconds, nowMs);
    this.ufoShots.forEach((shot) => shot.update(nowMs, ARENA_WIDTH, ARENA_HEIGHT));
    // A downed player still steers their own adrift pilot, on their own
    // existing turn/thrust bindings (COMMANDER.puff*) - applied before
    // update() so the puff's velocity change lands in the same frame's
    // movement, the same ordering the ship's own thrust already uses.
    this.commanders.forEach((commander) => {
      const owner = this.players.find((p) => p.slotIndex === commander.slotIndex);
      if (owner)
        commander.applyControl(owner.input.turnDirection, owner.input.isThrusting, deltaSeconds);
      commander.update(ARENA_WIDTH, ARENA_HEIGHT);
      commander.render(nowMs);
    });
    this.processCommanderExpiry(nowMs);
    this.processStationDropOffs(nowMs);
    this.updateSaboteurs(nowMs, deltaSeconds);
    this.updateDriftMines(nowMs, ARENA_WIDTH, ARENA_HEIGHT);
    this.processPendingChainDetonations(nowMs);
    this.blackHole?.update(deltaSeconds);
    this.blackHole?.render(nowMs);
    this.fracture?.update(nowMs, ARENA_HEIGHT);
    this.fracture?.render(nowMs);
    this.fractureFragments.forEach((fragment) => {
      fragment.update(nowMs, deltaSeconds, ARENA_WIDTH, ARENA_HEIGHT);
      fragment.render(nowMs);
    });
    this.fractureSwarm.forEach((swarmBit) => {
      swarmBit.update(ARENA_WIDTH, ARENA_HEIGHT);
      swarmBit.render(nowMs);
    });
    this.fractureShards.forEach((shard) =>
      shard.update(nowMs, deltaSeconds, ARENA_WIDTH, ARENA_HEIGHT),
    );
    this.fractureLasers.forEach((laser) => {
      laser.update(nowMs);
      laser.render(nowMs);
    });
    this.updateFractureAttacks(nowMs);
    this.updateScrapCountdown(nowMs);
    this.cardinal?.update(nowMs);
    this.cardinal?.render(nowMs);
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
    this.saboteurs = this.saboteurs.filter((saboteur) => saboteur.isAlive);
    this.driftMines = this.driftMines.filter((mine) => mine.isAlive);
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
    // boss encounter; normal stages keep the original "no cap" behavior.
    // Deliberately doesn't reset `lastUfoSpawnAtMs` while capped, so the
    // instant a slot frees up (a UFO dies) a new one spawns right away
    // if the interval had already elapsed, rather than waiting a fresh
    // full interval from whenever the cap happened to clear.
    const ufoSpawnCapped =
      this.isBossEncounterActive() && this.ufos.length >= UFO.maxConcurrentDuringBoss;
    if (!ufoSpawnCapped && nowMs - this.lastUfoSpawnAtMs >= this.modifiedUfoIntervalMs()) {
      this.spawnUfo();
      this.lastUfoSpawnAtMs = nowMs;
    }

    // The Saboteur - a late-game escalation (SABOTEUR.firstNormalStageCount),
    // never during a boss encounter (same suppression every other
    // normal-stage-only hazard already gets), capped at maxConcurrent
    // rather than UFO's "no cap" - it's meant to be a notable event, not
    // a fixture.
    if (
      this.normalStageCount >= SABOTEUR.firstNormalStageCount &&
      !this.isBossEncounterActive() &&
      this.saboteurs.length < SABOTEUR.maxConcurrent &&
      nowMs - this.lastSaboteurSpawnAtMs >= SABOTEUR.spawnIntervalMs
    ) {
      this.spawnSaboteur(nowMs);
      this.lastSaboteurSpawnAtMs = nowMs;
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

    if (this.networkRole === 'host' && this.hostSession) {
      this.snapshotThrottle ??= new SnapshotThrottle(this.hostSession.snapshotHz);
      if (this.snapshotThrottle.shouldSend(performance.now())) this.broadcastHostSnapshot(nowMs);
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
  private clearTerrain(): void {
    this.wrecks.forEach((wreck) => wreck.destroy());
    this.wrecks = [];
  }

  /**
   * Lays out this stage's wreckage, keeping clear of every player spawn
   * point and (in Cooperative) the space station - dropping a solid
   * body on a respawn point or the one place a rescue has to reach
   * would be a genuinely unfair way to lose a life.
   */
  private generateStageTerrain(): void {
    if (Math.random() > TERRAIN.spawnChance) return;

    const keepOuts: KeepOut[] = [];
    for (let slot = 0; slot < 4; slot += 1) {
      const offset = this.spawnOffsetFor(slot);
      keepOuts.push({
        position: { x: ARENA_WIDTH / 2 + offset.x, y: ARENA_HEIGHT / 2 + offset.y },
        radius: SHIP.radius * 4,
      });
      const bossCorner = BOSS_RESPAWN_OFFSETS[slot]!;
      keepOuts.push({
        position: { x: ARENA_WIDTH / 2 + bossCorner.x, y: ARENA_HEIGHT / 2 + bossCorner.y },
        radius: SHIP.radius * 4,
      });
    }
    if (this.spaceStation) {
      keepOuts.push({ position: this.spaceStation.position, radius: SPACE_STATION.dropOffRadius });
    }

    for (const placement of generateTerrain(ARENA_WIDTH, ARENA_HEIGHT, keepOuts, TERRAIN)) {
      this.wrecks.push(new Wreck(this, placement.position, placement.radius, placement.shapeSeed));
    }
  }

  private updateUfos(deltaSeconds: number, nowMs: number): void {
    for (const ufo of this.ufos) {
      ufo.update(deltaSeconds, ARENA_WIDTH, ARENA_HEIGHT);
      ufo.render();

      const target = this.nearestAliveShip(ufo.position);
      if (!target || !ufo.canFire(nowMs)) continue;

      const lead = computeLeadAimHeading(
        ufo.position,
        target.ship.position,
        target.ship.velocity,
        UFO.shotSpeed,
      );
      const heading = applyAimSpread(lead, UFO.aimSpreadRad);
      this.ufoShots.push(new UfoShot(this, ufo.position, heading, nowMs));
      playUfoShotSfx(this, getSfxVolume());
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

  /** One weapon discharge - one shot for the base weapon, up to 3 for Splitshot (see WeaponUpgrades.computeShotSpecs), all spawned from the same ship position/frame. One SHOT_SFX_KEY play per discharge, not per pellet - a Splitshot volley is one weapon firing, not three. */
  private fireProjectile(player: PlayerSlot, nowMs: number, shots: ShotSpec[]): void {
    this.sound.play(SHOT_SFX_KEY, { volume: getSfxVolume() });
    this.stageShotsFired += shots.length; // per projectile, not per trigger-pull - fair accuracy for Splitshot
    for (const shot of shots) {
      this.projectiles.push(
        new Projectile(
          this,
          player.ship.position,
          shot.headingRad,
          nowMs,
          player.ship.color,
          player.slotIndex,
          this.mode === 'competitive',
          shot.radius,
          shot.speed,
          shot.damage,
          shot.kineticImpulse,
        ),
      );
    }
  }

  /** Assembles the plain-object config `systems/WeaponUpgrades.ts`'s pure functions take - the base weapon's own stats (from `PROJECTILE`, damage 1/no impulse, matching every hit before this system existed) plus `WEAPON_UPGRADES`'s per-upgrade tuning. Cheap to rebuild per call (plain object, no allocHeavy work) - not cached, since GameConfig values never change at runtime anyway. */
  private weaponUpgradeConfig(): WeaponUpgradeConfig {
    return {
      base: { radius: PROJECTILE.radius, speed: PROJECTILE.speed, damage: 1, kineticImpulse: 0 },
      splitshot: WEAPON_UPGRADES.splitshot,
      rapidFire: WEAPON_UPGRADES.rapidFire,
      heavyShot: WEAPON_UPGRADES.heavyShot,
    };
  }

  /**
   * The shop's required hook (per the brief: "implement... the required
   * interfaces/hooks for the shop... do not build a complete shop UI
   * unless necessary") - a future ShopScene calls this against the live
   * `GameScene`, and this method owns applying `WeaponShop.
   * purchaseUpgrade`'s pure result back onto the player's actual Scrap
   * balance/upgrade set and refreshing the HUD. Returns whether the
   * purchase actually went through (`false`: no such player, already
   * owns the upgrade, or not enough Scrap) - a shop UI can use that
   * directly to decide whether to play a success/failure sound, no
   * separate `canAfford` pre-check required (though `WeaponShop.
   * canAfford` is exported for one anyway, e.g. to grey out a button).
   */
  purchaseWeaponUpgrade(slotIndex: number, upgradeId: WeaponUpgradeId): boolean {
    const player = this.players.find((p) => p.slotIndex === slotIndex);
    if (!player) return false;

    const result = purchaseUpgrade(
      player.scrap,
      player.weapon.active,
      upgradeId,
      WEAPON_UPGRADES.costs,
    );
    if (!result.success) return false;

    player.scrap = result.scrap;
    player.weapon.active = new Set(result.activeUpgrades);
    this.refreshAllPlayerHud();
    return true;
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
    // A UFO used to arrive in complete silence - the one hazard in the
    // game that announces itself now does.
    playUfoSpawnSfx(this, getSfxVolume());
  }

  /** Same edge-spawn shape as spawnUfo() above, its own radius/speed. */
  private spawnSaboteur(nowMs: number): void {
    const edge = Math.floor(Math.random() * 4);
    let x: number;
    let y: number;
    let baseHeadingRad: number;
    if (edge === 0) {
      x = -SABOTEUR.radius;
      y = Math.random() * ARENA_HEIGHT;
      baseHeadingRad = 0;
    } else if (edge === 1) {
      x = ARENA_WIDTH + SABOTEUR.radius;
      y = Math.random() * ARENA_HEIGHT;
      baseHeadingRad = Math.PI;
    } else if (edge === 2) {
      x = Math.random() * ARENA_WIDTH;
      y = -SABOTEUR.radius;
      baseHeadingRad = Math.PI / 2;
    } else {
      x = Math.random() * ARENA_WIDTH;
      y = ARENA_HEIGHT + SABOTEUR.radius;
      baseHeadingRad = -Math.PI / 2;
    }
    const heading = baseHeadingRad + (Math.random() * 2 - 1) * (Math.PI / 4);
    this.saboteurs.push(new Saboteur(this, { x, y }, heading, nowMs));
  }

  /**
   * Targeting + steering for every live Saboteur, then drops one mine
   * per hull that's ready (`readyToDrop`) - `systems/SaboteurAI.ts`'s
   * `pickDropTarget` is only actually re-run once per hull's own
   * `retargetIntervalMs` (see `Saboteur.update`'s own doc comment), so
   * building the candidate position lists here every frame is cheap
   * relative to how rarely they're actually consumed.
   */
  private updateSaboteurs(nowMs: number, deltaSeconds: number): void {
    if (this.saboteurs.length === 0) return;

    const adriftCommanderPositions = this.commanders
      .filter((c) => c.isAdrift)
      .map((c) => c.position);
    const asteroidPositions = this.asteroids.filter((a) => a.isAlive).map((a) => a.position);

    this.saboteurs.forEach((saboteur) => {
      saboteur.update(nowMs, deltaSeconds, ARENA_WIDTH, ARENA_HEIGHT, () =>
        pickDropTarget(
          saboteur.position,
          adriftCommanderPositions,
          SABOTEUR.commanderPriorityRadius,
          asteroidPositions,
          SABOTEUR.clusterSeekRadius,
          SABOTEUR.clusterMinNeighbors,
        ),
      );
      saboteur.render(nowMs);

      if (saboteur.readyToDrop(nowMs)) {
        this.spawnDriftMine(saboteur, nowMs);
        saboteur.recordDropped(nowMs);
      }
    });
  }

  /** A dropped mine inherits a slice of its Saboteur's own velocity rather than sitting dead still - still a drifting mine, just one that was placed. */
  private spawnDriftMine(saboteur: Saboteur, nowMs: number): void {
    const carrierVelocity = saboteur.visual.getVelocity();
    const heading = Math.random() * Math.PI * 2;
    const velocity = {
      x: carrierVelocity.x * 0.5 + Math.cos(heading) * DRIFT_MINE.speed,
      y: carrierVelocity.y * 0.5 + Math.sin(heading) * DRIFT_MINE.speed,
    };
    this.driftMines.push(new DriftMine(this, saboteur.position, velocity, nowMs));
  }

  private updateDriftMines(nowMs: number, arenaWidth: number, arenaHeight: number): void {
    this.driftMines.forEach((mine) => {
      mine.update(arenaWidth, arenaHeight);
      mine.render(nowMs);
    });
  }

  /** Mines caught in another mine's own blast detonate `DRIFT_MINE.chainPropagationMs` later, not instantly - see the DRIFT_MINE config doc comment on why that delay matters. */
  private processPendingChainDetonations(nowMs: number): void {
    if (this.pendingChainDetonations.length === 0) return;
    const ready = this.pendingChainDetonations.filter((entry) => nowMs >= entry.atMs);
    if (ready.length === 0) return;
    this.pendingChainDetonations = this.pendingChainDetonations.filter(
      (entry) => nowMs < entry.atMs,
    );
    for (const { mine, ownerIndex } of ready) {
      if (mine.isAlive) this.detonateMine(mine, nowMs, ownerIndex);
    }
  }

  /**
   * The actual blast (`DRIFT_MINE.blastRadius`, `isWithinBlast`) -
   * instant-radius, not a simulated expanding shockwave (see
   * `DriftMineBlast.ts`'s own doc comment on why). `ownerIndex` traces
   * back to whichever player's shot started this chain, if any - a
   * purely incidental detonation (an asteroid drifted into it, a ship
   * rammed it) carries `undefined`, and scores nothing, same
   * "hazard-killed, not shot" rule every other environmental kill here
   * already follows.
   */
  private detonateMine(mine: DriftMine, nowMs: number, ownerIndex: number | undefined): void {
    if (!mine.isAlive) return;
    const position = mine.position;
    mine.destroy();
    this.spawnBurst(position, COLORS.ufo, EFFECTS.mineBurst);
    this.shakeCamera(EFFECTS.majorShake);

    this.players.forEach((player) => {
      const ship = player.ship;
      if (!ship.isAlive || ship.isInvulnerable(nowMs)) return;
      if (
        isWithinBlast(ship.position, position, DRIFT_MINE.blastRadius) &&
        !this.pendingShipHits.includes(ship)
      ) {
        this.pendingShipHits.push(ship);
      }
    });

    this.commanders.forEach((commander) => {
      if (!commander.isAlive || !commander.isAdrift) return;
      if (isWithinBlast(commander.position, position, DRIFT_MINE.blastRadius)) {
        if (!this.pendingCommanderHazardHits.includes(commander))
          this.pendingCommanderHazardHits.push(commander);
      }
    });

    this.asteroids.forEach((asteroid) => {
      if (!asteroid.isAlive) return;
      if (!isWithinBlast(asteroid.position, position, DRIFT_MINE.blastRadius)) return;
      // Destroyed whole, not split - same precedent the Gravity Well's
      // own lethal center set. Still scores normally when this chain
      // traces back to a player's own shot, unlike the Gravity Well -
      // a mine clearing a cluster you aimed it at is the entire point.
      this.spawnBurst(asteroid.position, COLORS.asteroid, EFFECTS.asteroidBurst);
      if (ownerIndex !== undefined) {
        const asteroidScore = Math.round(
          ASTEROID[asteroid.size].score * this.fieldModifiers.asteroidScoreMultiplier,
        );
        this.awardScore(ownerIndex, asteroidScore, asteroid.position);
      }
      asteroid.destroy();
    });

    this.ufos.forEach((ufo) => {
      if (!ufo.isAlive) return;
      if (!isWithinBlast(ufo.position, position, DRIFT_MINE.blastRadius)) return;
      const ufoPosition = ufo.position;
      ufo.destroy();
      this.spawnBurst(ufoPosition, COLORS.ufo, EFFECTS.ufoBurst);
      if (ownerIndex !== undefined) this.awardScore(ownerIndex, UFO.score, ufoPosition);
    });

    this.saboteurs.forEach((saboteur) => {
      if (!saboteur.isAlive) return;
      if (isWithinBlast(saboteur.position, position, DRIFT_MINE.blastRadius)) {
        this.destroySaboteur(saboteur, nowMs, ownerIndex);
      }
    });

    this.driftMines.forEach((other) => {
      if (!other.isAlive || other === mine) return;
      if (!isWithinBlast(other.position, position, DRIFT_MINE.blastRadius)) return;
      if (this.pendingChainDetonations.some((entry) => entry.mine === other)) return;
      this.pendingChainDetonations.push({
        mine: other,
        atMs: nowMs + DRIFT_MINE.chainPropagationMs,
        ownerIndex,
      });
    });
  }

  /**
   * Shared by every death path (shot, ram, caught in another mine's
   * blast) - a Saboteur always drops one last mine right at its own
   * death position, decided: punishes killing it at close range,
   * rewards sniping it from a distance, same "nothing dies for free"
   * precedent The Cardinal already set for bosses.
   */
  private destroySaboteur(saboteur: Saboteur, nowMs: number, ownerIndex: number | undefined): void {
    if (!saboteur.isAlive) return;
    const position = saboteur.position;
    saboteur.destroy();
    this.spawnBurst(position, COLORS.ufo, EFFECTS.ufoBurst);
    this.shakeCamera(EFFECTS.majorShake);
    if (ownerIndex !== undefined) this.awardScore(ownerIndex, SABOTEUR.score, position);
    this.driftMines.push(new DriftMine(this, position, { x: 0, y: 0 }, nowMs));
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
        Math.hypot(
          candidate.x - this.spaceStation.position.x,
          candidate.y - this.spaceStation.position.y,
        ) >= BLACK_HOLE.minDistanceFromStation;

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
  /**
   * `pulledAsteroids` (docs from the reported Gravity Well bug fix) -
   * every asteroid this method actually applies a nonzero pull force to
   * gets added, so `update()`'s later per-asteroid pass knows not to
   * decay it back down this frame - see `Asteroid.update()`'s own doc
   * comment and `systems/MovementSystem.ts`'s `decayExcessSpeed`.
   */
  private applyBlackHoleGravityForces(pulledAsteroids: Set<Asteroid>): void {
    const hole = this.blackHole;
    if (!hole) return;

    const applyGravity = (
      visual: MatterGameObject<Phaser.GameObjects.Graphics>,
      position: Vector2,
    ): boolean => {
      const force = computeGravityForce(
        position,
        hole.position,
        BLACK_HOLE.gravityRadius,
        BLACK_HOLE.eventHorizonRadius,
        BLACK_HOLE.pullForceMax,
      );
      if (force.x !== 0 || force.y !== 0) {
        visual.applyForce(new Phaser.Math.Vector2(force.x, force.y));
        return true;
      }
      return false;
    };

    this.players.forEach((player) => {
      if (player.ship.isAlive) applyGravity(player.ship.visual, player.ship.position);
    });
    this.asteroids.forEach((asteroid) => {
      if (asteroid.isAlive && applyGravity(asteroid.visual, asteroid.position)) {
        pulledAsteroids.add(asteroid);
      }
    });
    this.ufos.forEach((ufo) => {
      if (ufo.isAlive) applyGravity(ufo.visual, ufo.position);
    });
    this.shields.forEach((shield) => {
      if (shield.isAlive) applyGravity(shield.visual, shield.position);
    });
    this.commanders.forEach((commander) => {
      if (commander.isAlive && commander.isAdrift)
        applyGravity(commander.visual, commander.position);
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
   * applyBlackHoleGravityForces() above. `pulledAsteroids` - same
   * doc/purpose as that method's own parameter.
   */
  private applyFractureGravityForces(pulledAsteroids: Set<Asteroid>): void {
    const gravityFragments = this.fractureFragments.filter(
      (f) => f.role === 'gravity' && f.isAlive,
    );
    if (gravityFragments.length === 0) return;

    const pullRadius = FRACTURE.fragmentRadius * FRACTURE.gravityPullRadiusMultiplier;
    const applyGravity = (
      visual: MatterGameObject<Phaser.GameObjects.Graphics>,
      position: Vector2,
    ): boolean => {
      let pulled = false;
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
          pulled = true;
        }
      });
      return pulled;
    };

    this.players.forEach((player) => {
      if (player.ship.isAlive) applyGravity(player.ship.visual, player.ship.position);
    });
    this.asteroids.forEach((asteroid) => {
      if (asteroid.isAlive && applyGravity(asteroid.visual, asteroid.position)) {
        pulledAsteroids.add(asteroid);
      }
    });
    this.ufos.forEach((ufo) => {
      if (ufo.isAlive) applyGravity(ufo.visual, ufo.position);
    });
    this.shields.forEach((shield) => {
      if (shield.isAlive) applyGravity(shield.visual, shield.position);
    });
    this.commanders.forEach((commander) => {
      if (commander.isAlive && commander.isAdrift)
        applyGravity(commander.visual, commander.position);
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
          isPointOnBeam(
            player.ship.position,
            laser.origin,
            laser.angleRad,
            FRACTURE.laserLength,
            FRACTURE.laserWidth,
            SHIP.radius,
          ) &&
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
            // + SHIP.radius: same "count the ship's real size" consistency
            // fix as the laser/core-ram checks - the expanding ring is a
            // solid disk, not a thin corridor, so this was never the
            // sweeping-beam failure mode, just a few pixels of precision.
            if (
              distance <= ringRadius + SHIP.radius &&
              !this.pendingShipHits.includes(player.ship)
            ) {
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
          const heading = Math.atan2(
            target.position.y - fragment.position.y,
            target.position.x - fragment.position.x,
          );
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
   * of its interactions - the laser cross vs. ships, projectiles vs. its
   * arms/core, and the ship/asteroid ram hazard the core and every
   * living arm now are - are plain per-frame distance/segment checks
   * here, the same "plain math hazard" pattern
   * `processBlackHoleCaptureAndLethal` and `updateFractureAttacks`'s own
   * laser check already use. The Phase 2 plasma ball is the one
   * exception (a real Matter body), fired from here but hit-tested via
   * the normal handleCollision() path.
   */
  private updateCardinalAttacks(nowMs: number): void {
    const cardinal = this.cardinal;
    if (!cardinal) return;

    // Ship/asteroid-vs-core ram - always active, every phase, same
    // "behaves like a rock" precedent The Fracture's own Core already
    // set. Arms get the same treatment below, once per living arm -
    // requested directly, reversing this file's own earlier "arms are
    // deliberately not a ram hazard" call (see CARDINAL's doc comment in
    // GameConfig.ts, now stale on that specific point).
    this.players.forEach((player) => {
      if (!player.ship.isAlive || player.ship.isInvulnerable(nowMs)) return;
      const distance = Math.hypot(
        player.ship.position.x - cardinal.position.x,
        player.ship.position.y - cardinal.position.y,
      );
      // + SHIP.radius: a ship's edge touches the core before its exact
      // center coordinate does - same "count the ship's real size, not
      // just its center point" fix as the laser hit-test below. Far
      // milder here (the core doesn't move relative to itself, so this
      // was never the "essentially unhittable" bug the sweeping laser
      // was), but the same principle applies for consistency.
      if (
        distance <= CARDINAL.coreRadius + SHIP.radius &&
        !this.pendingShipHits.includes(player.ship)
      ) {
        this.pendingShipHits.push(player.ship);
      }
    });

    this.asteroids.forEach((asteroid) => {
      if (!asteroid.isAlive) return;
      const distance = Math.hypot(
        asteroid.position.x - cardinal.position.x,
        asteroid.position.y - cardinal.position.y,
      );
      if (
        distance <= CARDINAL.coreRadius + asteroid.radius &&
        !this.pendingBossAsteroidHits.includes(asteroid)
      ) {
        this.pendingBossAsteroidHits.push(asteroid);
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
              isPointOnBeam(
                player.ship.position,
                cardinal.position,
                angle,
                CARDINAL.laserLength,
                CARDINAL.laserWidth,
                SHIP.radius,
              ) &&
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
          if (
            distanceToSegment(projectile.position, armStart, armEnd) <=
            CARDINAL.armHitWidth / 2
          ) {
            if (!this.pendingCardinalArmHits.some((hit) => hit.projectile === projectile)) {
              this.pendingCardinalArmHits.push({ armIndex, projectile });
            }
          }
        });

        // Ship/asteroid ram vs. this specific arm's physical span - same
        // segment every projectile hit-test above already uses, with the
        // target's own radius added (same "count the real size, not just
        // the center point" fix the core ram/laser checks already apply).
        this.players.forEach((player) => {
          if (!player.ship.isAlive || player.ship.isInvulnerable(nowMs)) return;
          if (
            distanceToSegment(player.ship.position, armStart, armEnd) <=
              CARDINAL.armHitWidth / 2 + SHIP.radius &&
            !this.pendingShipHits.includes(player.ship)
          ) {
            this.pendingShipHits.push(player.ship);
          }
        });

        this.asteroids.forEach((asteroid) => {
          if (!asteroid.isAlive) return;
          if (
            distanceToSegment(asteroid.position, armStart, armEnd) <=
              CARDINAL.armHitWidth / 2 + asteroid.radius &&
            !this.pendingBossAsteroidHits.includes(asteroid)
          ) {
            this.pendingBossAsteroidHits.push(asteroid);
          }
        });
      }
    } else if (cardinal.phase === 'coreExposed') {
      // Core becomes a valid target only once every arm is down.
      this.projectiles.forEach((projectile) => {
        if (!projectile.isAlive) return;
        const distance = Math.hypot(
          projectile.position.x - cardinal.position.x,
          projectile.position.y - cardinal.position.y,
        );
        if (
          distance <= CARDINAL.coreRadius &&
          !this.pendingCardinalCoreHits.some((hit) => hit.projectile === projectile)
        ) {
          this.pendingCardinalCoreHits.push({ projectile });
        }
      });

      if (cardinal.canFirePlasma(nowMs)) {
        const target = this.nearestAliveShip(cardinal.position);
        if (target) {
          const heading = computeLeadAimHeading(
            cardinal.position,
            target.ship.position,
            target.ship.velocity,
            CARDINAL.plasmaSpeed,
          );
          this.cardinalPlasmaBalls.push(
            new CardinalPlasmaBall(this, cardinal.position, heading, nowMs),
          );
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

    const captureIfNeeded = (
      visual: MatterGameObject<Phaser.GameObjects.Graphics>,
      position: Vector2,
    ): void => {
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
    const away = normalize({
      x: ship.position.x - holeCenter.x,
      y: ship.position.y - holeCenter.y,
    });
    const direction = away.x === 0 && away.y === 0 ? { x: 1, y: 0 } : away;
    const ejectDistance = BLACK_HOLE.eventHorizonRadius + 20;

    ship.visual.setPosition(
      holeCenter.x + direction.x * ejectDistance,
      holeCenter.y + direction.y * ejectDistance,
    );
    ship.visual.setVelocity(
      direction.x * BLACK_HOLE.shieldEjectSpeed,
      direction.y * BLACK_HOLE.shieldEjectSpeed,
    );
    ship.grantInvulnerability(nowMs, BLACK_HOLE.shieldEjectInvulnerabilityMs);
    this.spawnBurst(ship.position, COLORS.shield, EFFECTS.shipBurst);
  }

  private handleCollision(pair: Phaser.Types.Physics.Matter.MatterCollisionPair): void {
    const nowMs = this.time.now;
    const entityA = this.entityOf(pair.bodyA);
    const entityB = this.entityOf(pair.bodyB);

    const projectile =
      entityA instanceof Projectile ? entityA : entityB instanceof Projectile ? entityB : undefined;
    const asteroid =
      entityA instanceof Asteroid ? entityA : entityB instanceof Asteroid ? entityB : undefined;
    const ship = entityA instanceof Ship ? entityA : entityB instanceof Ship ? entityB : undefined;
    const shield =
      entityA instanceof Shield ? entityA : entityB instanceof Shield ? entityB : undefined;
    const ufo = entityA instanceof Ufo ? entityA : entityB instanceof Ufo ? entityB : undefined;
    const ufoShot =
      entityA instanceof UfoShot ? entityA : entityB instanceof UfoShot ? entityB : undefined;
    const commander =
      entityA instanceof Commander ? entityA : entityB instanceof Commander ? entityB : undefined;
    const fracture =
      entityA instanceof Fracture ? entityA : entityB instanceof Fracture ? entityB : undefined;
    const fractureFragment =
      entityA instanceof FractureFragment
        ? entityA
        : entityB instanceof FractureFragment
          ? entityB
          : undefined;
    const fractureSwarmBit =
      entityA instanceof FractureSwarmBit
        ? entityA
        : entityB instanceof FractureSwarmBit
          ? entityB
          : undefined;
    const fractureShard =
      entityA instanceof FractureShard
        ? entityA
        : entityB instanceof FractureShard
          ? entityB
          : undefined;
    const cardinalPlasma =
      entityA instanceof CardinalPlasmaBall
        ? entityA
        : entityB instanceof CardinalPlasmaBall
          ? entityB
          : undefined;
    const wreck =
      entityA instanceof Wreck ? entityA : entityB instanceof Wreck ? entityB : undefined;
    const saboteur =
      entityA instanceof Saboteur ? entityA : entityB instanceof Saboteur ? entityB : undefined;
    const mine =
      entityA instanceof DriftMine ? entityA : entityB instanceof DriftMine ? entityB : undefined;

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

    // Same "behave like rocks" contact, extended to asteroids on request -
    // an asteroid that drifts into the Core or a Fragment is destroyed
    // whole (no split, no score - same precedent the Gravity Well's own
    // lethal center set), the boss takes no damage from it either way.
    // Cover absorbs shots rather than bouncing them. A static body
    // would otherwise ricochet them unpredictably, which reads as a
    // bug rather than a mechanic - and "I can't shoot through that" is
    // the entire point of putting it there.
    if (projectile?.isAlive && wreck?.isAlive) {
      if (!this.pendingWreckAbsorbs.includes(projectile)) this.pendingWreckAbsorbs.push(projectile);
      return;
    }

    if (asteroid?.isAlive && (fracture?.isAlive || fractureFragment?.isAlive)) {
      if (!this.pendingBossAsteroidHits.includes(asteroid)) {
        this.pendingBossAsteroidHits.push(asteroid);
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

    // Extended to asteroids on request, same "consumed on any contact"
    // rule - the shard is destroyed and so is the asteroid (whole, no
    // split, no score), symmetric with the ship-contact branch above.
    if (asteroid?.isAlive && fractureShard?.isAlive) {
      if (!this.pendingFractureShardAsteroidHits.some((hit) => hit.shard === fractureShard)) {
        this.pendingFractureShardAsteroidHits.push({ asteroid, shard: fractureShard });
      }
      return;
    }

    // The Cardinal's own Phase 2 attack - same "always consumed on
    // contact, invulnerability checked at resolve time" shape as
    // FractureShard just above. The rest of The Cardinal (arms, core,
    // ram) isn't Matter-backed at all, so the plasma ball is the only
    // Cardinal-related entity that can ever reach handleCollision().
    if (ship?.isAlive && cardinalPlasma?.isAlive) {
      if (!this.pendingCardinalPlasmaHits.some((hit) => hit.plasma === cardinalPlasma)) {
        this.pendingCardinalPlasmaHits.push({ ship, plasma: cardinalPlasma });
      }
      return;
    }

    // Same extension as FractureShard above, for the plasma ball.
    if (asteroid?.isAlive && cardinalPlasma?.isAlive) {
      if (!this.pendingCardinalPlasmaAsteroidHits.some((hit) => hit.plasma === cardinalPlasma)) {
        this.pendingCardinalPlasmaAsteroidHits.push({ asteroid, plasma: cardinalPlasma });
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
      if (
        entityA.isAlive &&
        !entityA.isInvulnerable(nowMs) &&
        !this.pendingShipHits.includes(entityA)
      ) {
        this.pendingShipHits.push(entityA);
      }
      if (
        entityB.isAlive &&
        !entityB.isInvulnerable(nowMs) &&
        !this.pendingShipHits.includes(entityB)
      ) {
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

    // The Saboteur has no weapon of its own - every one of its own
    // pairs is a contact, same shape as the UFO's own three branches
    // above (shot/asteroid/ship).
    if (projectile?.isAlive && saboteur?.isAlive) {
      if (!this.pendingSaboteurHits.some((hit) => hit.saboteur === saboteur)) {
        this.pendingSaboteurHits.push({ saboteur, projectile, awardScore: true });
      }
      return;
    }

    if (asteroid?.isAlive && saboteur?.isAlive) {
      // Same "destroyed by colliding with asteroids, no score" rule the
      // UFO already follows.
      if (!this.pendingSaboteurHits.some((hit) => hit.saboteur === saboteur)) {
        this.pendingSaboteurHits.push({ saboteur, projectile: undefined, awardScore: false });
      }
      return;
    }

    if (ship?.isAlive && saboteur?.isAlive) {
      if (!ship.isInvulnerable(nowMs) && !this.pendingShipHits.includes(ship)) {
        this.pendingShipHits.push(ship);
      }
      if (!this.pendingSaboteurHits.some((hit) => hit.saboteur === saboteur)) {
        this.pendingSaboteurHits.push({ saboteur, projectile: undefined, awardScore: false });
      }
      return;
    }

    // Drift Mine: two trigger paths, identical result (DRIFT_MINE's own
    // config doc comment) - a shot credits whoever fired it, any other
    // contact is anonymous. Inert mines (still within armDelayMs) are
    // skipped entirely here - contact does nothing until isArmed.
    if (projectile?.isAlive && mine?.isAlive && mine.isArmed(nowMs)) {
      if (!this.pendingMineShotTriggers.some((trigger) => trigger.mine === mine)) {
        this.pendingMineShotTriggers.push({ mine, projectile });
      }
      return;
    }

    // Two mines directly touching each other (rather than one catching
    // the other in its blast once it goes off) isn't handled as its own
    // pair here - a rare edge case already mostly covered by
    // blastRadius being well past either one's own hitbox, not worth a
    // second typed entity slot for.
    if (
      mine?.isAlive &&
      mine.isArmed(nowMs) &&
      (ship?.isAlive || asteroid?.isAlive || ufo?.isAlive || saboteur?.isAlive)
    ) {
      if (!this.pendingMineCollisionTriggers.includes(mine)) {
        this.pendingMineCollisionTriggers.push(mine);
      }
      return;
    }

    // Commander (Cooperative's rescue mechanic - see the class doc
    // comment) only ever pairs with SHIP/ASTEROID/UFO/UFO_SHOT/
    // SABOTEUR/MINE at all (its own collision mask), and only while
    // adrift - a carried one is still a live sensor body, but GameScene
    // ignores both branches below for it (already rescued, already
    // attached to its carrier).
    if (commander?.isAlive && commander.isAdrift) {
      if (asteroid?.isAlive || ufoShot?.isAlive || ufo?.isAlive || saboteur?.isAlive) {
        if (!this.pendingCommanderHazardHits.includes(commander)) {
          this.pendingCommanderHazardHits.push(commander);
        }
        if (ufoShot?.isAlive && !this.pendingUfoShotHits.includes(ufoShot)) {
          this.pendingUfoShotHits.push(ufoShot);
        }
        return;
      }

      // A mine doesn't hurt the Commander directly here - touching it
      // just triggers the mine (anonymous, no shooter), and
      // detonateMine's own AOE sweep is what actually catches the
      // Commander, same as it catches a ship or an asteroid.
      if (
        mine?.isAlive &&
        mine.isArmed(nowMs) &&
        !this.pendingMineCollisionTriggers.includes(mine)
      ) {
        this.pendingMineCollisionTriggers.push(mine);
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
    | Wreck
    | Saboteur
    | DriftMine
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
      | Wreck
      | Saboteur
      | DriftMine
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

      // Any hit breaks the kill chain, decided - including one a Shield
      // absorbs. The shield saves the ship, not the streak: letting a
      // shielded player barge through hazards with an intact multiplier
      // would make the safest way to play also the highest-scoring one,
      // which is backwards.
      const hitPlayer = this.players.find((p) => p.ship === ship);
      if (hitPlayer) hitPlayer.combo = breakCombo();
      this.stageHitsTaken += 1;

      if (ship.hasShield) {
        ship.consumeShield();
        this.refreshAllPlayerHud();
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
            this.pendingRespawns.push({
              slotIndex: player.slotIndex,
              respawnAtMs: nowMs + SHIP.respawnDelayMs,
            });
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
  private ejectCommander(
    player: PlayerSlot,
    position: Vector2,
    color: number,
    nowMs: number,
  ): void {
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
    // Already inside the slow-mo beat of a round that's ending - the
    // outcome is snapshotted, don't re-evaluate or double-resolve it.
    if (this.deferredRoundEnd) return;

    // A full 4-slot array indexed by slotIndex, not `this.players.map()`
    // (which would be indexed by array position - wrong the moment any
    // slot is inactive, since `winnerIndex` needs to name the actual P1-4
    // slot). An inactive slot reads as "not alive," which is exactly
    // right for round-outcome purposes - it was never in the fight.
    const outcome = evaluateRoundOutcome(this.aliveFlagsBySlot(), this.mode);
    if (outcome.status === 'continue') return;

    // The blow that ends a round gets the slow-mo beat before the world
    // actually freezes - otherwise the deciding moment is over before
    // anyone sees it. triggerSlowMo() no-ops under prefers-reduced-motion,
    // in which case this resolves on the very next frame instead.
    const nowMs = this.time.now;
    this.triggerSlowMo(nowMs);
    this.deferredRoundEnd = { outcome, resolveAtMs: Math.max(nowMs, this.slowMoUntilMs) };
  }

  /** The actual round-end transition, split out of checkRoundOutcome() so the slow-mo beat above can defer it by a few hundred ms without duplicating any of it. */
  private resolveRoundOutcome(outcome: ResolvedRoundOutcome): void {
    // A demo that manages to lose just hands the screen back to the
    // menu - no GAME OVER overlay waiting on a keypress nobody's there
    // to press, no initials entry, and above all nothing submitted to a
    // real leaderboard on a bot's behalf.
    if (this.isDemo) {
      this.goToMainMenu();
      return;
    }

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
      void this.finishCompetitiveRound(
        outcome.winnerIndex,
        this.scores[outcome.winnerIndex] ?? 0,
        winner,
      );
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
      this.enterInitialsEntry(finalScore, 'singlePlayer', this.players[0]!.input, [
        'GAME OVER',
        `SCORE ${finalScore}`,
      ]);
      return;
    }

    const topLine = leaderboard[0] ? `TOP SCORE ${leaderboard[0].score}` : 'NO SCORES YET';
    this.enterGameOver([
      'GAME OVER',
      `SCORE ${finalScore}`,
      topLine,
      'PRESS ANY KEY FOR MAIN MENU',
    ]);
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
      this.enterInitialsEntry(finalScore, 'competitive', winner.input, [
        winLine,
        `SCORE ${finalScore}`,
      ]);
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
      this.enterInitialsEntry(finalScore, 'cooperative', enterer.input, [
        'GAME OVER',
        `SCORE ${finalScore}`,
      ]);
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
      if (i < entry.activeSlot)
        text.setColor('#8aff4d'); // already confirmed
      else if (i === entry.activeSlot)
        text.setColor(toCssHex(COLORS.players[0])); // active
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
      entry.letters[entry.activeSlot] = String.fromCharCode(
        65 + ((((currentCode + turn) % 26) + 26) % 26),
      );
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

    [entry.titleText, entry.scoreText, entry.instructionText, ...entry.letterTexts].forEach(
      (text) => text.destroy(),
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
      if (!isWithinDropOffRange(rescuer.ship.position, station.position, station.dropOffRadius))
        continue;

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
      player.hullId,
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
        player.hullId,
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
      // Its own synthesized death, no longer the ship's explosion on
      // loan - see systems/ProceduralSfx.ts for why these three are
      // generated rather than bundled as assets.
      playUfoDestroyedSfx(this, getSfxVolume());
      this.spawnBurst(position, COLORS.ufo, EFFECTS.ufoBurst);
      this.shakeCamera(EFFECTS.majorShake);
      if (awardScore && projectile) {
        this.awardScore(projectile.ownerIndex, UFO.score, position);
      }
    }
  }

  /** A shot- or ram-killed Saboteur, same shape as processPendingUfoHits - either way destroySaboteur() still drops its own parting mine. */
  private processPendingSaboteurHits(nowMs: number): void {
    if (this.pendingSaboteurHits.length === 0) return;
    const hits = this.pendingSaboteurHits;
    this.pendingSaboteurHits = [];
    for (const { saboteur, projectile, awardScore } of hits) {
      if (!saboteur.isAlive) continue;
      projectile?.destroy();
      this.destroySaboteur(
        saboteur,
        nowMs,
        awardScore && projectile ? projectile.ownerIndex : undefined,
      );
    }
  }

  /** Shot-triggered mines credit whoever fired the shot; collision-triggered ones are anonymous (undefined ownerIndex) - see detonateMine's own doc comment on why that distinction matters for scoring. */
  private processPendingMineTriggers(nowMs: number): void {
    if (this.pendingMineShotTriggers.length > 0) {
      const shotTriggers = this.pendingMineShotTriggers;
      this.pendingMineShotTriggers = [];
      for (const { mine, projectile } of shotTriggers) {
        if (!mine.isAlive) continue;
        projectile.destroy();
        this.detonateMine(mine, nowMs, projectile.ownerIndex);
      }
    }

    if (this.pendingMineCollisionTriggers.length > 0) {
      const collisionTriggers = this.pendingMineCollisionTriggers;
      this.pendingMineCollisionTriggers = [];
      for (const mine of collisionTriggers) {
        if (!mine.isAlive) continue;
        this.detonateMine(mine, nowMs, undefined);
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

      const destroyed = fracture.takeHit(nowMs, projectile.damage);
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

      const destroyed = fragment.takeHit(nowMs, projectile.damage);
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
        this.triggerSlowMo(nowMs); // the blow that ends the fight - see EFFECTS.slowMo
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
      .text(ARENA_WIDTH / 2, 40, '', {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: toCssHex(COLORS.fracture),
      })
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

  /** The shard is consumed either way, same as the ship-contact branch - the asteroid it hit is destroyed whole (no split, no score), same rule every other boss-asteroid contact below follows. */
  private processPendingFractureShardAsteroidHits(): void {
    if (this.pendingFractureShardAsteroidHits.length === 0) return;
    const hits = this.pendingFractureShardAsteroidHits;
    this.pendingFractureShardAsteroidHits = [];
    for (const { asteroid, shard } of hits) {
      if (shard.isAlive) shard.destroy();
      if (asteroid.isAlive) {
        this.spawnBurst(asteroid.position, COLORS.asteroid, EFFECTS.asteroidBurst);
        asteroid.destroy();
      }
    }
  }

  /**
   * An asteroid touching a boss's own body (Fracture Core/Fragment,
   * Cardinal core/arm) - destroyed whole, no split, no score, same
   * "consumed, not shattered" precedent the Gravity Well's own lethal
   * center set (`processBlackHoleCaptureAndLethal`). The boss itself
   * takes no damage from the contact, same as it takes none from a ship
   * ram - see the ship-contact branches in handleCollision()/
   * updateCardinalAttacks() this mirrors.
   */
  private processPendingWreckAbsorbs(): void {
    if (this.pendingWreckAbsorbs.length === 0) return;
    const absorbed = this.pendingWreckAbsorbs;
    this.pendingWreckAbsorbs = [];
    for (const projectile of absorbed) {
      if (projectile.isAlive) projectile.destroy();
    }
  }

  private processPendingBossAsteroidHits(): void {
    if (this.pendingBossAsteroidHits.length === 0) return;
    const hits = this.pendingBossAsteroidHits;
    this.pendingBossAsteroidHits = [];
    for (const asteroid of hits) {
      if (!asteroid.isAlive) continue;
      this.spawnBurst(asteroid.position, COLORS.asteroid, EFFECTS.asteroidBurst);
      asteroid.destroy();
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

      const destroyed = cardinal.takeArmHit(armIndex, nowMs, projectile.damage);
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
      this.fractureSwarm.push(
        new FractureSwarmBit(this, armPosition, Math.random() * Math.PI * 2, nowMs),
      );
      this.fractureSwarm.push(
        new FractureSwarmBit(this, armPosition, Math.random() * Math.PI * 2, nowMs),
      );
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

      const destroyed = cardinal.takeCoreHit(nowMs, projectile.damage);
      if (!destroyed) {
        this.spawnBurst(cardinal.position, COLORS.cardinal, EFFECTS.asteroidBurst);
        continue;
      }

      this.spawnBurst(cardinal.position, COLORS.ufo, EFFECTS.ufoBurst);
      this.shakeCamera(EFFECTS.majorShake);
      this.triggerSlowMo(nowMs); // the blow that ends the fight - see EFFECTS.slowMo
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

  /** Same extension as processPendingFractureShardAsteroidHits, for the plasma ball. */
  private processPendingCardinalPlasmaAsteroidHits(): void {
    if (this.pendingCardinalPlasmaAsteroidHits.length === 0) return;
    const hits = this.pendingCardinalPlasmaAsteroidHits;
    this.pendingCardinalPlasmaAsteroidHits = [];
    for (const { asteroid, plasma } of hits) {
      if (plasma.isAlive) plasma.destroy();
      if (asteroid.isAlive) {
        this.spawnBurst(asteroid.position, COLORS.asteroid, EFFECTS.asteroidBurst);
        asteroid.destroy();
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
      const distance = Math.hypot(
        player.ship.position.x - position.x,
        player.ship.position.y - position.y,
      );
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

    const fraction =
      cardinal.phase === 'armed' ? cardinal.armHpFraction() : cardinal.coreHpFraction();
    // Left-anchored (setOrigin(0, 0.5) at creation) - same "just mutate
    // .width, never reposition" pattern MenuScene's own volume sliders
    // already use, rather than recomputing .x every frame to fake it.
    fill.width = Math.max(0, CARDINAL_HEALTH_BAR.width * fraction);

    const labelText =
      cardinal.phase === 'armed' ? 'ARMS' : cardinal.phase === 'coreExposed' ? 'CORE' : 'CRITICAL';
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
      .rectangle(
        barLeft,
        barY,
        CARDINAL_HEALTH_BAR.width,
        CARDINAL_HEALTH_BAR.height - 4,
        COLORS.cardinal,
      )
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

    // DENSE FIELD pays double on rocks specifically (StageChoice's
    // FIELD_MODIFIERS) - the reward half of its risk/reward trade.
    const asteroidScore = Math.round(
      ASTEROID[size].score * this.fieldModifiers.asteroidScoreMultiplier,
    );
    this.awardScore(projectile.ownerIndex, asteroidScore, position);

    const childSize: AsteroidSize | null = nextAsteroidSize(size);
    if (childSize) {
      for (let i = 0; i < 2; i += 1) {
        const heading = splitHeading(parentHeading);
        this.asteroids.push(new Asteroid(this, position.x, position.y, childSize, heading));
      }
    }

    // Heavy Shot's kinetic push - a no-op for the base weapon and every
    // other upgrade (kineticImpulse: 0). Runs after this hit's own split
    // children are already in `this.asteroids`, so applyHeavyShotImpulse's
    // one loop covers both "the fresh children get shoved along the shot's
    // heading" and "other nearby asteroids get shoved radially outward" -
    // see that method's own doc comment.
    if (projectile.kineticImpulse > 0) {
      this.applyHeavyShotImpulse(position, projectile.headingRad, projectile.kineticImpulse);
    }
  }

  /**
   * Heavy Shot's area-of-effect push (docs from the brief: "push
   * asteroids, change direction, add momentum to debris... if supported
   * by the game," confirmed via `AskUserQuestion` to reach nearby
   * asteroids/debris, not just the one directly destroyed). Pure vector
   * math lives in `WeaponUpgrades.computeImpulseVelocity` - this just
   * applies whatever it returns directly to each candidate's Matter
   * velocity, same "add to current velocity" pattern used nowhere else
   * in this codebase yet (every other force in this game is either
   * continuous, like Black Hole gravity, or a full override, like
   * capture) - a one-time impulse is exactly what "kinetic force" means
   * physically, so a direct velocity add (not `applyForce`, which is
   * tuned for *sustained* per-frame forces - see SHIP's own doc comment
   * on that gotcha) is the right primitive here.
   */
  private applyHeavyShotImpulse(
    impactPosition: Vector2,
    shotHeadingRad: number,
    strength: number,
  ): void {
    for (const asteroid of this.asteroids) {
      if (!asteroid.isAlive) continue;
      const push = computeImpulseVelocity(
        impactPosition,
        asteroid.position,
        shotHeadingRad,
        strength,
        WEAPON_UPGRADES.heavyShot.impulseRadius,
      );
      if (!push) continue;
      const current = asteroid.visual.getVelocity();
      asteroid.visual.setVelocity(current.x + push.x, current.y + push.y);
    }
  }

  private spawnBurst(
    origin: Vector2,
    color: number,
    config: {
      count: number;
      speedRange: readonly [number, number];
      lifespanMs: number;
      sizePx: number;
    },
  ): void {
    this.bursts.push(
      new DestructionBurst(
        this,
        origin,
        color,
        config.count,
        config.speedRange,
        config.lifespanMs,
        this.time.now,
        config.sizePx,
      ),
    );
  }

  /**
   * Attract mode's pilots (`systems/DemoBot.ts`). Every live hazard on
   * screen is a candidate target, so the demo shoots at whatever the
   * stage actually contains - rocks on a normal stage, the boss's own
   * pieces on a boss stage - rather than only ever plinking asteroids.
   */
  private updateDemoBots(): void {
    const targets: Vector2[] = [
      ...this.asteroids.filter((a) => a.isAlive).map((a) => a.position),
      ...this.ufos.filter((u) => u.isAlive).map((u) => u.position),
      ...this.saboteurs.filter((s) => s.isAlive).map((s) => s.position),
      ...this.fractureFragments.filter((f) => f.isAlive).map((f) => f.position),
    ];
    if (this.fracture?.isAlive) targets.push(this.fracture.position);
    if (this.cardinal?.isAlive) targets.push(this.cardinal.position);

    this.players.forEach((player) => {
      const input = player.input;
      if (!(input instanceof AiInput) || !player.ship.isAlive) return;
      const intent = computeBotIntent(player.ship.position, player.ship.heading, targets);
      input.turnDirection = intent.turnDirection;
      input.isThrusting = intent.isThrusting;
      input.isFiring = intent.isFiring;
    });
  }

  /**
   * Ends the attract loop, either because somebody touched a control -
   * the entire point of an attract screen is that it gets out of the way
   * the instant a person shows up - or because the demo has run its
   * course and it's the leaderboards' turn again. Returns true once it's
   * handed off, so update() can stop touching a scene that's shutting
   * down.
   */
  private checkDemoExit(nowMs: number): boolean {
    const elapsed = nowMs - this.demoStartedAtMs;
    if (!this.demoInputSeen && elapsed < ATTRACT_MODE.demoDurationMs) return false;
    this.goToMainMenu();
    return true;
  }

  /** The one piece of UI the demo adds - without it an attract loop just looks like a game already in progress that ignores you. */
  private showDemoBanner(): void {
    this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT - 60, 'ATTRACT MODE  -  PRESS ANY KEY', {
        fontFamily: 'monospace',
        fontSize: '22px',
        fontStyle: 'bold',
        color: toCssHex(COLORS.players[0]!),
      })
      .setOrigin(0.5, 0.5)
      .setAlpha(0.75);
  }

  /**
   * Arms the "somebody's here, stop demoing" listeners. One-shot
   * listeners rather than polling every frame: a demo has no other
   * reason to look at the keyboard at all, and `once` means a single
   * flag flip instead of per-frame key scanning. Registered on every
   * input route a person could plausibly touch first - key, pointer, or
   * a gamepad button.
   */
  private armDemoExitListeners(): void {
    const noticeInput = (): void => {
      this.demoInputSeen = true;
    };
    this.input.keyboard?.once('keydown', noticeInput);
    this.input.once('pointerdown', noticeInput);
    this.input.gamepad?.once('down', noticeInput);
  }

  /**
   * The 1979 Asteroids panic teleport (`HYPERSPACE` in GameConfig.ts):
   * vanish, reappear somewhere uniformly random in the arena, and
   * occasionally don't survive the trip. Velocity is deliberately
   * **not** preserved - the whole point is that you come out of it
   * stationary and disoriented, which is what makes it a real decision
   * rather than a free dodge.
   *
   * A misjump feeds `pendingShipHits` rather than destroying the ship
   * directly, so every mode-specific consequence (Cooperative ejects a
   * Commander, Competitive/Single Player spend a life, a Shield absorbs
   * it) comes along for free - see HYPERSPACE's own config comment for
   * why a Shield saving you here is deliberate rather than an oversight.
   */
  private jumpHyperspace(player: PlayerSlot): void {
    const ship = player.ship;
    if (!ship.isAlive) return;

    const origin = ship.position;
    this.spawnBurst(origin, ship.color, EFFECTS.asteroidBurst);

    const margin = HYPERSPACE.edgeMarginPx;
    const destination = {
      x: margin + Math.random() * (ARENA_WIDTH - margin * 2),
      y: margin + Math.random() * (ARENA_HEIGHT - margin * 2),
    };
    ship.visual.setPosition(destination.x, destination.y);
    ship.visual.setVelocity(0, 0);
    this.spawnBurst(destination, ship.color, EFFECTS.asteroidBurst);
    this.sound.play(SHIELD_PICKUP_SFX_KEY, { volume: getSfxVolume() }); // no dedicated jump SFX yet - closest existing "something teleported/appeared" cue

    if (Math.random() < HYPERSPACE.deathChance && !this.pendingShipHits.includes(ship)) {
      this.pendingShipHits.push(ship);
    }
  }

  /** Clears the per-stage tally behind the stage-clear rank - called wherever stageElapsedMs resets, since both measure the same window. */
  private resetStageRankStats(): void {
    this.stageShotsFired = 0;
    this.stageShotsHit = 0;
    this.stageHitsTaken = 0;
  }

  /** The stage's rank as of right now (systems/StageRank.ts) - crew-wide rather than per-player, so the stage-clear screen shows one letter instead of up to four competing ones. */
  private currentStageRank(): StageRankResult {
    return computeStageRank(
      {
        shotsFired: this.stageShotsFired,
        shotsHit: this.stageShotsHit,
        hitsTaken: this.stageHitsTaken,
        elapsedMs: this.stageElapsedMs,
      },
      STAGE_RANK,
    );
  }

  /** Honors the OS "reduce motion" setting, same courtesy HyperOut's own screen shake already extends - decorative particle bursts aren't gated, only camera motion is. */
  private shakeCamera(config: { durationMs: number; intensity: number }): void {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.cameras.main.shake(config.durationMs, config.intensity);
  }

  /**
   * Starts the EFFECTS.slowMo beat (see the top of update() for where it
   * actually applies). Gated by "reduce motion" exactly like
   * shakeCamera() above - a whole-screen time distortion is a stronger
   * motion effect than the shake is, so if anything it's the more
   * important of the two to honor. Leaves `slowMoUntilMs` in the past
   * when gated, so callers that schedule work off it (checkRoundOutcome)
   * simply resolve immediately instead of needing their own branch.
   */
  private triggerSlowMo(nowMs: number): void {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    this.slowMoUntilMs = nowMs + EFFECTS.slowMo.durationMs;
  }

  /** `position` is where the hit landed - the score popup spawns there, in the scoring player's own HUD color. */
  /**
   * Every scoring kill in the game funnels through here, which is
   * exactly why the kill chain hooks in at this one place rather than
   * at each individual destruction site - an asteroid, a UFO, a
   * Fracture tier and a Cardinal arm all count toward the same chain
   * without any of them needing to know the chain exists.
   *
   * The popup shows the *awarded* (already multiplied) figure, so what
   * floats off the wreck is what actually landed on the scoreboard.
   */
  private awardScore(ownerIndex: number, amount: number, position: Vector2): void {
    const nowMs = this.time.now;
    this.stageShotsHit += 1;
    const scorer = this.players.find((p) => p.slotIndex === ownerIndex);
    if (scorer) scorer.combo = registerKill(scorer.combo, nowMs, COMBO);
    const multiplier = scorer ? comboMultiplier(scorer.combo, COMBO) : 1;
    const awarded = amount * multiplier;

    this.scores[ownerIndex] = (this.scores[ownerIndex] ?? 0) + awarded;
    this.refreshAllPlayerHud();
    const color = COLORS.players[ownerIndex] ?? COLORS.players[0];
    this.scorePopups.push(new ScorePopup(this, position, color, awarded, nowMs));
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
    this.players.forEach((player) => {
      player.hudText.setText(
        formatPlayerHud(this.mode, this.playerHudDataFor(player), LIVES_PER_PLAYER),
      );
    });
  }

  /** Shared by `refreshAllPlayerHud` (host's own screen) and `buildPlayerHudSnapshots` (what a client's screen gets built from) - one source of truth for "what does this player's HUD actually say right now." */
  private playerHudDataFor(player: PlayerSlot): PlayerHudData {
    const pooledScore = this.scores.reduce((sum, score) => sum + score, 0);
    return {
      slotIndex: player.slotIndex,
      score: this.mode === 'competitive' ? (this.scores[player.slotIndex] ?? 0) : pooledScore,
      lives: player.lives,
      comboMultiplier: comboMultiplier(player.combo, COMBO),
      scrap: player.scrap,
      statusLine: this.mode === 'cooperative' ? this.cooperativeStatusLine(player) : null,
    };
  }

  /**
   * Host only (docs/roadmap.md's "Windows + LAN multiplayer," Sprint 10)
   * - every player slot's score/lives/combo/scrap/status, sent every
   * tick regardless of whether that player's ship is currently alive
   * (unlike `ships`, which drops a destroyed one) so a client keeps
   * showing a correct HUD - including "ELIMINATED" - after a player's
   * ship is gone.
   */
  private buildPlayerHudSnapshots(): PlayerHudSnapshot[] {
    return this.players.map((player) => ({
      ...this.playerHudDataFor(player),
      eliminated: player.eliminated,
    }));
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
    // "Moves back after [the boss fight]," decided - only actually away
    // if a boss fight just ended (spaceStationRelocated), so this is a
    // safe no-op on every other stage-clear.
    if (this.spaceStation && this.spaceStationRelocated) {
      this.spaceStation.travelTo(
        { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 },
        this.time.now,
        SPACE_STATION.relocateTravelMs,
      );
      this.spaceStationRelocated = false;
    }
    this.enterShop();
  }

  /**
   * The weapon shop - requested directly as its own design pass (four
   * confirmed `AskUserQuestion` rounds: trigger timing, multiplayer
   * layout, input model, mode scope, then eliminated-player handling and
   * purchase timing). One shared screen, every stage clear: up to 4
   * player-colored panels (`this.players.length`, not always 4 - only
   * players actually in this round get one), each independently
   * navigated with that player's own existing controls - no new
   * bindings, per the confirmed design. `matter.world` is already
   * paused by `enterStageClear()`; this screen owns `update()` entirely
   * while `this.state === 'shop'` (see the dispatch in `update()`),
   * same "a different per-frame path than showOverlay's one-shot 'any
   * key'" shape `updateInitialsEntry()` already established - this one
   * needs to read every active player's direction/fire every frame, not
   * just detect a single press, and needs to do it for up to 4 players
   * independently at once.
   *
   * **Eliminated players get a non-interactive "OUT" panel** (confirmed
   * via `AskUserQuestion`) - still occupies a slot in the layout, but
   * excluded from the all-ready gate entirely, so a player already out
   * for the round can never stall the other three.
   *
   * **Purchases are immediate** (confirmed via `AskUserQuestion`): each
   * row's confirm press calls `purchaseWeaponUpgrade()` - the exact same
   * hook the round/shop integration was already built around - right
   * then, not staged for later. A player sees their own Scrap count and
   * OWNED state update live as they buy.
   */
  private shop:
    | {
        panels: ShopPanel[];
        headlineText: Phaser.GameObjects.Text;
        subheadlineText: Phaser.GameObjects.Text;
        hintText: Phaser.GameObjects.Text;
      }
    | undefined;

  private enterShop(): void {
    this.state = 'shop';
    this.stageChoiceOptions = this.stageChoicesForNextStage();

    const rank = this.currentStageRank();
    const headlineText = this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 220, `STAGE CLEARED   -   RANK ${rank.letter}`, {
        fontFamily: 'monospace',
        fontSize: '48px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const subheadlineText = this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 168, 'SHOP - SPEND YOUR SCRAP', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#9a9ab0',
      })
      .setOrigin(0.5);
    const hintText = this.add
      .text(
        ARENA_WIDTH / 2,
        ARENA_HEIGHT / 2 + 230,
        'TURN: select   FIRE: buy / vote / toggle ready',
        {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: '#6a6a80',
        },
      )
      .setOrigin(0.5);

    const panelCount = this.players.length;
    const totalWidth = panelCount * SHOP_PANEL_WIDTH + (panelCount - 1) * SHOP_PANEL_GAP;
    const startX = ARENA_WIDTH / 2 - totalWidth / 2 + SHOP_PANEL_WIDTH / 2;
    const panelY = ARENA_HEIGHT / 2 + 10;

    const panels = this.players.map((player, i) =>
      this.buildShopPanel(player, startX + i * (SHOP_PANEL_WIDTH + SHOP_PANEL_GAP), panelY),
    );

    this.shop = { panels, headlineText, subheadlineText, hintText };
  }

  private buildShopPanel(player: PlayerSlot, x: number, y: number): ShopPanel {
    const color = COLORS.players[player.slotIndex]!;
    const bg = this.add
      .rectangle(x, y, SHOP_PANEL_WIDTH, SHOP_PANEL_HEIGHT, 0x0a0a12, 1)
      .setStrokeStyle(2, color, player.eliminated ? 0.35 : 1);

    const headerY = y - SHOP_PANEL_HEIGHT / 2 + 26;
    const headerText = this.add
      .text(x, headerY, '', {
        fontFamily: 'monospace',
        fontSize: '20px',
        fontStyle: 'bold',
        color: toCssHex(color),
        align: 'center', // eliminated panels render 2 lines ("P2\nOUT") - without this, Phaser left-aligns the narrower line relative to the wider one within the block
      })
      .setOrigin(0.5);

    if (player.eliminated) {
      const eliminatedPanel: ShopPanel = {
        slotIndex: player.slotIndex,
        eliminated: true,
        cursor: 'ready',
        ready: true,
        prevTurnDirection: 0,
        prevFiring: false,
        bg,
        headerText,
        rowTexts: [],
        voteTexts: [],
        voteLabelText: undefined,
        readyText: undefined,
      };
      this.refreshShopPanel(eliminatedPanel);
      return eliminatedPanel;
    }

    const rowStartY = headerY + 40;
    const rowTexts = ALL_WEAPON_UPGRADE_IDS.map((_, i) =>
      this.add
        .text(x - SHOP_PANEL_WIDTH / 2 + 24, rowStartY + i * SHOP_ROW_HEIGHT, '', {
          fontFamily: 'monospace',
          fontSize: '16px',
        })
        .setOrigin(0, 0.5),
    );
    // One row per stage-choice option, directly under the upgrades -
    // the crew votes on what's next from the same panel they're already
    // navigating, rather than on a separate screen with its own input
    // loop (docs/roadmap.md's light stage choice).
    const voteLabelY = rowStartY + ALL_WEAPON_UPGRADE_IDS.length * SHOP_ROW_HEIGHT + 6;
    const voteLabelText =
      this.stageChoiceOptions.length > 0
        ? this.add
            .text(x, voteLabelY, '- VOTE: NEXT STAGE -', {
              fontFamily: 'monospace',
              fontSize: '14px',
              color: '#6a6a80',
            })
            .setOrigin(0.5)
        : undefined;
    const voteStartY = voteLabelY + 26;
    const voteTexts = this.stageChoiceOptions.map((_, i) =>
      this.add
        .text(x - SHOP_PANEL_WIDTH / 2 + 24, voteStartY + i * SHOP_ROW_HEIGHT, '', {
          fontFamily: 'monospace',
          fontSize: '15px',
        })
        .setOrigin(0, 0.5),
    );

    const readyText = this.add
      .text(x, voteStartY + this.stageChoiceOptions.length * SHOP_ROW_HEIGHT + 14, '', {
        fontFamily: 'monospace',
        fontSize: '17px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const panel: ShopPanel = {
      slotIndex: player.slotIndex,
      eliminated: false,
      cursor: ALL_WEAPON_UPGRADE_IDS[0]!,
      ready: false,
      prevTurnDirection: 0,
      prevFiring: false,
      bg,
      headerText,
      rowTexts,
      voteTexts,
      voteLabelText,
      readyText,
    };
    this.refreshShopPanel(panel);
    return panel;
  }

  /** Every panel's own turn/fire edge-detection and state transitions - same "read direction/fire every frame, act only on the rising edge" shape `updateInitialsEntry()` established, just run once per non-eliminated player instead of once for a single shared input. Advances the round once every non-eliminated panel is ready. */
  private updateShop(): void {
    const shop = this.shop;
    if (!shop) return;

    for (const panel of shop.panels) {
      if (panel.eliminated) continue;
      const player = this.players.find((p) => p.slotIndex === panel.slotIndex);
      if (!player) continue;
      const input = player.input;

      const turn = input.turnDirection;
      if (turn !== 0 && panel.prevTurnDirection === 0) {
        panel.cursor = nextShopRow(panel.cursor, turn, this.shopRowIds());
        this.refreshShopPanel(panel);
      }
      panel.prevTurnDirection = turn;

      const firing = input.isFiring;
      if (firing && !panel.prevFiring) {
        if (panel.cursor === 'ready') {
          panel.ready = !panel.ready;
        } else if (panel.cursor.startsWith('vote:')) {
          // Radio-style: selecting a vote row replaces this player's
          // previous vote rather than accumulating.
          player.stageVote = panel.cursor.slice('vote:'.length) as StageChoiceId;
          this.refreshAllShopPanels();
        } else {
          this.purchaseWeaponUpgrade(player.slotIndex, panel.cursor as WeaponUpgradeId);
        }
        this.refreshShopPanel(panel);
      }
      panel.prevFiring = firing;
    }

    const allReady = shop.panels.every((panel) => panel.eliminated || panel.ready);
    if (allReady) this.exitShopAndAdvance();
  }

  /** Stage-scaled asteroid count with this stage's chosen field flavor applied on top (StageChoice.FIELD_MODIFIERS). */
  private modifiedAsteroidCount(): number {
    const base = computeAsteroidSpawnCount(this.normalStageCount, this.players.length);
    return Math.max(1, Math.round(base * this.fieldModifiers.asteroidCountMultiplier));
  }

  /** Same, for UFO cadence - a lower interval means they arrive more often. */
  private modifiedUfoIntervalMs(): number {
    const base = computeUfoSpawnIntervalMs(this.normalStageCount, this.players.length);
    return Math.round(base * this.fieldModifiers.ufoIntervalMultiplier);
  }

  /** The full ordered row list a shop panel cursor cycles through: upgrades, then this transition's stage-choice votes, then READY. */
  private shopRowIds(): string[] {
    return [
      ...ALL_WEAPON_UPGRADE_IDS,
      ...this.stageChoiceOptions.map((option) => `vote:${option.id}`),
      'ready',
    ];
  }

  /**
   * What's on offer at this stage transition. The normal/boss
   * alternation still decides *which kind* of stage comes next (item
   * 22) - this only decides its flavor, so `lastStageWasBoss` is read
   * exactly the way beginNextLevel() reads it.
   */
  private stageChoicesForNextStage(): readonly StageChoiceOption[] {
    return this.lastStageWasBoss ? FIELD_CHOICES : BOSS_CHOICES;
  }

  private refreshAllShopPanels(): void {
    this.shop?.panels.forEach((panel) => this.refreshShopPanel(panel));
  }

  /**
   * Turns the crew's votes into the next stage's flavor. Votes are
   * gathered by slot index so `resolveStageVote`'s "lowest-numbered
   * voter breaks a tie" rule means the actual P1-P4 ordering, not
   * whatever order players happen to sit in `this.players`.
   */
  private resolveStageChoice(): void {
    if (this.stageChoiceOptions.length === 0) return;
    const votesBySlot: (StageChoiceId | undefined)[] = [0, 1, 2, 3].map(
      (slot) => this.players.find((p) => p.slotIndex === slot)?.stageVote,
    );
    const winner = resolveStageVote(votesBySlot, this.stageChoiceOptions);

    if (isFieldChoice(winner)) {
      this.fieldModifiers = FIELD_MODIFIERS[winner];
      this.chosenBoss = undefined;
    } else {
      this.chosenBoss = winner;
      this.fieldModifiers = FIELD_MODIFIERS.standard;
    }
    this.players.forEach((player) => {
      player.stageVote = undefined;
    });
  }

  private refreshShopPanel(panel: ShopPanel): void {
    const player = this.players.find((p) => p.slotIndex === panel.slotIndex);
    if (!player) return;

    if (panel.eliminated) {
      panel.headerText.setText(`P${panel.slotIndex + 1}\nOUT`);
      return;
    }

    panel.headerText.setText(`P${panel.slotIndex + 1}   SCRAP ${player.scrap}`);

    ALL_WEAPON_UPGRADE_IDS.forEach((id, i) => {
      const text = panel.rowTexts[i];
      if (!text) return;
      const owned = hasUpgrade({ active: player.weapon.active }, id);
      const affordable = player.scrap >= WEAPON_UPGRADES.costs[id];
      const selected = panel.cursor === id;
      const marker = selected ? '> ' : '  ';
      const state = owned ? 'OWNED' : String(WEAPON_UPGRADES.costs[id]);
      text.setText(`${marker}${WEAPON_UPGRADE_LABELS[id].padEnd(12)}${state}`);
      text.setColor(
        owned
          ? toCssHex(COLORS.scrap)
          : affordable
            ? selected
              ? toCssHex(COLORS.players[panel.slotIndex]!)
              : '#dfe1ef'
            : '#5a5a6e',
      );
    });

    this.stageChoiceOptions.forEach((option, i) => {
      const text = panel.voteTexts[i];
      if (!text) return;
      const rowId = `vote:${option.id}`;
      const selected = panel.cursor === rowId;
      const votedForThis = player.stageVote === option.id;
      // A filled marker is this player's own vote; the count after it is
      // the whole crew's, so everyone can see the vote forming.
      const votes = this.players.filter((p) => p.stageVote === option.id).length;
      const marker = selected ? '>' : ' ';
      const chosen = votedForThis ? '*' : ' ';
      text.setText(`${marker}${chosen}${option.label.padEnd(14)}${votes > 0 ? votes : ''}`);
      text.setColor(
        votedForThis
          ? toCssHex(COLORS.players[panel.slotIndex]!)
          : selected
            ? '#dfe1ef'
            : '#6a6a80',
      );
    });

    if (panel.readyText) {
      const readySelected = panel.cursor === 'ready';
      panel.readyText.setText(panel.ready ? 'READY' : readySelected ? '> READY? <' : 'READY?');
      panel.readyText.setColor(
        panel.ready
          ? toCssHex(COLORS.scrap)
          : readySelected
            ? toCssHex(COLORS.players[panel.slotIndex]!)
            : '#6a6a80',
      );
    }
  }

  private exitShopAndAdvance(): void {
    this.resolveStageChoice();
    this.exitShop();
    this.beginNextLevel();
  }

  private exitShop(): void {
    const shop = this.shop;
    if (!shop) return;
    shop.headlineText.destroy();
    shop.subheadlineText.destroy();
    shop.hintText.destroy();
    shop.panels.forEach((panel) => {
      panel.bg.destroy();
      panel.headerText.destroy();
      panel.rowTexts.forEach((text) => text.destroy());
      panel.voteTexts.forEach((text) => text.destroy());
      panel.voteLabelText?.destroy();
      panel.readyText?.destroy();
    });
    this.shop = undefined;
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
      // The crew's own pick if they made one, otherwise the original
      // coin flip - which still covers the very first transition of a
      // round, before any shop has been seen.
      const boss =
        this.chosenBoss === 'fracture'
          ? 'fracture'
          : this.chosenBoss === 'cardinal'
            ? 'cardinal'
            : this.pickRandomBoss();
      this.chosenBoss = undefined;
      this.beginBossAnnouncement(boss);
      return;
    }
    this.lastStageWasBoss = false;
    this.normalStageCount += 1;
    this.state = 'playing';
    this.matter.world.resume();
    this.stageElapsedMs = 0;
    this.resetStageRankStats();
    this.playStageMusic(GAMEPLAY_MUSIC_KEY);
    this.resetStageHazards(this.time.now, false);
    this.spawnWave(this.modifiedAsteroidCount());
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
   *
   * Extended, on request: also clears any leftover UFO(s) and their
   * in-flight shots - "no UFO" on a fresh stage - and teleports every
   * still-alive player's ship back to their own home spawn point ("ships
   * of all players at home location"), same corner/dead-center offset
   * spawnOffsetFor() already uses for round start and death-respawn.
   * Deliberately skips any player whose ship isn't alive right now
   * (eliminated, mid-respawn-delay, or - Cooperative - currently a
   * drifting/being-towed Commander instead of a ship): eliminated stays
   * eliminated, and the other two cases already have their own place
   * that positions them correctly (processPendingRespawns, the rescue
   * flow) without this method's help.
   *
   * `isBossStageStart` (requested directly, "for all bosses in all game
   * modes the spawn point should be safe and the players should be 3
   * seconds unbreakable"): when true, teleported ships use
   * `BOSS_RESPAWN_OFFSETS` unconditionally (the same safe corners a
   * mid-fight respawn already gets via `spawnOffsetFor`'s own
   * `isBossEncounterActive()` check - including in Single Player, which
   * that check already exempts from its usual dead-center spawn during
   * an active boss encounter) instead of the normal home diamond, and
   * `BOSS_STAGE_START.invulnerabilityMs` (3000ms) instead of the usual
   * `SHIP.respawnInvulnerabilityMs` (2000ms). Can't just rely on
   * `spawnOffsetFor()`'s own `isBossEncounterActive()` check here -
   * this method runs *before* `materializeFracture()`/
   * `materializeCardinal()` actually create the boss entity, so that
   * check would still read false at this exact moment; the explicit
   * flag sidesteps that ordering entirely rather than reordering boss
   * creation earlier (which would risk other timing assumptions
   * elsewhere). A normal (non-boss) stage transition keeps exactly the
   * prior behavior - a fresh wave's rocks can spawn right on top of
   * arena-center/the home diamond, and this isn't the player's fault the
   * way flying into a rock mid-stage would be, hence the (shorter) grace
   * period either way.
   */
  private resetStageHazards(nowMs: number, isBossStageStart: boolean): void {
    this.asteroids = [];
    // Terrain is per-stage: cleared here, and regenerated below for a
    // normal stage only. A boss fight keeps the arena empty - both
    // bosses are built around open space (a rotating laser cross and a
    // thing that drifts to center), and cover would quietly undermine
    // fights that were designed and tuned without it.
    this.clearTerrain();
    if (!isBossStageStart) this.generateStageTerrain();
    if (this.blackHole) this.despawnBlackHole(nowMs);
    // "Not before 2 min into any stage," decided - stageElapsedMs resets
    // to 0 right after this call (beginNextLevel()/materializeFracture()/
    // materializeCardinal()), so gating the spawn check on it (below)
    // already gives every stage its own fresh grace period with no
    // extra bookkeeping here. Just needs its own warning-sound flag reset.
    this.blackHoleWarningPlayed = false;

    this.ufos.forEach((ufo) => ufo.destroy());
    this.ufos = [];
    this.ufoShots.forEach((shot) => shot.destroy());
    this.ufoShots = [];
    // Same "no UFO on a fresh stage" rule, extended to the Saboteur and
    // anything it was still carrying/had already dropped.
    this.saboteurs.forEach((saboteur) => saboteur.destroy());
    this.saboteurs = [];
    this.driftMines.forEach((mine) => mine.destroy());
    this.driftMines = [];

    for (const player of this.players) {
      if (!player.ship.isAlive) continue;
      player.ship.destroy();
      const offset = isBossStageStart
        ? BOSS_RESPAWN_OFFSETS[player.slotIndex]!
        : this.spawnOffsetFor(player.slotIndex);
      player.ship = new Ship(
        this,
        ARENA_WIDTH / 2 + offset.x,
        ARENA_HEIGHT / 2 + offset.y,
        COLORS.players[player.slotIndex]!,
        this.mode === 'competitive',
        player.hullId,
      );
      const invulnerabilityMs = isBossStageStart
        ? BOSS_STAGE_START.invulnerabilityMs
        : SHIP.respawnInvulnerabilityMs;
      player.ship.grantInvulnerability(nowMs, invulnerabilityMs);
    }
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
    const announcementDurationMs =
      boss === 'fracture' ? FRACTURE.announcementDurationMs : CARDINAL.announcementDurationMs;
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
    this.resetStageRankStats();
    this.playStageMusic(FRACTURE_MUSIC_KEY);
    const nowMs = this.time.now;
    this.resetStageHazards(nowMs, true);
    this.spawnWave(FRACTURE.spawnAsteroidCount);
    this.fracture = new Fracture(
      this,
      { x: ARENA_WIDTH / 2, y: FRACTURE_SPAWN_OFFSCREEN_Y },
      nowMs,
    );
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
    this.resetStageRankStats();
    this.playStageMusic(CARDINAL_MUSIC_KEY);
    const nowMs = this.time.now;
    this.resetStageHazards(nowMs, true);
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
    const backdrop = this.add.rectangle(
      centerX,
      centerY,
      ARENA_WIDTH,
      ARENA_HEIGHT,
      0x05050a,
      0.75,
    );
    const title = this.add
      .text(centerX, centerY - 160, 'PAUSED', {
        fontFamily: 'monospace',
        fontSize: '64px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const continueButton = this.makeMenuButton(centerX, centerY - 20, 'CONTINUE', () =>
      this.exitPaused(),
    );
    const restartButton = this.makeMenuButton(centerX, centerY + 60, 'RESTART', () =>
      this.scene.restart({ mode: this.mode }),
    );
    const mainMenuButton = this.makeMenuButton(centerX, centerY + 140, 'MAIN MENU', () =>
      this.goToMainMenu(),
    );
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
    const bg = this.add
      .rectangle(x, y, 280, 64, 0x14141c, 1)
      .setStrokeStyle(2, COLORS.players[0], 1);
    const text = this.add
      .text(x, y, label, {
        fontFamily: 'monospace',
        fontSize: '26px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
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
    const startY = ARENA_HEIGHT / 2 - (lines.length - 1) * 24;
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
