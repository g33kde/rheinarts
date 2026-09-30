import Phaser from 'phaser';
import { playLoopingSound, setVolume } from '../audio/LoopingSound';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  ATTRACT_MODE,
  COLORS,
  HULL_IDS,
  HULLS,
  type HullId,
} from '../config/GameConfig';
import { computeGamepadReadiness, type InputSource } from '../systems/GamepadAssignment';
import { getMusicVolume, getSfxVolume, setMusicVolume, setSfxVolume } from '../systems/AudioSettings';
import { filterStandardGamepads } from '../systems/GamepadDetection';
import { fetchLeaderboard, type LeaderboardEntry } from '../systems/HighScoreApi';
import { MENU_MUSIC_KEY } from '../systems/Music';
import { GAME_MODE_LABELS, type GameMode } from '../systems/RoundOutcome';
import { toCssHex } from '../utilities/Color';

const MODE_ORDER: readonly GameMode[] = ['cooperative', 'competitive', 'singlePlayer'];

// Sized for the current 1920x1200 arena (2x the original 960x600 design
// this screen was first built against) - proportional/fixed pixel values
// below, not computed ratios, since there's only ever been the one
// resolution to design for at a time.
const CARD_COUNT = 4;
const CARD_WIDTH = 400;
const CARD_HEIGHT = 300;
const CARD_GAP = 40;
const CARDS_TOP = 500;

interface ModeButton {
  bg: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
}

interface LeaderboardPanel {
  border: Phaser.GameObjects.Rectangle;
  title: Phaser.GameObjects.Text;
  text: Phaser.GameObjects.Text;
  hint: Phaser.GameObjects.Text;
}

/**
 * The start screen decided in docs/art_direction.md: title, mode toggle,
 * 4 player-status cards (P1/P2 keyboard<->gamepad toggle, real Gamepad
 * API connection detection in priority order per docs/controls.md), Start
 * with no player-count gating - plus Escape-driven quit confirmation,
 * replicated from HyperOut (see docs/controls.md).
 *
 * The Twin-Planets/nebula background from that doc isn't built here (it
 * landed on the play field instead, per explicit instruction - see
 * `entities/Background.ts`) - this uses a flat background color. The mode
 * toggle and the P1/P2 keyboard⇄gamepad `sources` are consumed now
 * (`scene.start('Game', { mode, sources })` - see `GameScene`'s
 * Competitive-mode and gamepad-input wiring). Music/SFX volume sliders
 * ARE fully functional (`AudioSettings`), unlike this screen's original
 * inert placeholders.
 *
 * **Single Player** (added after the original Cooperative/Competitive
 * toggle) is a third mode option, not a new UI concept - same
 * `MODE_LABELS`-driven segmented buttons, just three instead of two. It's
 * locked to exactly P1 (`docs/gameplay.md`): P2-P4's cards read LOCKED
 * regardless of their own source/readiness while it's selected, and P2's
 * own keyboard⇄gamepad toggle goes inert (P1's stays live - P1 always
 * plays). `GameScene.buildPlayers()` enforces the actual lock; this is
 * just the menu reflecting it.
 *
 * **Every mode now has its own top-3 leaderboard panel** ("behave like
 * the one for single player, but are separately tracked," decided) -
 * `systems/HighScoreApi.ts`/`debris-highscore-api` tracks three boards,
 * one per `GameMode`, not one shared board. Only the panel matching
 * `this.mode` is ever visible, each aligned to its own mode button's
 * width/center-x (same "belongs to that button" reasoning Single
 * Player's own panel was fixed to use).
 *
 * Every clickable "button" here is an explicit `Rectangle` + `Text` pair,
 * not `Text`'s own `backgroundColor` - Phaser's canvas-backed Text
 * texture bleeds a dark fringe at its edges once the game canvas is
 * scaled (Phaser.Scale.FIT always scales it), which is what the reported
 * "black borders" on the Start button actually was. A vector `Rectangle`
 * doesn't have that failure mode - already proven out by the player
 * cards' own boxes before this fix generalized it everywhere else.
 */
export class MenuScene extends Phaser.Scene {
  private mode: GameMode = 'cooperative';
  private sources: InputSource[] = ['keyboard', 'keyboard', 'gamepad', 'gamepad'];
  private cardStatusTexts: Phaser.GameObjects.Text[] = [];
  private cardBorders: Phaser.GameObjects.Rectangle[] = [];
  /** [change] toggle text, indices 0-1 only (P1/P2 - P3/P4 never had one). */
  private cardToggleTexts: Phaser.GameObjects.Text[] = [];
  private modeButtons: Record<GameMode, ModeButton> = {} as Record<GameMode, ModeButton>;
  private leaderboardPanels: Record<GameMode, LeaderboardPanel> = {} as Record<GameMode, LeaderboardPanel>;
  /** Last-fetched snapshot per mode - rendered immediately (possibly stale/empty) on every mode (re)selection, then refreshed once that mode's async fetch resolves. Kept at full length (not sliced to 3) so it can be handed straight to HighScoreScene on click without a second fetch. */
  private leaderboardCaches: Record<GameMode, LeaderboardEntry[]> = {
    cooperative: [],
    competitive: [],
    singlePlayer: [],
  };
  // Escape here mirrors HyperOut's MENU <-> QUIT_CONFIRM toggle exactly
  // (docs/art_direction.md's menu is explicitly modeled on HyperOut's).
  private confirmingQuit = false;
  /** Wall-clock time of the last sign of a person, for the attract-mode idle timer (see checkAttractModeIdle). */
  private lastInteractionAtMs = 0;
  /** Per-slot hull choice (config's HULLS), carried into GameScene at start. Defaults to the pre-hull ship so an untouched menu behaves exactly as it always did. */
  private hulls: HullId[] = ['interceptor', 'interceptor', 'interceptor', 'interceptor'];
  private cardShipIcons: Phaser.GameObjects.Graphics[] = [];
  /** What each icon currently shows, so refreshCardStatus only redraws on an actual change. */
  private cardIconHulls: HullId[] = [];
  private cardHullTexts: Phaser.GameObjects.Text[] = [];
  private cardHullBlurbs: Phaser.GameObjects.Text[] = [];
  private quitConfirmObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('Menu');
  }

  create(): void {
    playLoopingSound(this, MENU_MUSIC_KEY, getMusicVolume());
    this.lastInteractionAtMs = this.time.now;
    this.input.keyboard?.on('keydown', () => this.noteInteraction());
    this.input.on('pointerdown', () => this.noteInteraction());
    this.input.on('pointermove', () => this.noteInteraction());
    this.input.gamepad?.on('down', () => this.noteInteraction());
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.confirmingQuit = false;
    this.quitConfirmObjects = [];
    // This scene instance persists across scene.start() cycles (no fresh
    // constructor call) - Menu -> Game -> "Main Menu" button re-enters
    // this same create(), and createPlayerCards() below *pushes* onto
    // these two arrays. Without resetting them here first, the old
    // (now-destroyed) Text/Rectangle references from the previous visit
    // stay at indices 0-3 while the new ones land at 4-7, and
    // refreshCardStatus()'s every-frame loop over indices 0-3 then calls
    // methods on destroyed GameObjects - this was the actual "crash when
    // pressing Main Menu" bug, the same class of bug as GameScene's
    // restart-state-leak fix a few entries back, just never exercised
    // until this scene had an actual way back into it.
    this.cardStatusTexts = [];
    this.cardBorders = [];
    this.cardToggleTexts = [];
    this.cardShipIcons = [];
    this.cardIconHulls = [];
    this.cardHullTexts = [];
    this.cardHullBlurbs = [];

    this.createTitle();
    this.createControlLegend();
    this.createModeToggle();
    this.createPlayerCards();
    this.createVolumeSliders();
    this.createStartButton();

    this.input.keyboard?.on('keydown-ENTER', () => {
      if (!this.confirmingQuit) this.startGame();
    });
    this.input.keyboard?.on('keydown-SPACE', () => {
      if (!this.confirmingQuit) this.startGame();
    });
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.confirmingQuit) this.hideQuitConfirm();
      else this.showQuitConfirm();
    });
  }

  update(): void {
    this.refreshCardStatus();
    this.checkAttractModeIdle();
  }

  /**
   * Attract mode (ATTRACT_MODE in GameConfig.ts): once the menu has sat
   * untouched long enough, hand the screen over to a demo round that
   * flies itself, which bounces back here when it's done - so an idle
   * cabinet alternates between the leaderboards on this screen and the
   * game actually being played, rather than showing a still menu
   * forever.
   *
   * Deliberately suppressed while the quit dialog is open: that's a
   * person mid-decision, not an idle machine.
   */
  private checkAttractModeIdle(): void {
    if (this.confirmingQuit) return;
    if (this.time.now - this.lastInteractionAtMs < ATTRACT_MODE.menuIdleMs) return;
    this.scene.start('Game', { mode: this.mode, sources: this.sources, hulls: this.hulls, demo: true });
  }

  /** Any sign of a person resets the attract-mode countdown - see checkAttractModeIdle(). */
  private noteInteraction(): void {
    this.lastInteractionAtMs = this.time.now;
  }

  private createTitle(): void {
    const glow = toCssHex(COLORS.players[0]);
    this.add
      .text(ARENA_WIDTH / 2, 120, 'DEBRIS', {
        fontFamily: 'monospace',
        fontSize: '128px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: glow,
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setShadow(0, 0, glow, 20, true, true);
  }

  private createControlLegend(): void {
    this.add
      .text(
        ARENA_WIDTH / 2,
        220,
        'P1: A/D turn, W thrust, SPACE shoot    P2: ←/→ turn, ↑ thrust, RCTRL shoot    P3/P4: gamepad only',
        { fontFamily: 'monospace', fontSize: '22px', color: '#9a9ab0' },
      )
      .setOrigin(0.5);
  }

  private createModeToggle(): void {
    const y = 330;
    const width = 300;
    const height = 70;
    const gap = 30;
    const totalWidth = MODE_ORDER.length * width + (MODE_ORDER.length - 1) * gap;
    const left = ARENA_WIDTH / 2 - totalWidth / 2;

    const modeCenterX = {} as Record<GameMode, number>;
    MODE_ORDER.forEach((mode, i) => {
      const x = left + width / 2 + i * (width + gap);
      modeCenterX[mode] = x;
      const bg = this.add.rectangle(x, y, width, height, 0x14141c, 1).setStrokeStyle(2, 0x3a3a4a, 1);
      const text = this.add
        .text(x, y, GAME_MODE_LABELS[mode], {
          fontFamily: 'monospace',
          fontSize: '24px',
          fontStyle: 'bold',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (this.confirmingQuit) return;
        this.mode = mode;
        this.refreshModeButtons();
      });
      this.modeButtons[mode] = { bg, text };
    });

    // One leaderboard panel per mode now ("separately tracked," decided)
    // - only the one matching `this.mode` is ever visible
    // (refreshModeButtons). "Top 3 box aligned with single player box,"
    // decided, generalized to every mode: each panel shares its own mode
    // button's width and center-x (modeCenterX, captured in the loop
    // above) rather than being independently centered on the screen.
    const leaderboardTop = y + height / 2 + 20;
    MODE_ORDER.forEach((mode) => {
      this.leaderboardPanels[mode] = this.createLeaderboardPanel(mode, modeCenterX[mode]!, leaderboardTop, width);
    });

    this.refreshModeButtons();
  }

  private createLeaderboardPanel(mode: GameMode, centerX: number, top: number, width: number): LeaderboardPanel {
    const height = 100;
    const border = this.add
      .rectangle(centerX, top + height / 2, width, height, 0x0d0d16, 1)
      .setStrokeStyle(2, 0x3a3a4a, 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (!this.confirmingQuit) this.openHighScores(mode);
      });
    const title = this.add
      .text(centerX, top + 8, 'TOP 3', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#9a9ab0',
      })
      .setOrigin(0.5, 0);
    const text = this.add
      .text(centerX, top + 26, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#c9c9d6',
        align: 'center',
        lineSpacing: 2,
      })
      .setOrigin(0.5, 0);
    const hint = this.add
      .text(centerX, top + 84, 'CLICK FOR FULL LEADERBOARD', {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: toCssHex(COLORS.players[0]),
      })
      .setOrigin(0.5, 0);
    return { border, title, text, hint };
  }

  private openHighScores(mode: GameMode): void {
    this.scene.start('HighScores', { mode, entries: this.leaderboardCaches[mode] });
  }

  private refreshModeButtons(): void {
    const accent = COLORS.players[0];
    const accentCss = toCssHex(accent);
    (Object.keys(this.modeButtons) as GameMode[]).forEach((mode) => {
      const selected = mode === this.mode;
      const { bg, text } = this.modeButtons[mode]!;
      bg.setStrokeStyle(2, selected ? accent : 0x3a3a4a, 1);
      text.setColor(selected ? accentCss : '#ffffff');
      text.setAlpha(selected ? 1 : 0.7);
    });

    MODE_ORDER.forEach((mode) => {
      const visible = mode === this.mode;
      const panel = this.leaderboardPanels[mode]!;
      panel.border.setVisible(visible);
      panel.title.setVisible(visible);
      panel.text.setVisible(visible);
      panel.hint.setVisible(visible);
      panel.border.disableInteractive();
      if (visible) panel.border.setInteractive({ useHandCursor: true });
    });

    this.refreshLeaderboardDisplay(this.mode); // last-known snapshot immediately, even if stale
    void this.loadLeaderboard(this.mode); // then fetch fresh and redisplay once it resolves
    // Card lock state (see refreshCardStatus) is driven by this.mode too,
    // but doesn't need refreshing here - update() already calls
    // refreshCardStatus() every frame, and cards don't exist yet the
    // first time this runs (createModeToggle() happens before
    // createPlayerCards() in create()).
  }

  private async loadLeaderboard(mode: GameMode): Promise<void> {
    this.leaderboardCaches[mode] = await fetchLeaderboard(mode);
    // The player may have switched to a different mode while this was in
    // flight - don't bother updating a now-hidden panel.
    if (this.mode === mode) this.refreshLeaderboardDisplay(mode);
  }

  /** Renders that mode's cached top 3 (decided) as a single centered column - an empty cache (genuinely no scores yet, *or* the fetch failed and degraded to empty per `HighScoreApi.ts`'s contract) reads the same either way: a calm "no scores yet," not an alarming error. The panel stays clickable either way - HighScoreScene shows the same "no scores yet" state on its own, not a dead end. */
  private refreshLeaderboardDisplay(mode: GameMode): void {
    const panelText = this.leaderboardPanels[mode]!.text;
    const cache = this.leaderboardCaches[mode];
    if (cache.length === 0) {
      panelText.setText('NO SCORES YET');
      return;
    }

    panelText.setText(cache.slice(0, 3).map((entry, i) => `${i + 1}. ${entry.initials} ${entry.score}`).join('\n'));
  }

  private createPlayerCards(): void {
    const totalWidth = CARD_COUNT * CARD_WIDTH + (CARD_COUNT - 1) * CARD_GAP;
    const left = (ARENA_WIDTH - totalWidth) / 2;

    for (let slot = 0; slot < CARD_COUNT; slot += 1) {
      const cardLeft = left + slot * (CARD_WIDTH + CARD_GAP);
      const centerX = cardLeft + CARD_WIDTH / 2;
      const color = COLORS.players[slot]!;
      const cssColor = toCssHex(color);

      const border = this.add
        .rectangle(centerX, CARDS_TOP + CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 0x0d0d16, 1)
        .setStrokeStyle(3, color, 1);
      this.cardBorders.push(border);

      this.add
        .text(centerX, CARDS_TOP + 32, `P${slot + 1}`, {
          fontFamily: 'monospace',
          fontSize: '36px',
          fontStyle: 'bold',
          color: cssColor,
        })
        .setOrigin(0.5);

      const hullId = this.hulls[slot] ?? 'interceptor';
      this.cardShipIcons.push(this.drawShipIcon(centerX, CARDS_TOP + 104, color, hullId));
      this.cardIconHulls.push(hullId);

      const statusText = this.add
        .text(centerX, CARDS_TOP + 168, '', {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: '#ffffff',
          align: 'center',
        })
        .setOrigin(0.5);
      this.cardStatusTexts.push(statusText);

      // Hull picker - every slot, since hulls apply in all three modes.
      // Click cycles; the label and blurb are refreshed in
      // refreshCardStatus() along with everything else on the card.
      const hullText = this.add
        .text(centerX, CARDS_TOP + 214, '', {
          fontFamily: 'monospace',
          fontSize: '22px',
          fontStyle: 'bold',
          color: cssColor,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          if (this.confirmingQuit || (this.mode === 'singlePlayer' && slot > 0)) return;
          const current = HULL_IDS.indexOf(this.hulls[slot] ?? 'interceptor');
          this.hulls[slot] = HULL_IDS[(current + 1) % HULL_IDS.length]!;
        });
      this.cardHullTexts.push(hullText);

      const hullBlurb = this.add
        .text(centerX, CARDS_TOP + 240, '', {
          fontFamily: 'monospace',
          fontSize: '15px',
          color: '#6a6a80',
        })
        .setOrigin(0.5);
      this.cardHullBlurbs.push(hullBlurb);

      if (slot < 2) {
        const toggle = this.add
          .text(centerX, CARDS_TOP + 268, '[change]', {
            fontFamily: 'monospace',
            fontSize: '22px',
            color: '#6a6a80',
          })
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            // Single Player locks every slot but P1 (decided) - P2's
            // source choice is moot there, so its toggle is inert rather
            // than silently mutating a setting that won't be used.
            if (this.confirmingQuit || (this.mode === 'singlePlayer' && slot > 0)) return;
            this.sources[slot] = this.sources[slot] === 'keyboard' ? 'gamepad' : 'keyboard';
          });
        this.cardToggleTexts.push(toggle);
      }
    }

    this.refreshCardStatus();
  }

  /**
   * The card's ship icon, drawn as whichever hull that slot has picked
   * so the card actually previews what you'll fly. Returns the
   * Graphics so it can be redrawn when the choice changes - it used to
   * draw the one fixed silhouette once and never again.
   */
  private drawShipIcon(x: number, y: number, color: number, hullId: HullId): Phaser.GameObjects.Graphics {
    const g = this.add.graphics({ x, y });
    this.redrawShipIcon(g, color, hullId);
    return g;
  }

  private redrawShipIcon(g: Phaser.GameObjects.Graphics, color: number, hullId: HullId): void {
    const hull = HULLS[hullId];
    // Scale each hull to a common extent rather than to a shared
    // constant. The hulls are normalized differently - the Interceptor
    // is long and narrow (reaching 1.0 at the nose), the Gunship and
    // Rescue are stubby (0.80 and 0.66) - so one fixed scale drew the
    // latter two as unreadable blobs next to it. 26px of half-extent
    // fits the card's icon band either way.
    const extent = Math.max(...hull.path.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]));
    const scale = 30 / extent;
    g.clear();
    g.lineStyle(3, color, 1);
    g.fillStyle(0x0d0d16, 1);
    g.beginPath();
    hull.path.forEach(([hx, hy], i) => {
      const px = hx * scale;
      const py = hy * scale;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    });
    g.closePath();
    g.fillPath();
    g.strokePath();

    // A touch of the hull's own surface detail, so the card reads as
    // the same ship the round will actually spawn.
    // Canopy only - the hulls' panel lines and muzzle-bore rings are
    // barely a pixel across at this size and read as dirt on the icon.
    const [cx, cy, cw, ch] = hull.detail.canopy;
    g.fillStyle(color, 0.22);
    g.lineStyle(1, color, 0.55);
    g.fillEllipse(cx * scale, cy * scale, cw * scale, ch * scale);
    g.strokeEllipse(cx * scale, cy * scale, cw * scale, ch * scale);
  }

  private refreshCardStatus(): void {
    const connected = filterStandardGamepads(this.input.gamepad?.getAll() ?? []).length;
    const ready = computeGamepadReadiness(this.sources, connected);
    const singlePlayerLocked = this.mode === 'singlePlayer';

    for (let slot = 0; slot < CARD_COUNT; slot += 1) {
      const source = this.sources[slot]!;
      const isReady = ready[slot]!;
      const text = this.cardStatusTexts[slot]!;
      const border = this.cardBorders[slot]!;

      // Single Player is locked to P1 only (decided) - every other card
      // reads as locked out regardless of its own source/readiness, since
      // GameScene.buildPlayers() won't spawn a ship for it in this mode.
      const hullId = this.hulls[slot] ?? 'interceptor';
      const hull = HULLS[hullId];
      if (this.cardIconHulls[slot] !== hullId) {
        const icon = this.cardShipIcons[slot];
        if (icon) this.redrawShipIcon(icon, COLORS.players[slot]!, hullId);
        this.cardIconHulls[slot] = hullId;
      }
      this.cardHullTexts[slot]?.setText(`< ${hull.label} >`);
      this.cardHullBlurbs[slot]?.setText(hull.blurb);

      if (singlePlayerLocked && slot > 0) {
        text.setText('LOCKED\nSINGLE PLAYER');
        text.setColor('#5a5a6e');
        border.setAlpha(0.25);
        this.cardHullTexts[slot]?.setAlpha(0.25);
        this.cardHullBlurbs[slot]?.setAlpha(0.25);
        continue;
      }
      this.cardHullTexts[slot]?.setAlpha(1);
      this.cardHullBlurbs[slot]?.setAlpha(1);

      if (source === 'keyboard') {
        text.setText('KEYBOARD\nREADY');
        text.setColor('#8aff4d');
      } else if (isReady) {
        text.setText('GAMEPAD\nREADY');
        text.setColor('#8aff4d');
      } else {
        text.setText('GAMEPAD\nWAITING...');
        text.setColor('#9a9ab0');
      }

      border.setAlpha(isReady ? 1 : 0.4);
    }

    // P2's [change] toggle (index 1) is inert while Single Player is
    // selected (see the guard in createPlayerCards()) - dim it to match,
    // same treatment as the locked cards above. P1's (index 0) is always
    // live, since P1 always plays.
    const p2Toggle = this.cardToggleTexts[1];
    p2Toggle?.setAlpha(singlePlayerLocked ? 0.35 : 1);
  }

  private createVolumeSliders(): void {
    const y = CARDS_TOP + CARD_HEIGHT + 80;
    this.createVolumeSlider(ARENA_WIDTH / 2 - 300, y, 'MUSIC', getMusicVolume(), setMusicVolume, (value) => {
      setVolume(this, MENU_MUSIC_KEY, value);
    });
    this.createVolumeSlider(ARENA_WIDTH / 2 + 300, y, 'SFX', getSfxVolume(), setSfxVolume, () => {
      // No SFX loop playing on this screen to update live - GameScene
      // reads getSfxVolume() fresh on every shot/hit, nothing to push to.
    });
  }

  /** A real draggable slider - clicking/dragging the rail or its handle updates the value live, not the previous inert visual. */
  private createVolumeSlider(
    x: number,
    y: number,
    label: string,
    initialValue: number,
    persist: (value: number) => void,
    onLiveChange: (value: number) => void,
  ): void {
    const railWidth = 280;
    const railHeight = 8;
    const railLeft = x - railWidth / 2;
    const railRight = x + railWidth / 2;

    this.add
      .text(x, y, label, { fontFamily: 'monospace', fontSize: '20px', color: '#9a9ab0' })
      .setOrigin(0.5);

    this.add.rectangle(x, y + 40, railWidth, railHeight, 0x2a2a38);
    const fill = this.add
      .rectangle(railLeft, y + 40, railWidth * initialValue, railHeight, COLORS.players[0])
      .setOrigin(0, 0.5);
    const handle = this.add
      .circle(railLeft + railWidth * initialValue, y + 40, 14, 0xffffff)
      .setInteractive({ draggable: true, useHandCursor: true });
    this.input.setDraggable(handle);

    const valueText = this.add
      .text(x, y + 72, `${Math.round(initialValue * 100)}%`, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const applyFromX = (rawX: number): void => {
      const clampedX = Phaser.Math.Clamp(rawX, railLeft, railRight);
      handle.x = clampedX;
      const value = (clampedX - railLeft) / railWidth;
      fill.width = railWidth * value;
      valueText.setText(`${Math.round(value * 100)}%`);
      persist(value);
      onLiveChange(value);
    };

    handle.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number) => applyFromX(dragX));

    this.add
      .rectangle(x, y + 40, railWidth, railHeight + 24, 0x000000, 0)
      .setInteractive()
      .on('pointerdown', (pointer: Phaser.Input.Pointer) => applyFromX(pointer.x));
  }

  private createStartButton(): void {
    const x = ARENA_WIDTH / 2;
    const y = ARENA_HEIGHT - 100;
    const accent = COLORS.players[3];
    const bg = this.add.rectangle(x, y, 320, 90, 0x14141c, 1).setStrokeStyle(3, accent, 1);
    this.add
      .text(x, y, 'START', {
        fontFamily: 'monospace',
        fontSize: '48px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (!this.confirmingQuit) this.startGame();
    });
  }

  private startGame(): void {
    this.scene.start('Game', { mode: this.mode, sources: this.sources, hulls: this.hulls });
  }

  /**
   * "QUIT GAME?" / YES / NO, matching HyperOut's `quitMenu` panel exactly
   * (see hyperout/index.html) - shown as an opaque full-screen backdrop
   * (interactive, so it also blocks clicks reaching the menu underneath)
   * rather than actually hiding/showing the menu's own game objects,
   * since those aren't grouped under one container to toggle as a unit.
   */
  private showQuitConfirm(): void {
    this.confirmingQuit = true;
    const backdrop = this.add
      .rectangle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, ARENA_WIDTH, ARENA_HEIGHT, 0x05050a, 0.92)
      .setInteractive();
    const title = this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 90, 'QUIT GAME?', {
        fontFamily: 'monospace',
        fontSize: '48px',
        fontStyle: 'bold',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    const yes = this.makeButton(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, 'YES', () => {
      // Same caveat as HyperOut's quitToPortal(): only resolves correctly
      // once deployed behind the shared portal at "/" (see root
      // DEPLOYMENT.md) - in a bare local dev server there's no portal at
      // "/" to land on.
      window.location.href = '/';
    });
    const no = this.makeButton(ARENA_WIDTH / 2, ARENA_HEIGHT / 2 + 90, 'NO', () => this.hideQuitConfirm());
    this.quitConfirmObjects = [backdrop, title, yes.bg, yes.text, no.bg, no.text];
  }

  private hideQuitConfirm(): void {
    this.confirmingQuit = false;
    this.quitConfirmObjects.forEach((object) => object.destroy());
    this.quitConfirmObjects = [];
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void): ModeButton {
    const bg = this.add.rectangle(x, y, 220, 70, 0x14141c, 1).setStrokeStyle(2, COLORS.players[0], 1);
    const text = this.add
      .text(x, y, label, { fontFamily: 'monospace', fontSize: '26px', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
    return { bg, text };
  }
}
