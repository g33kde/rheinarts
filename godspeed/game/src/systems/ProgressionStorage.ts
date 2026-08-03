/**
 * Permanent unlocks that persist between runs (docs/progression.md), as
 * opposed to systems/UpgradeSystem.ts's run-scoped pickups. The read/write
 * side effects are isolated to load/save; every other function here is a
 * pure transformation of a ProgressionState, so the unlock rules can be
 * tested without touching localStorage.
 */

export interface ProgressionState {
  readonly mazesCleared: number;
}

interface StorageReader {
  getItem(key: string): string | null;
}

interface StorageWriter {
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'godspeed:progression';

export function emptyProgression(): ProgressionState {
  return { mazesCleared: 0 };
}

export function loadProgression(storage: StorageReader): ProgressionState {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return emptyProgression();

  try {
    const parsed: unknown = JSON.parse(raw);
    const mazesCleared =
      typeof parsed === 'object' && parsed !== null && 'mazesCleared' in parsed
        ? Number((parsed as { mazesCleared: unknown }).mazesCleared)
        : 0;
    return { mazesCleared: Number.isFinite(mazesCleared) ? mazesCleared : 0 };
  } catch {
    return emptyProgression();
  }
}

export function saveProgression(state: ProgressionState, storage: StorageWriter): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function recordMazeCleared(state: ProgressionState): ProgressionState {
  return { mazesCleared: state.mazesCleared + 1 };
}

/** First-ever maze clear permanently grants one extra starting life. */
export function bonusStartingLives(state: ProgressionState): number {
  return state.mazesCleared >= 1 ? 1 : 0;
}
