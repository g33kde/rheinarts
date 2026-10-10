import type Phaser from 'phaser';
import { diffEntityMirrors, entityMirrorKey } from './EntityMirrorDiff';
import type { EntitySnapshot } from './NetworkSnapshotProtocol';

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

  registerFactory(type: string, factory: EntityMirrorFactory): void {
    this.factories.set(type, factory);
  }

  /** Named `reconcile`, not `apply` - `Function.prototype.apply`'s shape (`thisArg`, args) is close enough that ESLint's `prefer-spread` rule flags call sites of a same-named method as if they were calling the built-in. */
  reconcile(scene: Phaser.Scene, entities: readonly EntitySnapshot[]): void {
    const { removedKeys } = diffEntityMirrors(new Set(this.mirrors.keys()), entities);
    removedKeys.forEach((key) => {
      this.mirrors.get(key)?.destroy();
      this.mirrors.delete(key);
    });

    entities.forEach((entity) => {
      const key = entityMirrorKey(entity.type, entity.id);
      let mirror = this.mirrors.get(key);
      if (!mirror) {
        const factory = this.factories.get(entity.type);
        if (!factory) return;
        mirror = factory(scene, entity);
        this.mirrors.set(key, mirror);
      }
      mirror.applySnapshot(entity);
    });
  }

  /** Destroys every live mirror - called once, when the client session itself ends (`GameScene.handleHostDisconnected`/scene shutdown), not per-frame. */
  clear(): void {
    this.mirrors.forEach((mirror) => mirror.destroy());
    this.mirrors.clear();
  }
}
