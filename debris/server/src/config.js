'use strict';

/**
 * The dedicated server's config file: defaults, validation, and nothing
 * else - no Electron, no sockets, so it is unit-tested with plain
 * `node --test`.
 *
 * Every key is validated and unknown keys are an error rather than being
 * ignored: a typo like "signalingPrt" silently falling back to the default
 * port is exactly the kind of mistake a server config must not allow.
 *
 * Which keys the server already acts on (phase of the online plan):
 *   network.*, gameplay.*, ops.logLevel/logFile/snapshotHz  - in use
 *   name, motd, password  - in use (Online screen, join check)
 *   ops.highscoreApi*     - phase 6
 */

const DEFAULTS = Object.freeze({
  name: 'Debris Server',
  motd: '',
  password: '',
  network: {
    bindAddress: '0.0.0.0',
    signalingPort: 8765,
    udpPortRange: [50000, 50100],
    stunServers: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
  },
  gameplay: { defaultMode: 'cooperative', maxPlayers: 4, returnToLobbyDelayMs: 8000, reconnectGraceMs: 30000, idleLeaderMs: 120000 },
  limits: { maxConnections: 64, maxConnectionsPerIp: 8, messagesPerSecond: 30, burstMessages: 80, idleTimeoutMs: 30000 },
  ops: { logLevel: 'info', logFile: null, snapshotHz: 30, highscoreApiUrl: null, highscoreApiKey: null },
});

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const MODES = ['cooperative', 'competitive'];

class ConfigError extends Error {
  constructor(problems) {
    super(`Invalid server config:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const isNonEmptyString = (v, maxLen) => typeof v === 'string' && v.length > 0 && v.length <= maxLen;

/** Reports every key in `value` that `allowed` doesn't list. */
function unknownKeys(value, allowed, path, problems) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) problems.push(`unknown key "${path}${key}"`);
  }
}

function section(input, name, problems) {
  const value = input[name];
  if (value === undefined) return {};
  if (!isPlainObject(value)) {
    problems.push(`"${name}" must be an object`);
    return {};
  }
  return value;
}

/**
 * Merges `input` (parsed JSON from the config file) over the defaults and
 * validates the result. Returns a fresh, frozen config; throws
 * `ConfigError` listing *all* problems at once so an admin fixes the file
 * in one pass instead of one restart per mistake.
 */
function validateConfig(input = {}) {
  const problems = [];
  if (!isPlainObject(input)) throw new ConfigError(['the config file must contain a JSON object']);

  unknownKeys(input, ['name', 'motd', 'password', 'network', 'gameplay', 'limits', 'ops'], '', problems);
  const network = section(input, 'network', problems);
  const gameplay = section(input, 'gameplay', problems);
  const limits = section(input, 'limits', problems);
  const ops = section(input, 'ops', problems);
  unknownKeys(network, ['bindAddress', 'signalingPort', 'udpPortRange', 'stunServers'], 'network.', problems);
  unknownKeys(gameplay, ['defaultMode', 'maxPlayers', 'returnToLobbyDelayMs', 'reconnectGraceMs', 'idleLeaderMs'], 'gameplay.', problems);
  unknownKeys(limits, ['maxConnections', 'maxConnectionsPerIp', 'messagesPerSecond', 'burstMessages', 'idleTimeoutMs'], 'limits.', problems);
  unknownKeys(ops, ['logLevel', 'logFile', 'snapshotHz', 'highscoreApiUrl', 'highscoreApiKey'], 'ops.', problems);

  const config = {
    name: input.name ?? DEFAULTS.name,
    motd: input.motd ?? DEFAULTS.motd,
    password: input.password ?? DEFAULTS.password,
    network: { ...DEFAULTS.network, ...network },
    gameplay: { ...DEFAULTS.gameplay, ...gameplay },
    limits: { ...DEFAULTS.limits, ...limits },
    ops: { ...DEFAULTS.ops, ...ops },
  };

  if (!isNonEmptyString(config.name, 40)) problems.push('"name" must be a string of 1-40 characters');
  if (typeof config.motd !== 'string' || config.motd.length > 200) problems.push('"motd" must be a string of at most 200 characters');
  if (typeof config.password !== 'string' || config.password.length > 64) problems.push('"password" must be a string of at most 64 characters (empty = no password)');

  const n = config.network;
  if (!isNonEmptyString(n.bindAddress, 255)) problems.push('"network.bindAddress" must be a non-empty string');
  if (!isInt(n.signalingPort, 1, 65535)) problems.push('"network.signalingPort" must be an integer 1-65535');
  const range = n.udpPortRange;
  if (!Array.isArray(range) || range.length !== 2 || !isInt(range[0], 1024, 65535) || !isInt(range[1], 1024, 65535) || range[0] > range[1]) {
    problems.push('"network.udpPortRange" must be [min, max], integers 1024-65535, min <= max');
  } else if (range[1] - range[0] < 9) {
    problems.push('"network.udpPortRange" must span at least 10 ports (each connection uses one)');
  }
  if (!Array.isArray(n.stunServers) || !n.stunServers.every((s) => typeof s === 'string' && /^stuns?:\S+$/.test(s))) {
    problems.push('"network.stunServers" must be an array of "stun:host:port" strings (may be empty)');
  }

  if (!MODES.includes(config.gameplay.defaultMode)) problems.push(`"gameplay.defaultMode" must be one of: ${MODES.join(', ')}`);
  if (!isInt(config.gameplay.maxPlayers, 1, 4)) problems.push('"gameplay.maxPlayers" must be an integer 1-4');
  if (!isInt(config.gameplay.reconnectGraceMs, 0, 300000)) problems.push('"gameplay.reconnectGraceMs" must be an integer 0-300000 (0 = a dropped player is eliminated at once)');
  if (!isInt(config.gameplay.returnToLobbyDelayMs, 0, 60000)) problems.push('"gameplay.returnToLobbyDelayMs" must be an integer 0-60000 (how long the end screen shows)');

  if (!isInt(config.gameplay.idleLeaderMs, 0, 3600000)) problems.push('"gameplay.idleLeaderMs" must be an integer 0-3600000 (0 = an idle leader keeps the lead; otherwise how long without a lobby command before the next player leads)');
  const l = config.limits;
  if (!isInt(l.maxConnections, 1, 10000)) problems.push('"limits.maxConnections" must be an integer 1-10000');
  if (!isInt(l.maxConnectionsPerIp, 1, 10000)) problems.push('"limits.maxConnectionsPerIp" must be an integer 1-10000');
  if (!isInt(l.messagesPerSecond, 1, 10000)) problems.push('"limits.messagesPerSecond" must be an integer 1-10000');
  if (!isInt(l.burstMessages, 10, 100000)) problems.push('"limits.burstMessages" must be an integer 10-100000');
  if (!isInt(l.idleTimeoutMs, 0, 3600000)) problems.push('"limits.idleTimeoutMs" must be an integer 0-3600000 (0 = never close idle sockets)');

  const o = config.ops;
  if (!LOG_LEVELS.includes(o.logLevel)) problems.push(`"ops.logLevel" must be one of: ${LOG_LEVELS.join(', ')}`);
  if (o.logFile !== null && !isNonEmptyString(o.logFile, 1024)) problems.push('"ops.logFile" must be a path string or null');
  if (!isInt(o.snapshotHz, 10, 60)) problems.push('"ops.snapshotHz" must be an integer 10-60');
  if (o.highscoreApiUrl !== null && !(typeof o.highscoreApiUrl === 'string' && /^https?:\/\/\S+$/.test(o.highscoreApiUrl))) {
    problems.push('"ops.highscoreApiUrl" must be an http(s) URL or null');
  }
  if (o.highscoreApiKey !== null && !isNonEmptyString(o.highscoreApiKey, 256)) problems.push('"ops.highscoreApiKey" must be a non-empty string or null');
  if ((o.highscoreApiUrl === null) !== (o.highscoreApiKey === null)) {
    problems.push('"ops.highscoreApiUrl" and "ops.highscoreApiKey" must be set together (or both null)');
  }


  if (problems.length > 0) throw new ConfigError(problems);

  // Freeze the nested objects too - nothing should mutate config at runtime.
  config.network.udpPortRange = Object.freeze([...config.network.udpPortRange]);
  config.network.stunServers = Object.freeze([...config.network.stunServers]);
  for (const key of ['network', 'gameplay', 'limits', 'ops']) Object.freeze(config[key]);
  return Object.freeze(config);
}

/** `validateConfig` for a JSON string, with a readable error for malformed JSON. */
function parseConfig(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new ConfigError([`not valid JSON: ${error.message}`]);
  }
  return validateConfig(parsed);
}

/** The config with secrets blanked, safe to write to a log. */
function redactConfig(config) {
  return {
    ...config,
    password: config.password ? '***' : '',
    ops: { ...config.ops, highscoreApiKey: config.ops.highscoreApiKey ? '***' : null },
  };
}

module.exports = { DEFAULTS, ConfigError, validateConfig, parseConfig, redactConfig };
