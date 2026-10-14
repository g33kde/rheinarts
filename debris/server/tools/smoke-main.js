'use strict';

// End-to-end smoke test for the dedicated server. Run it against a
// running server:
//
//   electron tools/smoke-main.js [--url=ws://127.0.0.1:8765] [--scenario=play|lobby|session] [--players=1] [--mode=cooperative] [--seconds=6] [--password=...]
//
// It is a separate, plain-JS implementation of the client wire protocol
// (signaling envelope, welcome, snapshot, input) on purpose: it checks the
// server against the protocol itself, not against the game's own client
// code. Exits 0 on PASS, 1 on FAIL. Output is only printed by the page.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const args = Object.fromEntries(
  process.argv.slice(1).filter((a) => a.startsWith('--')).map((a) => {
    const [k, ...v] = a.slice(2).split('=');
    return [k, v.length ? v.join('=') : '1'];
  }),
);

// Own throwaway profile: Electron processes sharing the default profile directory interfere with each
// other's networking (see client-e2e-main.js), and the smoke client is routinely run beside a server.
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'debris-smoke-')));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', (_e, _level, message) => {
    const match = /^__EXIT__ (\d)$/.exec(message);
    if (match) return app.exit(Number(match[1]));
    process.stdout.write(`${message}\n`);
  });
  win.webContents.on('render-process-gone', () => app.exit(1));
  await win.loadFile(path.join(__dirname, 'smoke-client.html'), { query: args });
});
