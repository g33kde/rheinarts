/**
 * Pure bookkeeping for the generic entity-sync mechanism
 * (docs/roadmap.md's "Windows + LAN multiplayer," Sprint 8) - given the
 * set of (type, id) keys a client is currently mirroring and the list of
 * entities the latest snapshot actually contains, says which mirrors no
 * longer have a matching entity and should be destroyed. Creation/update
 * is just "does a mirror already exist for this key" at the call site
 * (`EntityMirrorRegistry.ts`) - the one thing worth pulling out as pure,
 * tested logic is this "what's gone" computation, same reasoning this
 * codebase's other protocol modules already follow.
 */

export function entityMirrorKey(type: string, id: number): string {
  return `${type}:${id}`;
}

export interface EntityMirrorDiff {
  readonly currentKeys: ReadonlySet<string>;
  readonly removedKeys: readonly string[];
}

export function diffEntityMirrors<T extends { type: string; id: number }>(
  previousKeys: ReadonlySet<string>,
  currentEntities: readonly T[],
): EntityMirrorDiff {
  const currentKeys = new Set(currentEntities.map((entity) => entityMirrorKey(entity.type, entity.id)));
  const removedKeys = [...previousKeys].filter((key) => !currentKeys.has(key));
  return { currentKeys, removedKeys };
}
