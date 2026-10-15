#!/usr/bin/env node
'use strict';
// Validates a server config file without starting Electron.
//   node tools/check-config.js [config.json] [--ports]
// Exit 0 and "config ok" (or, with --ports, "<signaling tcp port> <udp min>-<udp max>"); exit 1 listing every problem.
const fs = require('node:fs');
const path = require('node:path');
const { ConfigError, parseConfig } = require('../src/config');

const args = process.argv.slice(2);
const file = path.resolve(args.find((a) => !a.startsWith('--')) ?? 'config.json');
try {
  const config = parseConfig(fs.readFileSync(file, 'utf8'));
  if (args.includes('--ports')) {
    const [min, max] = config.network.udpPortRange;
    console.log(`${config.network.signalingPort} ${min}-${max}`);
  } else {
    console.log(`config ok: ${file}`);
  }
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`invalid config ${file}:\n${error.problems.map((p) => `  - ${p}`).join('\n')}`);
  } else {
    console.error(`cannot read ${file}: ${error.message}`);
  }
  process.exit(1);
}
