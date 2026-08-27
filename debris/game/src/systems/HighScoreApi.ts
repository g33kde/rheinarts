/**
 * Client for Debris's three global top-10 high score leaderboards - one
 * per game mode, "separately tracked," decided (`debris/highscore-api`,
 * the first backend service in Rhein Arts). Same-origin
 * `/api/debris/highscores` - nginx proxies it in production
 * (`nginx.conf`), Vite's own dev proxy handles it locally
 * (`vite.config.ts`).
 *
 * Both functions degrade gracefully on any network failure (offline,
 * the API pod down, a LAN hiccup) rather than throwing - same spirit as
 * `AudioSettings.ts`'s localStorage try/catch. A failed fetch shouldn't
 * be able to block the game-over screen.
 */

import type { GameMode } from './RoundOutcome';

export interface LeaderboardEntry {
  readonly initials: string;
  readonly score: number;
}

/** Mirrors the server's own MAX_ENTRIES (`debris-highscore-api/src/leaderboard.ts`) - no shared package between the two, so this is a deliberate small duplication, not drift. */
export const MAX_LEADERBOARD_ENTRIES = 10;

const HIGHSCORES_URL = '/api/debris/highscores';

export async function fetchLeaderboard(mode: GameMode): Promise<LeaderboardEntry[]> {
  try {
    const response = await fetch(`${HIGHSCORES_URL}?mode=${mode}`);
    if (!response.ok) return [];
    const parsed: unknown = await response.json();
    return Array.isArray(parsed) ? (parsed as LeaderboardEntry[]) : [];
  } catch {
    return [];
  }
}

export async function submitHighScore(
  initials: string,
  score: number,
  mode: GameMode,
): Promise<{ accepted: boolean; highscores: LeaderboardEntry[] }> {
  try {
    const response = await fetch(HIGHSCORES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initials, score, mode }),
    });
    if (!response.ok) return { accepted: false, highscores: [] };
    const parsed = (await response.json()) as { accepted: boolean; highscores: LeaderboardEntry[] };
    return parsed;
  } catch {
    return { accepted: false, highscores: [] };
  }
}

/**
 * Would this score actually make the board right now - the client-side
 * half of the same check `debris-highscore-api/src/leaderboard.ts`'s
 * `qualifies()` runs server-side. Used only to decide whether to show
 * the initials-entry prompt at all; the server remains the sole
 * authority on what actually gets persisted (a stale/racing client-side
 * "yes" can still come back `accepted: false` from `submitHighScore`).
 */
export function qualifiesForLeaderboard(
  entries: readonly LeaderboardEntry[],
  score: number,
  maxEntries: number = MAX_LEADERBOARD_ENTRIES,
): boolean {
  if (entries.length < maxEntries) return true;
  const lowestQualifying = entries[entries.length - 1];
  return lowestQualifying !== undefined && score > lowestQualifying.score;
}
