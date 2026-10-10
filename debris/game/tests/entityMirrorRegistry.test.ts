import { describe, expect, it, vi } from 'vitest';
import { EntityMirrorRegistry } from '../src/systems/EntityMirrorRegistry';
import type { EntitySnapshot } from '../src/systems/NetworkSnapshotProtocol';

// The registry never touches `scene` itself - only hands it to whatever
// factory a call site registers - so a fake scene and fake mirrors are
// enough to exercise it without any real Phaser dependency.
const FAKE_SCENE = {} as never;

function entity(type: string, id: number, overrides: Partial<EntitySnapshot> = {}): EntitySnapshot {
  return { id, type, x: 0, y: 0, rotation: 0, data: {}, ...overrides };
}

describe('EntityMirrorRegistry', () => {
  it('creates one mirror per new (type, id) and applies the snapshot to it', () => {
    const registry = new EntityMirrorRegistry();
    const applySnapshot = vi.fn();
    const factory = vi.fn(() => ({ applySnapshot, destroy: vi.fn() }));
    registry.registerFactory('asteroid', factory);

    const rock = entity('asteroid', 1);
    registry.reconcile(FAKE_SCENE, [rock]);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(applySnapshot).toHaveBeenCalledWith(rock);
  });

  it('reuses the existing mirror on later frames instead of creating a new one', () => {
    const registry = new EntityMirrorRegistry();
    const factory = vi.fn(() => ({ applySnapshot: vi.fn(), destroy: vi.fn() }));
    registry.registerFactory('asteroid', factory);

    registry.reconcile(FAKE_SCENE, [entity('asteroid', 1)]);
    registry.reconcile(FAKE_SCENE, [entity('asteroid', 1, { x: 5 })]);

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('destroys a mirror once its entity drops out of the snapshot', () => {
    const registry = new EntityMirrorRegistry();
    const destroy = vi.fn();
    registry.registerFactory('asteroid', () => ({ applySnapshot: vi.fn(), destroy }));

    registry.reconcile(FAKE_SCENE, [entity('asteroid', 1)]);
    registry.reconcile(FAKE_SCENE, []);

    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('skips entities whose type has no registered factory', () => {
    const registry = new EntityMirrorRegistry();
    expect(() => registry.reconcile(FAKE_SCENE, [entity('unknown-type', 1)])).not.toThrow();
  });

  it('clear() destroys every live mirror', () => {
    const registry = new EntityMirrorRegistry();
    const destroyA = vi.fn();
    const destroyB = vi.fn();
    registry.registerFactory('asteroid', () => ({ applySnapshot: vi.fn(), destroy: destroyA }));
    registry.registerFactory('projectile', () => ({ applySnapshot: vi.fn(), destroy: destroyB }));

    registry.reconcile(FAKE_SCENE, [entity('asteroid', 1), entity('projectile', 2)]);
    registry.clear();

    expect(destroyA).toHaveBeenCalledTimes(1);
    expect(destroyB).toHaveBeenCalledTimes(1);
  });
});
