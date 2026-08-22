import type Phaser from 'phaser';

/**
 * Shape shared by every Matter-physics-enabled GameObject in this game
 * (Graphics or Arc, plus whichever Matter component mixins each entity
 * actually calls) - `scene.matter.add.gameObject()` mixes these in at
 * runtime; this just gives TypeScript the same picture.
 */
export type MatterGameObject<T> = T &
  Phaser.Physics.Matter.Components.Transform &
  Phaser.Physics.Matter.Components.Velocity &
  Phaser.Physics.Matter.Components.Force;
