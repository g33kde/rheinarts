/**
 * Pure leaderboard rules - no file I/O, no HTTP - so "does this score
 * qualify," "where does it land," and "is this input even well-formed"
 * are all testable without a server or a filesystem. Same "pure rule
 * logic gets extracted and unit-tested" convention as Debris's own
 * `systems/CombatSystem.ts`/`systems/CommanderRescue.ts`.
 */

export interface LeaderboardEntry {
  readonly initials: string;
  readonly score: number;
}

/** The whole "top-10" of "top-10 leaderboard" - shared by qualifies()/insertEntry() and server.ts, so it's a single source of truth, not a magic number repeated in two files. */
export const MAX_ENTRIES = 10;

const INITIALS_LENGTH = 3;
const INITIALS_PATTERN = /^[A-Z]{3}$/;
const MAX_SANE_SCORE = 1_000_000; // a sanity bound, not a real gameplay cap - see server.ts's doc comment for the "no anti-cheat" note

/** Uppercase + trim - applied before validating or storing, so "abc" and "ABC" are the same input. */
export function normalizeInitials(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidInitials(value: string): boolean {
  return value.length === INITIALS_LENGTH && INITIALS_PATTERN.test(value);
}

/** Finite, non-negative, whole number, within a sane upper bound - not a re-derivation of "was this score actually earned," which nothing server-side can verify (see server.ts's doc comment). */
export function isValidScore(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_SANE_SCORE
  );
}

/** Would this score actually make the board right now - the same check the client runs before showing the initials-entry prompt, and the one thing the server itself trusts as authoritative. */
export function qualifies(entries: readonly LeaderboardEntry[], score: number, maxEntries: number): boolean {
  if (entries.length < maxEntries) return true;
  const lowestQualifying = entries[entries.length - 1];
  return lowestQualifying !== undefined && score > lowestQualifying.score;
}

/** Pure insert-sort-trim - returns a new array, never mutates `entries`. Ties keep the existing entries' relative order (a new entry with a tied score sorts after, not before, since `qualifies` already required a strictly *higher* score to get here at all - a tie only happens when the board has room, not when displacing someone). */
export function insertEntry(
  entries: readonly LeaderboardEntry[],
  entry: LeaderboardEntry,
  maxEntries: number,
): LeaderboardEntry[] {
  const combined = [...entries, entry];
  combined.sort((a, b) => b.score - a.score);
  return combined.slice(0, maxEntries);
}

/**
 * Three separately-tracked leaderboards now, one per game mode -
 * "behave like the one for single player, but are separately tracked,"
 * decided.
 */
export const VALID_MODES = ['singlePlayer', 'cooperative', 'competitive'] as const;
export type Mode = (typeof VALID_MODES)[number];

export function isValidMode(value: unknown): value is Mode {
  return typeof value === 'string' && (VALID_MODES as readonly string[]).includes(value);
}

/**
 * `singlePlayer` deliberately keeps using `basePath` exactly as
 * configured (the pre-existing, already-live leaderboard file) rather
 * than gaining a suffix too - no migration needed for data that already
 * exists in production. Cooperative/Competitive get sibling files next
 * to it instead of new env vars/PVC mounts to configure.
 */
export function filePathForMode(basePath: string, mode: Mode): string {
  if (mode === 'singlePlayer') return basePath;
  const ext = '.json';
  const base = basePath.endsWith(ext) ? basePath.slice(0, -ext.length) : basePath;
  return `${base}-${mode}${ext}`;
}
