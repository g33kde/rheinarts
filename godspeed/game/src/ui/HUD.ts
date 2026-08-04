import Phaser from 'phaser';

const TEXT_STYLE = {
  fontFamily: 'monospace',
  fontSize: '16px',
  color: '#ffffff',
} as const;

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
  private readonly enemiesText: Phaser.GameObjects.Text;
  private readonly bossText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.floorText = scene.add.text(12, 8, '', TEXT_STYLE);
    this.livesText = scene.add.text(12, 28, '', TEXT_STYLE);
    this.enemiesText = scene.add.text(12, 48, '', TEXT_STYLE);
    this.bossText = scene.add.text(12, 68, '', TEXT_STYLE);
  }

  update(state: HudState): void {
    this.floorText.setText(`Floor: ${state.floor}`);
    this.livesText.setText(
      state.shieldCharges > 0
        ? `Lives: ${state.lives}  Shield: ${state.shieldCharges}`
        : `Lives: ${state.lives}`,
    );
    this.enemiesText.setText(`Enemies: ${state.enemiesRemaining}`);
    this.bossText.setText(
      state.bossHitsRemaining === null ? '' : `Guardian: ${state.bossHitsRemaining}`,
    );
  }
}
