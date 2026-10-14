'use strict';

// End-to-end check of the REAL game client (the built `game/dist-desktop`,
// loaded with `?e2e` so it exposes its Phaser instance) against a running
// dedicated server. It clicks through the actual Online screens:
//
//   electron tools/client-e2e-main.js [--url=ws://127.0.0.1:8765] [--password=secret]
//
// The server needs `password` "secret", `reconnectGraceMs` ~3000 and
// `returnToLobbyDelayMs` ~1000. Prints a log, exits 0 on PASS and 1 on FAIL.
const { spawn } = require('node:child_process');
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
const URL_ = args.url || 'ws://127.0.0.1:8765';
const PASSWORD = args.password || 'secret';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const log = (m) => process.stdout.write(`${m}\n`);
const check = (cond, msg) => { log(`  ${cond ? 'ok' : 'FAIL'}: ${msg}`); if (!cond) failures.push(msg); return cond; };

// Every Electron process this test starts gets its own throwaway profile directory. Two Electron
// processes sharing the default one interfere with each other's networking - seen here as a client's
// WebRTC connection dropping the instant another process (the bot) was active - which looked exactly
// like a game bug and was not one.
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'debris-e2e-')));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1280, height: 800, webPreferences: { backgroundThrottling: false } });
  const wc = win.webContents;
  wc.on('render-process-gone', (_e, d) => { log(`renderer gone: ${d.reason}`); app.exit(1); });
  wc.on('console-message', (_e, level, message) => { if (level >= 3) log(`  [page error] ${message}`); });
  const run = (code) => wc.executeJavaScript(code);

  await win.loadFile(path.join(__dirname, '..', '..', 'game', 'dist-desktop', 'index.html'), { query: { e2e: '1' } });

  // Helpers living in the page: read a scene's visible text, click a button by its label, type into it.
  await run(`
    window.__e2e = {
      game: () => window.__debrisGame,
      scene: (k) => window.__debrisGame.scene.getScene(k),
      active: (k) => window.__debrisGame.scene.isActive(k),
      texts: (k) => window.__debrisGame.scene.getScene(k).children.list.filter((o) => o.type === 'Text' && o.visible).map((o) => o.text),
      click: (k, label) => {
        const sc = window.__debrisGame.scene.getScene(k);
        const t = sc.children.list.find((o) => o.type === 'Text' && o.text.startsWith(label));
        if (!t) return false;
        const r = sc.children.list.find((o) => o.type === 'Rectangle' && o.input && o.x === t.x && o.y === t.y);
        if (!r) return false;
        r.emit('pointerdown');
        return true;
      },
      // Fill the join form: for each visible field, focus it (Tab), clear it, type the value.
      fill: (k, values) => {
        const sc = window.__debrisGame.scene.getScene(k);
        const kb = sc.input.keyboard;
        const ids = sc.visibleFields();
        for (const id of ids) {
          if (!(id in values)) continue;
          for (let guard = 0; sc.focus !== id && guard < 6; guard += 1) kb.emit('keydown', { key: 'Tab' });
          while (sc.fieldValue(id).length > 0) kb.emit('keydown', { key: 'Backspace' });
          for (const ch of values[id]) kb.emit('keydown', { key: ch });
        }
        return ids.map((id) => id + '=' + (id === 'password' ? '*'.repeat(sc.fieldValue(id).length) : sc.fieldValue(id))).join(' ');
      },
      type: (k, str) => { const kb = window.__debrisGame.scene.getScene(k).input.keyboard; for (const ch of str) kb.emit('keydown', { key: ch }); },
    };
    localStorage.setItem('debris.onlineServerUrl', ${JSON.stringify(URL_)});
    true;
  `);

  const waitText = async (scene, needle, ms, label) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const hit = await run(`window.__e2e.active(${JSON.stringify(scene)}) && window.__e2e.texts(${JSON.stringify(scene)}).some((t) => t.includes(${JSON.stringify(needle)}))`);
      if (hit) return true;
      await sleep(100);
    }
    const shown = await run(`(() => { try { return window.__e2e.texts(${JSON.stringify(scene)}).join(' / '); } catch (e) { return String(e); } })()`);
    const active = await run(`window.__debrisGame.scene.getScenes(true).map((s) => s.scene.key).join('+')`);
    return check(false, `timed out waiting for "${needle}" in ${scene} (${label}); active scenes: ${active}; ${scene} shows: ${String(shown).slice(0, 400)}`);
  };
  const click = async (scene, label) => check(await run(`window.__e2e.click(${JSON.stringify(scene)}, ${JSON.stringify(label)})`), `clicked ${label}`);
  const gameState = () => run(`(() => { const g = window.__e2e.scene('Game'); const s = g && g.latestSnapshot; return s ? { tick: s.tick, state: s.state, ships: s.ships.map((x) => x.slotIndex), entities: s.entities.length, overlay: s.overlayLines } : null; })()`);
  const waitGame = async (pred, ms, label) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const s = await gameState(); if (s && pred(s)) return s; await sleep(100); }
    check(false, `timed out: ${label} (last state ${JSON.stringify(await gameState())})`); return null;
  };
  const fill = async (values) => run(`window.__e2e.fill('Online', ${JSON.stringify(values)})`);
  const toOnline = () => run(`(() => { const g = window.__debrisGame; g.scene.getScenes(true).forEach((s) => g.scene.stop(s.scene.key)); g.scene.start('Online'); return true; })()`);

  // Wait for the real boot (assets) to finish, then go straight to the Online screen.
  for (let i = 0; i < 300 && !(await run(`!!window.__debrisGame && window.__debrisGame.scene.isActive('Splash')`)); i += 1) await sleep(100);
  await toOnline();

  log('1. status screen reads the server');
  await waitText('Online', 'Players: 0/4', 15000, 'status');
  const texts1 = await run(`window.__e2e.texts('Online')`);
  check(texts1.join('\n').includes('Password required'), 'shows that a password is required');
  check(texts1.join('\n').includes('Local Test') || texts1.join('\n').includes('Server'), 'shows the server name');

  log('2. joining without the password is refused in words');
  await fill({ initials1: 'MAS' });
  await click('Online', 'JOIN');
  await waitText('Online', 'Wrong password', 15000, 'reject message');
  await click('Online', 'BACK');
  await waitText('Online', 'Players: 0/4', 15000, 'status again');

  log('3. with the password, two local players, the lobby shows both');
  await click('Online', 'PLAYERS ON THIS PC');
  check((await run(`window.__e2e.texts('Online')`)).some((t) => t.includes('PLAYERS ON THIS PC: 2')), 'toggled to two local players');
  check((await run(`window.__e2e.texts('Online')`)).some((t) => t.includes('PLAYER 1 INITIALS: MAS')), 'the first player\'s initials were remembered from the last visit');
  await click('Online', 'JOIN'); // player 2 has no initials yet
  check((await run(`window.__e2e.texts('Online')`)).some((t) => t.includes('Enter three letters')), 'joining is blocked until every player has initials');
  check(await run(`window.__e2e.active('Online') && window.__e2e.scene('Online').session === undefined`), 'no connection was made');
  check((await fill({ initials1: 'MAS', initials2: 'ZED', password: PASSWORD })).includes('initials2=ZED'), 'filled initials for both players and the password');
  await click('Online', 'JOIN');
  await waitText('Online', 'PLAYER 2', 20000, 'lobby with two players');
  const lobby = (await run(`window.__e2e.texts('Online')`)).join('\n');
  check(/PLAYER 1\s+\[YOU, LEADER\]/.test(lobby) && /PLAYER 2\s+\[YOU\]/.test(lobby), `lobby marks both slots YOU and the first LEADER (${JSON.stringify(lobby.split('\n').filter((l) => l.startsWith('PLAYER')))})`);
  check(lobby.includes('2/4 players'), 'lobby counts 2/4 players');

  log('4. START puts the real client into the match');
  await click('Online', 'START');
  const first = await waitGame((s) => s.state === 'playing' && s.ships.includes(0) && s.ships.includes(1), 30000, 'match snapshots with both ships');
  check(!!first, 'the Game scene receives snapshots with ships 0 and 1');
  await sleep(1500);
  const later = await gameState();
  check(later && first && later.tick > first.tick + 10, `snapshots keep coming (tick ${first && first.tick} -> ${later && later.tick})`);

  log('5. a dropped connection is won back inside the window');
  await run(`window.__e2e.scene('Game').clientSession.connection.close(); true`);
  const sawBanner = await (async () => {
    for (let i = 0; i < 60; i += 1) { if ((await run(`window.__e2e.texts('Game').some((t) => t.includes('RECONNECTING'))`))) return true; await sleep(100); }
    return false;
  })();
  check(sawBanner, 'the RECONNECTING banner appears');
  const tickAtDrop = (await gameState())?.tick ?? 0;
  const back = await waitGame((s) => s.tick !== tickAtDrop && s.state === 'playing', 20000, 'snapshots after reconnecting');
  check(!!back, 'snapshots resume after the reconnect');
  // The banner goes when the server's join answer arrives, which can trail the first resumed snapshot a little.
  const bannerGone = await (async () => {
    for (let i = 0; i < 50; i += 1) { if (!(await run(`window.__e2e.texts('Game').some((t) => t.includes('RECONNECTING'))`))) return true; await sleep(100); }
    return false;
  })();
  check(bannerGone, 'the banner goes away');
  check(await run(`window.__e2e.active('Game')`), 'still in the match, not bounced to a menu');

  log('6. leaving mid-match: the match ends with nobody left');
  await run(`window.__e2e.scene('Game').clientSession.stop(); true`);
  await sleep(500);

  log('7. competitive vs a bot that leaves: the survivor wins and returns to the lobby');
  await toOnline();
  await waitText('Online', 'Players:', 30000, 'status after the previous match');
  // The previous match must have ended for the lobby to accept joiners again.
  for (let i = 0; i < 100; i += 1) { if ((await run(`window.__e2e.texts('Online').some((t) => t.includes('Waiting in the lobby'))`))) break; await sleep(200); }
  // The "players on this PC" choice is remembered from step 3 - this part is one player.
  if ((await run(`window.__e2e.texts('Online')`)).some((t) => t.includes('PLAYERS ON THIS PC: 2'))) await click('Online', 'PLAYERS ON THIS PC');
  check((await run(`window.__e2e.texts('Online')`)).some((t) => t.includes('PLAYERS ON THIS PC: 1')), 'one player on this PC');
  await fill({ initials1: 'MAS', password: PASSWORD });
  await click('Online', 'JOIN');
  await waitText('Online', 'PLAYER 1', 20000, 'lobby (one player)');
  await click('Online', 'MODE');
  await waitText('Online', 'COMPETITIVE', 10000, 'competitive mode');
  // The opponent: a separate process that joins, then leaves 3s into the match.
  const electronBin = process.execPath;
  const bot = spawn(electronBin, [path.join(__dirname, 'smoke-main.js'), `--url=${URL_}`, '--scenario=bot', `--password=${PASSWORD}`, '--leaveAfter=3000'], { stdio: ['ignore', 'pipe', 'pipe'] });
  bot.stdout.on('data', (d) => process.stdout.write(`  [bot] ${d}`));
  await waitText('Online', '2/4 players', 30000, 'the bot to join');
  // The end screen is up for about a second - too brief to catch by polling. So wrap the client's own
  // overlay method once: it is called every frame with whatever the host's snapshot says, and we just note
  // what it was given. Installed BEFORE START, and the driver then stays quiet while the scene switches:
  // script injected into the page in that instant coincided with the connection being dropped.
  await run(`(() => {
    const g = window.__e2e.scene('Game');
    window.__endScreen = { lines: new Set(), states: new Set() };
    const original = g.applyClientOverlay.bind(g);
    g.applyClientOverlay = (state, lines) => { window.__endScreen.states.add(state); lines.forEach((l) => window.__endScreen.lines.add(l)); return original(state, lines); };
    return true;
  })()`);
  await sleep(1500);
  await click('Online', 'START');
  await sleep(1000);
  await waitGame((s) => s.state === 'playing' && s.ships.length === 2, 30000, 'a two-ship competitive match');
  check(true, 'competitive match under way with the bot');
  // The bot leaves, its seat is held 3s, then released: the client's ship is the last one standing.
  await waitText('Online', 'PLAYER 1', 60000, 'back in the lobby after the match');
  const endScreen = await run(`({ lines: [...window.__endScreen.lines], states: [...window.__endScreen.states] })`);
  check(endScreen.states.includes('gameOver'), `the client was told the round is over (states seen: ${JSON.stringify(endScreen.states)})`);
  check(endScreen.lines.includes('PLAYER 1 WINS'), `the host announced the winner to the client (${JSON.stringify(endScreen.lines)})`);
  check(endScreen.lines.includes('RETURNING TO LOBBY...'), 'the host told the client it is returning to the lobby');
  const after = (await run(`window.__e2e.texts('Online')`)).join('\n');
  check(/PLAYER 1\s+\[YOU, LEADER\]/.test(after), 'back in the same lobby, still the leader, same session');
  check(await run(`window.__e2e.active('Online') && !window.__e2e.active('Game')`), 'the Game scene has been left');

  await run(`window.__e2e.scene('Online').session && window.__e2e.scene('Online').session.stop(); true`);
  log(failures.length === 0 ? 'PASS' : `FAIL (${failures.length})`);
  app.exit(failures.length === 0 ? 0 : 1);
});
setTimeout(() => { log('FAIL: e2e exceeded 5 minutes'); app.exit(1); }, 300000);
