'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, ConfigError, validateConfig, parseConfig, redactConfig } = require('../src/config');

const problemsOf = (input) => {
  try {
    validateConfig(input);
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    return error.problems;
  }
  return [];
};

test('empty config yields the defaults', () => {
  const config = validateConfig({});
  assert.equal(config.network.signalingPort, DEFAULTS.network.signalingPort);
  assert.deepEqual(config.network.udpPortRange, [50000, 50100]);
  assert.equal(config.gameplay.defaultMode, 'cooperative');
  assert.equal(config.ops.snapshotHz, 30);
});

test('a partial section keeps the other defaults in that section', () => {
  const config = validateConfig({ network: { signalingPort: 9000 } });
  assert.equal(config.network.signalingPort, 9000);
  assert.equal(config.network.bindAddress, '0.0.0.0');
  assert.equal(config.network.stunServers.length, 2);
});

test('the shipped config.example.json is valid', () => {
  const text = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'config.example.json'), 'utf8');
  assert.doesNotThrow(() => parseConfig(text));
});

test('returned config is frozen', () => {
  const config = validateConfig({});
  assert.throws(() => { 'use strict'; config.network.signalingPort = 1; }, TypeError);
  assert.throws(() => { 'use strict'; config.network.udpPortRange.push(1); }, TypeError);
});

test('unknown keys are rejected at every level', () => {
  const problems = problemsOf({ extra: 1, network: { signalingPrt: 1 }, ops: { nope: true } });
  assert.deepEqual(problems.sort(), ['unknown key "extra"', 'unknown key "network.signalingPrt"', 'unknown key "ops.nope"']);
});

test('all problems are reported together', () => {
  const problems = problemsOf({ network: { signalingPort: 0 }, gameplay: { maxPlayers: 9, defaultMode: 'chaos' }, ops: { snapshotHz: 5 } });
  assert.equal(problems.length, 4);
});

test('port and range validation', () => {
  assert.ok(problemsOf({ network: { signalingPort: 70000 } }).length > 0);
  assert.ok(problemsOf({ network: { signalingPort: 80.5 } }).length > 0);
  assert.ok(problemsOf({ network: { udpPortRange: [50100, 50000] } }).length > 0);
  assert.ok(problemsOf({ network: { udpPortRange: [80, 200] } }).length > 0);
  assert.ok(problemsOf({ network: { udpPortRange: [50000, 50003] } }).length > 0);
  assert.ok(problemsOf({ network: { udpPortRange: [50000] } }).length > 0);
  assert.deepEqual(problemsOf({ network: { udpPortRange: [50000, 50009] } }), []);
});

test('stun servers must look like stun URLs, and may be empty', () => {
  assert.deepEqual(problemsOf({ network: { stunServers: [] } }), []);
  assert.ok(problemsOf({ network: { stunServers: ['google.com'] } }).length > 0);
  assert.ok(problemsOf({ network: { stunServers: 'stun:x:1' } }).length > 0);
});

test('mode, players, log level and hz validation', () => {
  assert.deepEqual(problemsOf({ gameplay: { defaultMode: 'competitive', maxPlayers: 1 } }), []);
  assert.ok(problemsOf({ gameplay: { defaultMode: 'singlePlayer' } }).length > 0);
  assert.ok(problemsOf({ gameplay: { maxPlayers: 0 } }).length > 0);
  assert.ok(problemsOf({ ops: { logLevel: 'verbose' } }).length > 0);
  assert.ok(problemsOf({ ops: { snapshotHz: 61 } }).length > 0);
});

test('highscore url and key must be set together', () => {
  assert.ok(problemsOf({ ops: { highscoreApiUrl: 'https://x.example/api' } }).length > 0);
  assert.ok(problemsOf({ ops: { highscoreApiKey: 'k' } }).length > 0);
  assert.ok(problemsOf({ ops: { highscoreApiUrl: 'ftp://x', highscoreApiKey: 'k' } }).length > 0);
  assert.deepEqual(problemsOf({ ops: { highscoreApiUrl: 'https://x.example/api', highscoreApiKey: 'k' } }), []);
});

test('non-object input and non-object sections are rejected', () => {
  assert.ok(problemsOf([]).length > 0);
  assert.ok(problemsOf(null).length > 0);
  assert.ok(problemsOf({ network: 'fast' }).length > 0);
});

test('parseConfig reports malformed JSON as a ConfigError', () => {
  assert.throws(() => parseConfig('{ nope'), ConfigError);
});

test('redactConfig hides the password and API key only', () => {
  const config = validateConfig({ password: 'hunter2', ops: { highscoreApiUrl: 'https://x.example/api', highscoreApiKey: 'secret' } });
  const redacted = redactConfig(config);
  assert.equal(redacted.password, '***');
  assert.equal(redacted.ops.highscoreApiKey, '***');
  assert.equal(redacted.name, config.name);
  assert.equal(config.password, 'hunter2');
});
