// Spike only - NOT the real server. Question being answered: can Electron
// running headless (xvfb) on Linux host WebRTC data channels to a remote
// client at ~60 Hz x ~6 KB, with the UDP ports/IP we expect?
//
//   electron . --role=server [--port=8765] [--udp=50000-50100] [--stun=1]
//   electron . --role=client --url=ws://debris.g33k.de:8765 [--seconds=10]
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const args = Object.fromEntries(
  process.argv.slice(1).filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('=');
    return [k, v ?? '1'];
  }),
);
const role = args.role === 'client' ? 'client' : 'server';

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      // Spike convenience: renderer may require('ws'). The real server
      // would keep contextIsolation and bridge via IPC like debrisLan.
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false, // hidden windows otherwise throttle timers
    },
  });
  const wc = win.webContents;
  wc.on('console-message', (_e, _lvl, msg) => console.log(msg));
  wc.on('render-process-gone', (_e, d) => { console.log('RENDERER GONE', d.reason); app.exit(2); });

  console.log(`electron ${process.versions.electron} / chromium ${process.versions.chrome} / role=${role}`);
  console.log(`setWebRTCUDPPortRange available: ${typeof wc.setWebRTCUDPPortRange === 'function'}`);
  if (args.udp && typeof wc.setWebRTCUDPPortRange === 'function') {
    const [min, max] = args.udp.split('-').map(Number);
    wc.setWebRTCUDPPortRange({ min, max });
    console.log(`UDP port range pinned to ${min}-${max}`);
  }
  wc.setWebRTCIPHandlingPolicy('default_public_interface_only');

  await win.loadFile(path.join(__dirname, 'page.html'), { query: { ...args, role } });
});
app.on('window-all-closed', () => app.quit());
