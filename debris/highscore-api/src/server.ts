import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  insertEntry,
  isValidInitials,
  isValidScore,
  MAX_ENTRIES,
  normalizeInitials,
  qualifies,
  type LeaderboardEntry,
} from './leaderboard.js';
import { loadEntries, saveEntries } from './storage.js';

/**
 * Debris's global top-10 high score leaderboard - the first backend
 * service in Rhein Arts (every other game/portal page here is a static
 * file nginx serves). Three routes, no framework - the surface area
 * doesn't justify one. Single-replica by design (see
 * `k8s/rheinarts.yaml`'s deployment comment) so there's never more than
 * one writer to the JSON file `storage.ts` persists to.
 *
 * **No gameplay verification happens here.** A `POST` is trusted input,
 * same trust model as most simple arcade-style leaderboards without
 * full server-authoritative gameplay - `leaderboard.ts`'s validation is
 * spam/garbage prevention (well-formed initials, a plausible score),
 * not anti-cheat. Worth staying honest about rather than implying this
 * is secure against a determined `curl`.
 */

const PORT = Number(process.env.PORT ?? 8081);
const FILE_PATH = process.env.HIGHSCORE_FILE_PATH ?? './data/debris-highscores.json';
const MAX_BODY_BYTES = 1024; // a {initials, score} payload is a few dozen bytes - generous headroom, not an invitation

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error('request body too large');
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw.length > 0 ? JSON.parse(raw) : {};
}

async function handleGetHighScores(res: ServerResponse): Promise<void> {
  const entries = await loadEntries(FILE_PATH);
  sendJson(res, 200, entries);
}

async function handlePostHighScores(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'malformed request body' });
    return;
  }

  const initialsRaw = (body as { initials?: unknown } | null)?.initials;
  const score = (body as { score?: unknown } | null)?.score;

  if (typeof initialsRaw !== 'string') {
    sendJson(res, 400, { error: 'initials must be a string' });
    return;
  }
  const initials = normalizeInitials(initialsRaw);
  if (!isValidInitials(initials)) {
    sendJson(res, 400, { error: 'initials must be exactly 3 letters (A-Z)' });
    return;
  }
  if (!isValidScore(score)) {
    sendJson(res, 400, { error: 'score must be a non-negative integer' });
    return;
  }

  const entries = await loadEntries(FILE_PATH);
  const entry: LeaderboardEntry = { initials, score };

  if (!qualifies(entries, score, MAX_ENTRIES)) {
    sendJson(res, 200, { accepted: false, highscores: entries });
    return;
  }

  const updated = insertEntry(entries, entry, MAX_ENTRIES);
  await saveEntries(FILE_PATH, updated);
  sendJson(res, 200, { accepted: true, highscores: updated });
}

const server = createServer((req, res) => {
  void (async () => {
    try {
      if (req.method === 'GET' && req.url === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok\n');
      } else if (req.method === 'GET' && req.url === '/highscores') {
        await handleGetHighScores(res);
      } else if (req.method === 'POST' && req.url === '/highscores') {
        await handlePostHighScores(req, res);
      } else {
        sendJson(res, 404, { error: 'not found' });
      }
    } catch (error) {
      console.error('[server] unhandled error:', error);
      sendJson(res, 500, { error: 'internal error' });
    }
  })();
});

server.listen(PORT, () => {
  console.log(`[server] debris-highscore-api listening on :${PORT} (file: ${FILE_PATH})`);
});
