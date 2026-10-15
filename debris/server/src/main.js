'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');
const { ConfigError, parseConfig, validateConfig, redactConfig } = require('./config');
const { createLogger } = require('./logger');
const { createScoreSubmitter } = require('./scores');
const { createSignalingServer } = require('./signaling');

/**
 * Debris dedicated server: an Electron main process that owns what a page
 * cannot (config file, WebSocket signaling, logging, lifecycle) around a
 * hidden window running the unchanged game in `?server=1` mode. Chromium
 * supplies WebRTC natively, so the server needs no separate WebRTC library.
 *
 *   electron . --config=config.json [--game=<path to index.html>] [--no-sandbox]
 *
 * `--no-sandbox` is a Chromium flag, needed when running as root or in a
 * container; it is passed straight through. Exit code 1 on any startup
 * failure so systemd's Restart=on-failure sees it.
 */

const argv = Object.fromEntries(
  process.argv
    .slice(1)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [key, ...rest] = a.slice(2).split('=');
      return [key, rest.length > 0 ? rest.join('=') : '1'];
    }),
);

function fatal(message) {
  process.stderr.write(`${new Date().toISOString()} FATAL ${message}\n`);
  app.exit(1);
}

function loadConfigFile() {
  const configPath = path.resolve(argv.config ?? 'config.json');
  if (!fs.existsSync(configPath)) {
    // An explicit --config that doesn't exist is a mistake; the implicit
    // default just means "run with defaults".
    if (argv.config) throw new ConfigError([`config file not found: ${configPath}`]);
    return { config: validateConfig({}), source: 'built-in defaults (no config.json found)' };
  }
  return { config: parseConfig(fs.readFileSync(configPath, 'utf8')), source: configPath };
}

function resolveGameIndex() {
  const index = path.resolve(argv.game ?? path.join(__dirname, '..', '..', 'game', 'dist-desktop', 'index.html'));
  if (!fs.existsSync(index)) {
    throw new Error(`game build not found at ${index} - run "npm run build-game" first (or pass --game=<index.html>)`);
  }
  return index;
}

app.disableHardwareAcceleration();
// No GPU on a server, so the game's canvas falls back to software WebGL; recent
// Chromium only does that when explicitly allowed (and warns every start otherwise).
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

app.whenReady().then(async () => {
  let config;
  let source;
  let gameIndex;
  try {
    ({ config, source } = loadConfigFile());
    gameIndex = resolveGameIndex();
  } catch (error) {
    return fatal(error.message);
  }

  const logger = createLogger({ level: config.ops.logLevel, file: config.ops.logFile });
  logger.info(`${config.name} starting (electron ${process.versions.electron}, chromium ${process.versions.chrome})`);
  logger.info(`config: ${source}`);
  logger.debug(`effective config: ${JSON.stringify(redactConfig(config))}`);

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      // A hidden window otherwise throttles timers to ~1 Hz, which would
      // freeze the simulation and the snapshot stream.
      backgroundThrottling: false,
    },
  });
  const wc = win.webContents;

  // Pin WebRTC's UDP ports so the firewall only needs this range open.
  const [minPort, maxPort] = config.network.udpPortRange;
  wc.setWebRTCUDPPortRange({ min: minPort, max: maxPort });
  logger.info(`WebRTC UDP ports pinned to ${minPort}-${maxPort}`);

  const scores = createScoreSubmitter({ url: config.ops.highscoreApiUrl, key: config.ops.highscoreApiKey, logger });
  logger.info(scores.enabled ? `online scores will be posted to ${config.ops.highscoreApiUrl}` : 'online score posting is off (ops.highscoreApiUrl/highscoreApiKey not set)');

  // Signaling starts before the page has finished booting and registered
  // its listener; anything that arrives in that gap is held and flushed
  // when the lobby reports ready, rather than silently dropped.
  let pageReady = false;
  const held = [];

  // The lobby facts the game page last reported; the config supplies the rest.
  let lastStatus;
  const statusReply = () => {
    if (!lastStatus) return undefined; // the page is still booting - the client just retries
    return {
      type: 'debris-status-reply',
      protocolVersion: lastStatus.protocolVersion,
      name: config.name,
      motd: config.motd,
      passwordRequired: config.password !== '',
      status: lastStatus.status,
      mode: lastStatus.mode,
      players: lastStatus.players,
    };
  };

  let signaling;
  try {
    signaling = await createSignalingServer({
      port: config.network.signalingPort,
      bindAddress: config.network.bindAddress,
      logger,
      getStatusReply: statusReply,
      onMessage: (peerId, data) => {
        if (!pageReady) held.push({ peerId, data });
        else if (!wc.isDestroyed()) wc.send('server:signal-in', { peerId, data });
      },
    });
  } catch (error) {
    logger.error(`could not start signaling on ${config.network.bindAddress}:${config.network.signalingPort}: ${error.message}`);
    return fatal(`signaling failed to start: ${error.message}`);
  }
  logger.info(`signaling listening on ws://${config.network.bindAddress}:${signaling.port}`);

  ipcMain.handle('server:config', () => config);
  ipcMain.on('server:status', (_event, status) => {
    const valid =
      status &&
      Number.isInteger(status.protocolVersion) &&
      (status.status === 'lobby' || status.status === 'inMatch') &&
      (status.mode === 'cooperative' || status.mode === 'competitive') &&
      status.players &&
      Number.isInteger(status.players.current) &&
      Number.isInteger(status.players.max);
    if (valid) lastStatus = status;
  });
  // Fire and forget: posting scores must never hold up the lobby.
  ipcMain.on('server:result', (_event, report) => {
    scores.submit(report).catch((error) => logger.error(`score submission failed unexpectedly: ${error && error.message}`));
  });
  ipcMain.on('server:ready', () => {
    pageReady = true;
    held.splice(0).forEach((payload) => wc.send('server:signal-in', payload));
  });
  ipcMain.on('server:signal-out', (_event, peerId, data) => {
    if (typeof peerId === 'string' && typeof data === 'string') signaling.send(peerId, data);
  });
  ipcMain.on('server:log', (_event, level, message) => logger.log(level, `[game] ${message}`));

  wc.on('console-message', (_event, level, message) => {
    // Warnings and errors only. The CSP notice is dev-build noise that
    // Electron prints for any page without a Content-Security-Policy meta tag.
    if (level >= 2 && !message.includes('Electron Security Warning') && !message.includes('GPU stall due to ReadPixels')) logger.warn(`[page] ${message}`);
  });
  wc.on('render-process-gone', (_event, details) => {
    logger.error(`game page process gone: ${details.reason}`);
    fatal(`game page crashed (${details.reason})`);
  });
  wc.on('did-fail-load', (_event, code, description) => {
    logger.error(`game page failed to load: ${description} (${code})`);
    fatal('game page failed to load');
  });

  let shuttingDown = false;
  const shutdown = async (reason) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`shutting down (${reason})`);
    await signaling.close();
    logger.close();
    app.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await win.loadFile(gameIndex, { query: { server: '1' } });
  logger.info('game page loaded; lobby is opening');
});
