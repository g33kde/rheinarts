import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH, COLORS } from '../config/GameConfig';
import { fetchLeaderboard, type LeaderboardEntry } from '../systems/HighScoreApi';
import { GAME_MODE_LABELS, type GameMode } from '../systems/RoundOutcome';
import { toCssHex } from '../utilities/Color';

const ROW_COUNT = 10;
const LIST_TOP = 400;
const ROW_HEIGHT = 58;
// A click also returns to the menu (decided, on request) - but not
// immediately: this delays attaching that listener so the very click
// that opened this scene (MenuScene's leaderboard panel) can't also be
// the one that closes it. See waitForKeyPress()'s own doc comment.
const CLICK_GRACE_MS = 400;

/**
 * "Looks like the Highscore screen of an 80s arcade, but in the style
 * and colors of Debris," decided - a dedicated full-screen scene for
 * the complete top 10 of *one* of the three separately-tracked boards
 * (MenuScene's own per-mode panels each show only their own top 3,
 * click through into this one, for that same mode, for the rest).
 * Gets the same CRT/scanline overlay every other scene already gets for
 * free (docs/art_direction.md - it's a CSS layer over the whole canvas,
 * not something built per-scene).
 *
 * "Change the headlines of all 3 accordingly: game mode, and below keep
 * High Scores," decided - the big title is now the mode
 * (`GAME_MODE_LABELS[mode]`), "HIGH SCORES" moved to a smaller subtitle
 * beneath it, since three separate boards need to say which one you're
 * looking at.
 *
 * "Any key (or a click) for return to main menu," decided - see
 * waitForKeyPress() for why the click half is delayed rather than wired
 * up immediately like GameScene's own overlays do.
 */
export class HighScoreScene extends Phaser.Scene {
  // Not named `cache` - Phaser.Scene already has a built-in `cache`
  // property (its CacheManager) that this would otherwise collide with.
  private entries: LeaderboardEntry[] = [];
  private rowTexts: Phaser.GameObjects.Text[] = [];
  private mode: GameMode = 'singlePlayer';

  constructor() {
    super('HighScores');
  }

  /** MenuScene hands over which mode's panel was clicked, plus its own last-fetched leaderboard for that mode (possibly stale/empty) so this renders instantly instead of a blank flash - refreshed for real right after. */
  init(data: { mode?: GameMode; entries?: LeaderboardEntry[] }): void {
    this.mode = data?.mode ?? 'singlePlayer';
    this.entries = data?.entries ?? [];
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);
    this.rowTexts = [];

    this.createTitle();
    this.createRows();
    this.refreshRows();
    void this.loadLeaderboard();
    this.createReturnPrompt();
    this.waitForKeyPress(() => this.scene.start('Menu'));
  }

  private createTitle(): void {
    const glow = toCssHex(COLORS.players[0]);
    this.add
      .text(ARENA_WIDTH / 2, 110, GAME_MODE_LABELS[this.mode], {
        fontFamily: 'monospace',
        fontSize: '72px',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: glow,
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setShadow(0, 0, glow, 20, true, true);

    this.add
      .text(ARENA_WIDTH / 2, 190, 'H I G H   S C O R E S', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#9a9ab0',
      })
      .setOrigin(0.5);
  }

  private createRows(): void {
    for (let i = 0; i < ROW_COUNT; i += 1) {
      const text = this.add
        .text(ARENA_WIDTH / 2, LIST_TOP + i * ROW_HEIGHT, '', {
          fontFamily: 'monospace',
          fontStyle: 'bold',
          color: '#c9c9d6',
        })
        .setOrigin(0.5);
      this.rowTexts.push(text);
    }
  }

  private async loadLeaderboard(): Promise<void> {
    this.entries = await fetchLeaderboard(this.mode);
    this.refreshRows();
  }

  /** Rank 1 gets the arcade "top score" treatment - bigger, gold, GameConfig's own `fractureLauncher` gold, reused rather than a new color. Ranks 2-3 read slightly brighter than the rest, everything past that is the same neutral grey the menu's own panel already uses. */
  private refreshRows(): void {
    if (this.entries.length === 0) {
      this.rowTexts[0]?.setText('NO SCORES YET').setColor('#9a9ab0').setFontSize(28);
      for (let i = 1; i < ROW_COUNT; i += 1) this.rowTexts[i]?.setText('');
      return;
    }

    for (let i = 0; i < ROW_COUNT; i += 1) {
      const text = this.rowTexts[i]!;
      const entry = this.entries[i];
      if (!entry) {
        text.setText('');
        continue;
      }

      const rank = `${i + 1}`.padStart(2, '0');
      const initials = entry.initials.padEnd(4, ' ');
      const score = `${entry.score}`.padStart(7, ' ');
      text.setText(`${rank}.  ${initials}${score}`);

      if (i === 0) {
        text.setColor(toCssHex(COLORS.fractureLauncher)).setFontSize(46);
      } else if (i < 3) {
        text.setColor('#ffffff').setFontSize(34);
      } else {
        text.setColor('#c9c9d6').setFontSize(30);
      }
    }
  }

  private createReturnPrompt(): void {
    this.add
      .text(ARENA_WIDTH / 2, ARENA_HEIGHT - 70, 'PRESS ANY KEY OR CLICK TO RETURN', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#6a6a80',
      })
      .setOrigin(0.5);
  }

  /**
   * "Any key" now also accepts a click, decided - on request, after
   * deliberately leaving it keyboard/gamepad-only the first time this
   * scene was built (this scene is only ever *entered* by a click, so a
   * `pointerdown` listener risked the same click that opened it
   * immediately bouncing straight back to the menu). Still guarding
   * against exactly that: the click listener is attached only after a
   * short delay (`CLICK_GRACE_MS`), not immediately in `create()`, so
   * the opening click - already fully dispatched to MenuScene by the
   * time this scene even exists - has no listener here yet to catch.
   */
  private waitForKeyPress(callback: () => void): void {
    this.input.keyboard?.once('keydown', callback);
    this.input.gamepad?.once('down', callback);
    this.time.delayedCall(CLICK_GRACE_MS, () => this.input.once('pointerdown', callback));
  }
}
