import Phaser from 'phaser';
import type { Cell } from '../ai/Pathfinding';
import { BOSS, BOSS_SPRITE } from '../config/GameConfig';
import { canFire } from '../systems/CombatSystem';
import type { Vector2 } from '../utilities/Vector2';
import { bossAnimKey, bossFrameKey, BOSS_TEXTURE_KEY, ensureBossAnimations } from './BossAnimations';
import { Enemy } from './Enemy';

/**
 * The single v1 boss (roadmap item 6). Inherits Enemy's maze-aware chase
 * movement, and now its generic hitsRemaining/takeHit too - a boss is
 * still "a chaser," just bigger, tankier, and additionally able to fire
 * ranged projectiles at the player instead of only damaging on touch.
 *
 * Renders real sprite art (see BossFrames.ts/BossAnimations.ts) via
 * Enemy's optional `visual` constructor param, instead of the flat
 * primitive circle every other enemy still uses - the old gold stroke
 * ring is gone, the art itself is the "this is the boss" marker now.
 * `bossSprite` is a locally-typed alias of the inherited `sprite` field
 * (which Enemy declares as `Arc | Sprite` to cover both cases) so this
 * class can call Sprite-only methods like `.play()` without a cast at
 * every call site.
 *
 * maxHits/attackCooldownMs are constructor params (default to BOSS.*) so
 * FloorDifficulty.ts can scale the boss up on deeper floors without this
 * class needing to know anything about floors.
 *
 * Phase two kicks in past BOSS.phaseTwoHpFraction of its (per-instance,
 * floor-scaled) max HP: canAttack() applies phaseTwoCooldownMultiplier on
 * top of whatever attackCooldownMs already is, so it composes with
 * FloorDifficulty's own scaling regardless of floor depth. The actual
 * spread-shot part of phase two lives in GameScene.updateBossAttack (this
 * class only tracks state, same as it did for the single-shot cooldown
 * before) - isPhaseTwo is what GameScene reads to decide shot count. The
 * sheet has no separate "enraged" art, so both phases share the same walk/
 * attack animations - only the mechanics (cooldown, shot count) change.
 */
export class Boss extends Enemy {
  private readonly bossSprite: Phaser.GameObjects.Sprite;
  private readonly attackCooldownMs: number;
  private lastAttackAtMs = -Infinity;
  private phaseTwo = false;

  constructor(
    scene: Phaser.Scene,
    spawnCell: Cell,
    spawnPixel: Vector2,
    maxHits: number = BOSS.maxHits,
    attackCooldownMs: number = BOSS.attackCooldownMs,
  ) {
    ensureBossAnimations(scene);
    super(scene, spawnCell, spawnPixel, BOSS.radius, undefined, BOSS.speed, maxHits, {
      textureKey: BOSS_TEXTURE_KEY,
      frameKey: bossFrameKey('walk', 0),
      scale: BOSS_SPRITE.scale,
    });
    this.bossSprite = this.sprite as Phaser.GameObjects.Sprite;
    this.attackCooldownMs = attackCooldownMs;
    this.bossSprite.play(bossAnimKey('walk'));
  }

  get isPhaseTwo(): boolean {
    return this.phaseTwo;
  }

  override takeHit(): void {
    super.takeHit();
    if (
      !this.phaseTwo &&
      this.hitsRemaining > 0 &&
      this.hitsRemaining <= this.maxHits * BOSS.phaseTwoHpFraction
    ) {
      this.phaseTwo = true;
    }
  }

  canAttack(nowMs: number): boolean {
    const cooldownMs = this.phaseTwo
      ? this.attackCooldownMs * BOSS.phaseTwoCooldownMultiplier
      : this.attackCooldownMs;
    return canFire(this.lastAttackAtMs, nowMs, cooldownMs);
  }

  recordAttack(nowMs: number): void {
    this.lastAttackAtMs = nowMs;
  }

  /** Plays the attack animation once, then returns to the walk loop -
   * called from GameScene right after it actually fires the projectile. */
  playAttack(): void {
    this.bossSprite.play(bossAnimKey('attack'));
    this.bossSprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      if (this.isAlive) this.bossSprite.play(bossAnimKey('walk'));
    });
  }

  /** Marks itself dead immediately (so GameScene's "boss defeated" checks
   * react on the same frame) but plays the die animation before actually
   * removing the GameObjects, instead of the base class's instant destroy. */
  override destroy(): void {
    if (!this.isAlive) return;
    this.alive = false;
    this.bossSprite.play(bossAnimKey('die'));
    this.bossSprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.destroyVisuals();
    });
  }
}
