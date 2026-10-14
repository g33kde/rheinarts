'use strict';

// End-to-end smoke test for the dedicated server. Run it against a
// running server:
//
//   electron tools/smoke-main.js [--url=ws://127.0.0.1:8765] [--scenario=play|lobby|session] [--players=1] [--mode=cooperative] [--seconds=6] [--password=...]
//
// With --api it also checks the real high score API afterwards.
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
  let scored = 0;
  win.webContents.on('console-message', (_e, _level, message) => {
    const score = /^__SCORE__ (\d+)$/.exec(message);
    if (score) { scored = Number(score[1]); return; }
    const match = /^__EXIT__ (\d)$/.exec(message);
    if (match) return finish(Number(match[1]));
    process.stdout.write(`${message}\n`);
  });

  // `--api=<highscores url>` (with `--board=<mode>` and `--initials=<XXX>`): after the page is done, check the
  // REAL high score API's board for the score the scenario reported (`__SCORE__`).
  async function finish(code) {
    if (code === 0 && args.api && scored > 0) {
      const board = args.board || 'onlineCooperative';
      const url = `${args.api}?mode=${board}&version=2`;
      let entries = [];
      for (let attempt = 0; attempt < 15; attempt += 1) {
        try {
          entries = await (await fetch(url)).json();
          if (entries.some((e) => e.initials === (args.initials || 'SMK'))) break;
        } catch (error) { /* the API may not be up yet */ }
        await new Promise((r) => setTimeout(r, 1000));
      }
      const hit = entries.find((e) => e.initials === (args.initials || 'SMK'));
      if (hit && hit.score >= scored) process.stdout.write(`  ok: the ${board} board has ${hit.initials} ${hit.score} (the player had scored ${scored} when it left)\nPASS\n`);
      else { process.stdout.write(`  FAIL: the ${board} board has no ${args.initials || 'SMK'} entry >= ${scored}: ${JSON.stringify(entries)}\nFAIL (1)\n`); return app.exit(1); }
    }
    app.exit(code);
  }
  win.webContents.on('render-process-gone', () => app.exit(1));
  await win.loadFile(path.join(__dirname, 'smoke-client.html'), { query: args });
});
