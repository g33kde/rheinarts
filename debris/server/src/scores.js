'use strict';

/**
 * Posting online match results to the high score API (docs/roadmap.md's
 * "Windows + LAN multiplayer" - online phase 6).
 *
 * Why the *server* posts: a match on the dedicated server is simulated
 * there, so its result is not something a client can make up. The API
 * keeps two boards (`onlineCooperative`, `onlineCompetitive`) that only
 * accept writes carrying the server's key; the three local boards stay
 * open as they always were. The key lives in the config file and in this
 * (main) process - the game page never sees it.
 *
 * Two halves, so the rules are testable without a network:
 * - `planSubmissions(report)`: what, if anything, a finished match earns.
 * - `createScoreSubmitter(...)`: posting it, with timeouts and retries,
 *   without ever blocking the lobby.
 */

const INITIALS = /^[A-Z]{3}$/;
const isScore = (v) => Number.isInteger(v) && v > 0 && v <= 1_000_000;

/**
 * Decides which scores a finished match puts on the online boards. A
 * `report` is what the game page sends (`ScoreReport` in
 * `game/src/systems/ServerBridge.ts`). Returns `[]` for anything that earns
 * nothing or is malformed - a bad report must cost a log line, not a crash.
 *
 * Rules, matching what a local game does:
 * - **Competitive**: the winner's own score, credited to the winner. A draw
 *   earns nothing (there is no one score to credit).
 * - **Cooperative**: the team's pooled score, credited to the last player to
 *   fall - the one a local game lets enter the team's initials - or, if
 *   they have no initials on record, the first participant who has.
 * - A score of 0 is never posted: it would only fill an empty board.
 */
function planSubmissions(report) {
  if (typeof report !== 'object' || report === null) return [];
  const { mode, outcome, winnerSlot, scores, pooledScore, lastEliminatedSlot, participants, initialsBySlot, leaderboardVersion } = report;
  if (!Number.isInteger(leaderboardVersion) || leaderboardVersion < 1 || leaderboardVersion > 99) return [];
  if (typeof initialsBySlot !== 'object' || initialsBySlot === null) return [];
  const initialsOf = (slot) => {
    const value = initialsBySlot[String(slot)];
    return typeof value === 'string' && INITIALS.test(value) ? value : undefined;
  };

  if (mode === 'competitive') {
    if (outcome !== 'win' || !Number.isInteger(winnerSlot) || !Array.isArray(scores)) return [];
    const initials = initialsOf(winnerSlot);
    const score = scores[winnerSlot];
    if (!initials || !isScore(score)) return [];
    return [{ mode: 'onlineCompetitive', initials, score, version: leaderboardVersion }];
  }

  if (mode === 'cooperative') {
    if (outcome !== 'loss' || !isScore(pooledScore)) return [];
    const candidates = [lastEliminatedSlot, ...(Array.isArray(participants) ? participants : [])];
    const initials = candidates.map((slot) => (Number.isInteger(slot) ? initialsOf(slot) : undefined)).find(Boolean);
    if (!initials) return [];
    return [{ mode: 'onlineCooperative', initials, score: pooledScore, version: leaderboardVersion }];
  }

  return [];
}

const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Builds the submitter. With no `url`/`key` configured it is a logged no-op
 * (score submission is optional). Otherwise `submit(report)` posts each
 * planned score:
 * - success: logged, including whether the board accepted it;
 * - a 4xx is final (a wrong key, a disabled board, a rejected body): logged
 *   once, never retried;
 * - a 5xx, a timeout or a network error is retried with a growing delay, a
 *   few times, then given up on with a log line. Scores are not queued across
 *   restarts: this is a leaderboard, not a ledger.
 * `submit` resolves when done but callers do not wait on it - posting must
 * never hold up the lobby.
 */
function createScoreSubmitter({
  url,
  key,
  logger,
  fetchImpl = globalThis.fetch,
  maxAttempts = 4,
  baseDelayMs = 2000,
  timeoutMs = 8000,
  sleep = sleepFor,
}) {
  const enabled = typeof url === 'string' && url !== '' && typeof key === 'string' && key !== '';

  async function postOnce(entry) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debris-Server-Key': key },
        body: JSON.stringify({ initials: entry.initials, score: entry.score, mode: entry.mode, version: entry.version }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async function postWithRetries(entry) {
    const label = `${entry.mode} ${entry.initials} ${entry.score}`;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let outcomeText;
      try {
        const response = await postOnce(entry);
        if (response.ok) {
          let accepted;
          try {
            accepted = (await response.json()).accepted;
          } catch {
            accepted = undefined;
          }
          logger.info(`score ${label}: ${accepted === false ? 'did not make the board' : 'posted'}`);
          return;
        }
        if (response.status >= 400 && response.status < 500) {
          const hint =
            response.status === 401 ? ' (the API rejected the key)' : response.status === 403 ? ' (the online boards are not enabled on the API: DEBRIS_SERVER_KEY unset there)' : '';
          logger.error(`score ${label}: the API answered ${response.status}${hint} - not retrying`);
          return;
        }
        outcomeText = `the API answered ${response.status}`;
      } catch (error) {
        outcomeText = error && error.name === 'AbortError' ? 'the API did not answer in time' : `request failed: ${error && error.message}`;
      }
      if (attempt === maxAttempts) {
        logger.error(`score ${label}: giving up after ${maxAttempts} attempts (${outcomeText})`);
        return;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      logger.warn(`score ${label}: ${outcomeText} - retrying in ${Math.round(delay / 1000)}s (attempt ${attempt}/${maxAttempts})`);
      await sleep(delay);
    }
  }

  return {
    enabled,
    async submit(report) {
      const plan = planSubmissions(report);
      if (plan.length === 0) {
        logger.debug('score: this match earns nothing for the online boards');
        return;
      }
      if (!enabled) {
        logger.info(`score: not posting ${plan.map((p) => `${p.mode} ${p.initials} ${p.score}`).join(', ')} (ops.highscoreApiUrl/Key are not set)`);
        return;
      }
      for (const entry of plan) await postWithRetries(entry);
    },
  };
}

module.exports = { planSubmissions, createScoreSubmitter };
