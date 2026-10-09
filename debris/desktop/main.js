const { app, BrowserWindow } = require('electron');
const path = require('node:path');

// Sprint 1 (docs/roadmap.md's "Windows + LAN multiplayer") - a bare
// Electron shell around the existing web build, nothing else.
const GAME_DEV_SERVER_URL = 'http://localhost:5175';

// Sprint 2: a real installer has no dev server to point at - it loads
// the game's own `build:desktop` output from local disk instead
// (`../game/vite.config.ts`'s relative `base: './'`, specifically built
// for this rather than reusing the web build's `/debris/`-prefixed
// `dist/`, which would try to fetch assets from a path that doesn't
// exist on the filesystem).
//
// Packaged: electron-builder's `extraResources` (desktop/package.json)
// copies that build to `resources/game/` - resolved via
// `process.resourcesPath`, not `__dirname`, since `__dirname` points
// inside the asar-packed app code, not the resources directory sitting
// next to it.
// Unpackaged with ELECTRON_LOAD_BUILD=1: reads the build straight out of
// `../game/dist-desktop`, for testing the production build without
// going through electron-builder every time.
function resolveBuiltIndexPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'game', 'index.html');
  }
  return path.join(__dirname, '..', 'game', 'dist-desktop', 'index.html');
}

// 1280x800 preserves ARENA_WIDTH/ARENA_HEIGHT's 1920x1200 aspect ratio
// (1.6:1) - Phaser's own Scale.FIT mode (src/main.ts) handles the actual
// scaling/letterboxing, so this is just a reasonable default window
// size, not a number Phaser needs to match exactly.
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 854,
    minHeight: 534,
    backgroundColor: '#05050a', // COLORS.background - avoids a white flash before the page paints
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (app.isPackaged || process.env.ELECTRON_LOAD_BUILD === '1') {
    win.loadFile(resolveBuiltIndexPath());
  } else {
    win.loadURL(GAME_DEV_SERVER_URL);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // Windows/Linux convention - quit with the last window, unlike macOS.
  // Debris is Windows-first here, so this is the right default even
  // though Electron's own template guards it behind a platform check.
  app.quit();
});
