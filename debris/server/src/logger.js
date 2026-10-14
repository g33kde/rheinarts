'use strict';

const fs = require('node:fs');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Minimal leveled logger: timestamped lines to stdout (journald picks that
 * up under systemd) and, optionally, appended to a file. Deliberately
 * dependency-free.
 */
function createLogger({ level = 'info', file = null } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const stream = file ? fs.createWriteStream(file, { flags: 'a' }) : null;

  function write(lvl, message) {
    if (LEVELS[lvl] < threshold) return;
    const line = `${new Date().toISOString()} ${lvl.toUpperCase().padEnd(5)} ${message}`;
    (lvl === 'error' || lvl === 'warn' ? process.stderr : process.stdout).write(`${line}\n`);
    stream?.write(`${line}\n`);
  }

  return {
    debug: (m) => write('debug', m),
    info: (m) => write('info', m),
    warn: (m) => write('warn', m),
    error: (m) => write('error', m),
    log: (lvl, m) => write(LEVELS[lvl] ? lvl : 'info', String(m)),
    close: () => stream?.end(),
  };
}

module.exports = { createLogger, LEVELS };
