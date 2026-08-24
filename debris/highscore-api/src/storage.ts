import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LeaderboardEntry } from './leaderboard.js';

/**
 * The whole persistence layer: one JSON file holding a bare
 * `LeaderboardEntry[]`. No database - a top-10 list with essentially no
 * write concurrency (see the deployment plan: this API is a
 * single-replica Deployment specifically so there's never more than one
 * writer) doesn't need one.
 */
export async function loadEntries(filePath: string): Promise<LeaderboardEntry[]> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LeaderboardEntry[]) : [];
  } catch (error) {
    // ENOENT (first run, nothing saved yet) is expected and fine - start
    // empty. Anything else (corrupt JSON, a permissions problem) also
    // degrades to empty rather than crashing the server - a genuinely
    // bad file should surface as "the board reset," not "the API is down."
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`[storage] failed to read ${filePath}, starting from an empty board:`, error);
    }
    return [];
  }
}

/** Write to a temp file then rename over the real path - `rename` is atomic on POSIX filesystems, so a crash mid-write can never leave a half-written, corrupt JSON file behind. */
export async function saveEntries(filePath: string, entries: readonly LeaderboardEntry[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await writeFile(tempPath, JSON.stringify(entries, null, 2), 'utf-8');
  await rename(tempPath, filePath);
}
