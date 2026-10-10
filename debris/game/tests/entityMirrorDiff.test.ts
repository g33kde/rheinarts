import { describe, expect, it } from 'vitest';
import { diffEntityMirrors, entityMirrorKey } from '../src/systems/EntityMirrorDiff';

describe('entityMirrorKey', () => {
  it('combines type and id so different types never collide on the same numeric id', () => {
    expect(entityMirrorKey('asteroid', 1)).not.toBe(entityMirrorKey('projectile', 1));
  });
});

describe('diffEntityMirrors', () => {
  it('reports nothing removed when every previous key is still present', () => {
    const previous = new Set([entityMirrorKey('asteroid', 1), entityMirrorKey('asteroid', 2)]);
    const diff = diffEntityMirrors(previous, [
      { type: 'asteroid', id: 1 },
      { type: 'asteroid', id: 2 },
    ]);
    expect(diff.removedKeys).toEqual([]);
    expect(diff.currentKeys).toEqual(previous);
  });

  it('reports a key as removed once its entity no longer appears in the snapshot', () => {
    const previous = new Set([entityMirrorKey('asteroid', 1), entityMirrorKey('asteroid', 2)]);
    const diff = diffEntityMirrors(previous, [{ type: 'asteroid', id: 1 }]);
    expect(diff.removedKeys).toEqual([entityMirrorKey('asteroid', 2)]);
  });

  it('treats the same numeric id on different types as unrelated keys', () => {
    const previous = new Set([entityMirrorKey('asteroid', 1)]);
    const diff = diffEntityMirrors(previous, [{ type: 'projectile', id: 1 }]);
    expect(diff.removedKeys).toEqual([entityMirrorKey('asteroid', 1)]);
    expect(diff.currentKeys).toEqual(new Set([entityMirrorKey('projectile', 1)]));
  });

  it('adds every new entity key into currentKeys even when nothing was previously tracked', () => {
    const diff = diffEntityMirrors(new Set(), [{ type: 'asteroid', id: 5 }]);
    expect(diff.currentKeys).toEqual(new Set([entityMirrorKey('asteroid', 5)]));
    expect(diff.removedKeys).toEqual([]);
  });
});
