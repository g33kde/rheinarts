import Phaser from 'phaser';

const TEXT_STYLE = {
  fontFamily: 'monospace',
  fontSize: '16px',
  color: '#ffffff',
} as const;

export class HUD {
  private readonly livesText: Phaser.GameObjects.Text;
  private readonly enemiesText: Phaser.GameObjects.Text;
  private readonly bossText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.livesText = scene.add.text(12, 8, '', TEXT_STYLE);
    this.enemiesText = scene.add.text(12, 28, '', TEXT_STYLE);
    this.bossText = scene.add.text(12, 48, '', TEXT_STYLE);
  }

  update(lives: number, enemiesRemaining: number, bossHitsRemaining: number | null): void {
    this.livesText.setText(`Lives: ${lives}`);
    this.enemiesText.setText(`Enemies: ${enemiesRemaining}`);
    this.bossText.setText(bossHitsRemaining === null ? '' : `Guardian: ${bossHitsRemaining}`);
  }
}
