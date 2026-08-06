import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH, COLORS } from '../config/GameConfig';

/**
 * Diablo-3-style bottom bar: a fixed panel with 5 icon+value slots (Floor,
 * Lives, Shield, Enemies, Guardian). Icons are drawn once as vector shapes
 * (no art assets) and never redrawn - only their values (Text) and the
 * conditional slots' visibility (Shield/Guardian, hidden when not
 * applicable) change per frame, same pattern the old top-left text HUD used.
 */

const TEXT_STYLE = {
  fontFamily: 'monospace',
  fontSize: '16px',
} as const;

const NEUTRAL_ICON = 0xd8d8e0;
const PANEL_ALPHA = 0.92; // near-solid so the skull icon's "cutout" eyes match what's behind them

const BAR_WIDTH = 620;
const BAR_HEIGHT = 48;
const BAR_X = (ARENA_WIDTH - BAR_WIDTH) / 2;
const BAR_Y = ARENA_HEIGHT - BAR_HEIGHT - 12;
const SLOT_COUNT = 5;
const SLOT_WIDTH = BAR_WIDTH / SLOT_COUNT;
const ICON_SIZE = 20;
const ICON_OFFSET_X = 24; // icon center, relative to slot center
const TEXT_OFFSET_X = 18; // text left edge, relative to icon center

export interface HudState {
  floor: number;
  lives: number;
  shieldCharges: number;
  enemiesRemaining: number;
  bossHitsRemaining: number | null;
}

export class HUD {
  private readonly floorText: Phaser.GameObjects.Text;
  private readonly livesText: Phaser.GameObjects.Text;
  private readonly shieldIcon: Phaser.GameObjects.Graphics;
  private readonly shieldText: Phaser.GameObjects.Text;
  private readonly enemiesText: Phaser.GameObjects.Text;
  private readonly bossIcon: Phaser.GameObjects.Graphics;
  private readonly bossText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.drawPanel(scene);

    const centerY = BAR_Y + BAR_HEIGHT / 2;
    const slotCenterX = (index: number) => BAR_X + SLOT_WIDTH * index + SLOT_WIDTH / 2;
    const colorOf = (color: number) => Phaser.Display.Color.IntegerToColor(color).rgba;

    const floorIconX = slotCenterX(0) - ICON_OFFSET_X;
    drawFloorIcon(scene.add.graphics(), floorIconX, centerY, ICON_SIZE, NEUTRAL_ICON);
    this.floorText = scene.add
      .text(floorIconX + TEXT_OFFSET_X, centerY, '', { ...TEXT_STYLE, color: '#ffffff' })
      .setOrigin(0, 0.5);

    const livesIconX = slotCenterX(1) - ICON_OFFSET_X;
    drawHeart(scene.add.graphics(), livesIconX, centerY, ICON_SIZE, COLORS.danger);
    this.livesText = scene.add
      .text(livesIconX + TEXT_OFFSET_X, centerY, '', {
        ...TEXT_STYLE,
        color: colorOf(COLORS.danger),
      })
      .setOrigin(0, 0.5);

    const shieldIconX = slotCenterX(2) - ICON_OFFSET_X;
    this.shieldIcon = scene.add.graphics();
    drawShield(this.shieldIcon, shieldIconX, centerY, ICON_SIZE, COLORS.pickupShield);
    this.shieldText = scene.add
      .text(shieldIconX + TEXT_OFFSET_X, centerY, '', {
        ...TEXT_STYLE,
        color: colorOf(COLORS.pickupShield),
      })
      .setOrigin(0, 0.5);

    const enemiesIconX = slotCenterX(3) - ICON_OFFSET_X;
    drawSkull(scene.add.graphics(), enemiesIconX, centerY, ICON_SIZE, NEUTRAL_ICON);
    this.enemiesText = scene.add
      .text(enemiesIconX + TEXT_OFFSET_X, centerY, '', { ...TEXT_STYLE, color: '#ffffff' })
      .setOrigin(0, 0.5);

    const bossIconX = slotCenterX(4) - ICON_OFFSET_X;
    this.bossIcon = scene.add.graphics();
    drawCrown(this.bossIcon, bossIconX, centerY, ICON_SIZE, COLORS.projectile);
    this.bossText = scene.add
      .text(bossIconX + TEXT_OFFSET_X, centerY, '', {
        ...TEXT_STYLE,
        color: colorOf(COLORS.projectile),
      })
      .setOrigin(0, 0.5);
  }

  update(state: HudState): void {
    this.floorText.setText(`${state.floor}`);
    this.livesText.setText(`${state.lives}`);

    const hasShield = state.shieldCharges > 0;
    this.shieldIcon.setVisible(hasShield);
    this.shieldText.setVisible(hasShield).setText(hasShield ? `${state.shieldCharges}` : '');

    this.enemiesText.setText(`${state.enemiesRemaining}`);

    const hasBoss = state.bossHitsRemaining !== null;
    this.bossIcon.setVisible(hasBoss);
    this.bossText.setVisible(hasBoss).setText(hasBoss ? `${state.bossHitsRemaining}` : '');
  }

  private drawPanel(scene: Phaser.Scene): void {
    const panel = scene.add.graphics();
    panel.fillStyle(COLORS.background, PANEL_ALPHA);
    panel.fillRect(BAR_X, BAR_Y, BAR_WIDTH, BAR_HEIGHT);
    panel.lineStyle(1, COLORS.player, 0.5);
    panel.strokeRect(BAR_X, BAR_Y, BAR_WIDTH, BAR_HEIGHT);
    for (let i = 1; i < SLOT_COUNT; i += 1) {
      const x = BAR_X + SLOT_WIDTH * i;
      panel.lineBetween(x, BAR_Y + 6, x, BAR_Y + BAR_HEIGHT - 6);
    }
  }
}

function drawHeart(
  gfx: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  size: number,
  color: number,
): void {
  const r = size * 0.28;
  gfx.fillStyle(color, 1);
  gfx.fillCircle(cx - r * 0.95, cy - r * 0.4, r);
  gfx.fillCircle(cx + r * 0.95, cy - r * 0.4, r);
  gfx.fillTriangle(cx - r * 1.9, cy - r * 0.1, cx + r * 1.9, cy - r * 0.1, cx, cy + r * 1.7);
}

function drawShield(
  gfx: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  size: number,
  color: number,
): void {
  const w = size * 0.32;
  const h = size * 0.4;
  gfx.fillStyle(color, 1);
  gfx.fillPoints(
    [
      { x: cx - w, y: cy - h },
      { x: cx + w, y: cy - h },
      { x: cx + w, y: cy + h * 0.3 },
      { x: cx, y: cy + h * 1.3 },
      { x: cx - w, y: cy + h * 0.3 },
    ],
    true,
  );
}

function drawSkull(
  gfx: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  size: number,
  color: number,
): void {
  gfx.fillStyle(color, 1);
  gfx.fillCircle(cx, cy, size * 0.4);
  gfx.fillStyle(COLORS.background, PANEL_ALPHA);
  gfx.fillCircle(cx - size * 0.15, cy - size * 0.05, size * 0.1);
  gfx.fillCircle(cx + size * 0.15, cy - size * 0.05, size * 0.1);
  gfx.fillRect(cx - size * 0.12, cy + size * 0.15, size * 0.24, size * 0.1);
}

function drawCrown(
  gfx: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  size: number,
  color: number,
): void {
  gfx.fillStyle(color, 1);
  gfx.fillPoints(
    [
      { x: cx - size * 0.4, y: cy + size * 0.25 },
      { x: cx - size * 0.4, y: cy - size * 0.05 },
      { x: cx - size * 0.2, y: cy + size * 0.1 },
      { x: cx, y: cy - size * 0.3 },
      { x: cx + size * 0.2, y: cy + size * 0.1 },
      { x: cx + size * 0.4, y: cy - size * 0.05 },
      { x: cx + size * 0.4, y: cy + size * 0.25 },
    ],
    true,
  );
}

function drawFloorIcon(
  gfx: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  size: number,
  color: number,
): void {
  gfx.fillStyle(color, 1);
  gfx.fillRect(cx - size * 0.08, cy - size * 0.4, size * 0.16, size * 0.35);
  gfx.fillTriangle(
    cx - size * 0.3,
    cy - size * 0.05,
    cx + size * 0.3,
    cy - size * 0.05,
    cx,
    cy + size * 0.4,
  );
}
