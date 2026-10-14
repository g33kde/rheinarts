'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { planSubmissions, createScoreSubmitter } = require('../src/scores');

const base = {
  leaderboardVersion: 2,
  mode: 'cooperative',
  outcome: 'loss',
  winnerSlot: null,
  scores: [100, 250, 0, 0],
  pooledScore: 350,
  lastEliminatedSlot: 1,
  participants: [0, 1],
  initialsBySlot: { 0: 'AAA', 1: 'BBB' },
};

// ---------------------------------------------------------------- planning

test('cooperative: the pooled score, credited to the last player to fall', () => {
  assert.deepEqual(planSubmissions(base), [{ mode: 'onlineCooperative', initials: 'BBB', score: 350, version: 2 }]);
});

test('cooperative: falls back to the first participant with initials when the last eliminated has none', () => {
  const report = { ...base, lastEliminatedSlot: 3, initialsBySlot: { 0: 'AAA', 1: 'BBB' } };
  assert.equal(planSubmissions(report)[0].initials, 'AAA');
  const noLast = { ...base, lastEliminatedSlot: null };
  assert.equal(planSubmissions(noLast)[0].initials, 'AAA');
});

test('cooperative: nothing when nobody has valid initials on record', () => {
  assert.deepEqual(planSubmissions({ ...base, initialsBySlot: {} }), []);
  assert.deepEqual(planSubmissions({ ...base, initialsBySlot: { 0: 'ab', 1: 'B1B' } }), []);
});

test('cooperative: a zero score is never posted', () => {
  assert.deepEqual(planSubmissions({ ...base, pooledScore: 0 }), []);
});

const comp = { ...base, mode: 'competitive', outcome: 'win', winnerSlot: 1, lastEliminatedSlot: null };

test('competitive: the winner\'s own score, credited to the winner', () => {
  assert.deepEqual(planSubmissions(comp), [{ mode: 'onlineCompetitive', initials: 'BBB', score: 250, version: 2 }]);
});

test('competitive: a draw earns nothing', () => {
  assert.deepEqual(planSubmissions({ ...comp, outcome: 'draw', winnerSlot: null }), []);
});

test('competitive: nothing when the winner has no initials or no score', () => {
  assert.deepEqual(planSubmissions({ ...comp, initialsBySlot: { 0: 'AAA' } }), []);
  assert.deepEqual(planSubmissions({ ...comp, scores: [100, 0, 0, 0] }), []);
});

test('competitive: credits the winner, not the highest scorer', () => {
  const report = { ...comp, winnerSlot: 0, scores: [40, 900, 0, 0] };
  assert.deepEqual(planSubmissions(report), [{ mode: 'onlineCompetitive', initials: 'AAA', score: 40, version: 2 }]);
});

test('malformed reports earn nothing and never throw', () => {
  for (const bad of [null, undefined, 'x', 7, [], {}, { ...base, leaderboardVersion: 0 }, { ...base, leaderboardVersion: 100 }, { ...base, leaderboardVersion: '2' }, { ...base, initialsBySlot: null }, { ...base, mode: 'singlePlayer' }, { ...base, pooledScore: 1.5 }, { ...base, pooledScore: 2_000_000 }, { ...comp, scores: null }, { ...comp, winnerSlot: 'a' }]) {
    assert.deepEqual(planSubmissions(bad), [], JSON.stringify(bad));
  }
});

test('cooperative never posts a win, competitive never posts a loss', () => {
  assert.deepEqual(planSubmissions({ ...base, outcome: 'win' }), []);
  assert.deepEqual(planSubmissions({ ...comp, outcome: 'loss' }), []);
});

// --------------------------------------------------------------- submitting

const quietLogger = () => {
  const lines = [];
  const add = (level) => (m) => lines.push(`${level}: ${m}`);
  return { lines, debug: add('debug'), info: add('info'), warn: add('warn'), error: add('error') };
};

const respond = (status, body = { accepted: true }) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('submitter posts the planned score with the key and the right body', async () => {
  const calls = [];
  const logger = quietLogger();
  const submitter = createScoreSubmitter({
    url: 'http://api.test/highscores',
    key: 'k3y',
    logger,
    fetchImpl: async (url, init) => { calls.push({ url, init }); return respond(200); },
  });
  await submitter.submit(base);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://api.test/highscores');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['X-Debris-Server-Key'], 'k3y');
  assert.deepEqual(JSON.parse(calls[0].init.body), { initials: 'BBB', score: 350, mode: 'onlineCooperative', version: 2 });
  assert.match(logger.lines.join('\n'), /onlineCooperative BBB 350: posted/);
});

test('submitter reports a score the board did not take', async () => {
  const logger = quietLogger();
  const submitter = createScoreSubmitter({ url: 'http://x', key: 'k', logger, fetchImpl: async () => respond(200, { accepted: false }) });
  await submitter.submit(base);
  assert.match(logger.lines.join('\n'), /did not make the board/);
});

test('submitter never leaks the key into a log line', async () => {
  const logger = quietLogger();
  const submitter = createScoreSubmitter({ url: 'http://x', key: 'sup3r-secret', logger, baseDelayMs: 0, sleep: async () => {}, fetchImpl: async () => respond(500) });
  await submitter.submit(base);
  assert.ok(!logger.lines.join('\n').includes('sup3r-secret'));
});

test('submitter does nothing, and says so, when posting is not configured', async () => {
  const logger = quietLogger();
  let called = false;
  const submitter = createScoreSubmitter({ url: null, key: null, logger, fetchImpl: async () => { called = true; return respond(200); } });
  assert.equal(submitter.enabled, false);
  await submitter.submit(base);
  assert.equal(called, false);
  assert.match(logger.lines.join('\n'), /not posting onlineCooperative BBB 350/);
});

test('submitter stays quiet about matches that earn nothing', async () => {
  const logger = quietLogger();
  let called = false;
  const submitter = createScoreSubmitter({ url: 'http://x', key: 'k', logger, fetchImpl: async () => { called = true; return respond(200); } });
  await submitter.submit({ ...base, pooledScore: 0 });
  assert.equal(called, false);
});

test('a 4xx is final: logged once, never retried, with a hint for 401 and 403', async () => {
  for (const [status, hint] of [[401, /rejected the key/], [403, /not enabled/], [400, /answered 400/]]) {
    const logger = quietLogger();
    let calls = 0;
    const submitter = createScoreSubmitter({ url: 'http://x', key: 'k', logger, sleep: async () => {}, fetchImpl: async () => { calls += 1; return respond(status); } });
    await submitter.submit(base);
    assert.equal(calls, 1, `status ${status}`);
    assert.match(logger.lines.join('\n'), hint);
    assert.match(logger.lines.join('\n'), /not retrying/);
  }
});

test('a 5xx is retried with a growing delay, then succeeds', async () => {
  const logger = quietLogger();
  const sleeps = [];
  let calls = 0;
  const submitter = createScoreSubmitter({
    url: 'http://x', key: 'k', logger, baseDelayMs: 100,
    sleep: async (ms) => { sleeps.push(ms); },
    fetchImpl: async () => { calls += 1; return calls < 3 ? respond(503) : respond(200); },
  });
  await submitter.submit(base);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [100, 200]);
  assert.match(logger.lines.join('\n'), /posted/);
});

test('it gives up after the attempt limit and says so', async () => {
  const logger = quietLogger();
  let calls = 0;
  const submitter = createScoreSubmitter({ url: 'http://x', key: 'k', logger, maxAttempts: 3, sleep: async () => {}, fetchImpl: async () => { calls += 1; throw new Error('ECONNREFUSED'); } });
  await submitter.submit(base);
  assert.equal(calls, 3);
  assert.match(logger.lines.join('\n'), /giving up after 3 attempts \(request failed: ECONNREFUSED\)/);
});

test('a request that never answers is aborted and retried', async () => {
  const logger = quietLogger();
  let calls = 0;
  const submitter = createScoreSubmitter({
    url: 'http://x', key: 'k', logger, maxAttempts: 2, timeoutMs: 20, sleep: async () => {},
    fetchImpl: (url, init) => { calls += 1; return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))); },
  });
  await submitter.submit(base);
  assert.equal(calls, 2);
  assert.match(logger.lines.join('\n'), /did not answer in time/);
});

test('against a real HTTP server: the body, the key header and the board all arrive intact', async () => {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      received.push({ method: req.method, key: req.headers['x-debris-server-key'], type: req.headers['content-type'], body: JSON.parse(body) });
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ accepted: true, highscores: [] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const logger = quietLogger();
    const submitter = createScoreSubmitter({ url: `http://127.0.0.1:${server.address().port}/highscores`, key: 'k3y', logger });
    await submitter.submit(comp);
    assert.deepEqual(received, [{ method: 'POST', key: 'k3y', type: 'application/json', body: { initials: 'BBB', score: 250, mode: 'onlineCompetitive', version: 2 } }]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
