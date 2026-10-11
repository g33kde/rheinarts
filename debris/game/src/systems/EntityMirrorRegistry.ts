import type Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../config/GameConfig';
import { diffEntityMirrors, entityMirrorKey } from './EntityMirrorDiff';
import type { EntitySnapshot } from './NetworkSnapshotProtocol';
import { smoothedPosition } from './PositionSmoothing';

/**
 * One client-side visual standing in for a host-side entity it has no
 * physics body for at all (docs/roadmap.md's "Windows + LAN
 * multiplayer," Sprint 8). `applySnapshot` is called every frame the
 * entity is still present in the latest snapshot; `destroy` is called
 * exactly once, whenever it stops being present (consumed, expired, or
 * out of range) - never called twice, never skipped.
 */
export interface EntityMirror {
  applySnapshot(entity: EntitySnapshot): void;
  destroy(): void;
}

export type EntityMirrorFactory = (scene: Phaser.Scene, entity: EntitySnapshot) => EntityMirror;

/**
 * Generic client-side registry: a `type` string registers how to draw
 * that kind of entity once, and every later sprint (asteroids,
 * projectiles, UFOs, hazards, bosses, ...) just plugs a new factory in
 * rather than inventing its own create/update/destroy-by-id plumbing.
 * The host never needs to know this exists - it only ever produces
 * `EntitySnapshot`s; reconciling them into actual visuals is entirely
 * the client's concern.
 *
 * An entity whose `type` has no registered factory is silently skipped,
 * not an error - lets the host start including a new entity type in its
 * snapshots before the client has a matching visual ready for it.
 */
export class EntityMirrorRegistry {
  private readonly factories = new Map<string, EntityMirrorFactory>();
  private readonly mirrors = new Map<string, EntityMirror>();
  /** Last smoothed (not raw snapshot) position per mirror key (docs/roadmap.md's "Windows + LAN multiplayer," Sprint 15) - every entity type gets position smoothing for free here, with no changes to any individual factory's own `applySnapshot`. */
  private readonly smoothedPositions = new Map<string, { x: number; y: number }>();

  registerFactory(type: string, factory: EntityMirrorFactory): void {
    this.factories.set(type, factory);
  }

  /** Named `reconcile`, not `apply` - `Function.prototype.apply`'s shape (`thisArg`, args) is close enough that ESLint's `prefer-spread` rule flags call sites of a same-named method as if they were calling the built-in. */
  reconcile(scene: Phaser.Scene, entities: readonly EntitySnapshot[]): void {
    const { removedKeys } = diffEntityMirrors(new Set(this.mirrors.keys()), entities);
    removedKeys.forEach((key) => {
      this.mirrors.get(key)?.destroy();
      this.mirrors.delete(key);
      this.smoothedPositions.delete(key);
    });

    entities.forEach((entity) => {
      const key = entityMirrorKey(entity.type, entity.id);
      let mirror = this.mirrors.get(key);
      if (!mirror) {
        const factory = this.factories.get(entity.type);
        if (!factory) return;
        mirror = factory(scene, entity);
        this.mirrors.set(key, mirror);
        // A brand-new mirror has no "current" position to smooth from -
        // start it exactly where the entity already is, same reasoning
        // `Ship.applyNetworkSnapshot` snaps on its own just-became-visible
        // case, rather than gliding in from the arena's (0, 0) corner.
        this.smoothedPositions.set(key, { x: entity.x, y: entity.y });
      }

      const previous = this.smoothedPositions.get(key) ?? { x: entity.x, y: entity.y };
      const smoothed = smoothedPosition(previous, { x: entity.x, y: entity.y }, ARENA_WIDTH, ARENA_HEIGHT);
      this.smoothedPositions.set(key, smoothed);
      mirror.applySnapshot({ ...entity, x: smoothed.x, y: smoothed.y });
    });
  }

  /** Destroys every live mirror - called once, when the client session itself ends (`GameScene.handleHostDisconnected`/scene shutdown), not per-frame. */
  clear(): void {
    this.mirrors.forEach((mirror) => mirror.destroy());
    this.mirrors.clear();
    this.smoothedPositions.clear();
  }
}
