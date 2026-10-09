const { app, BrowserWindow } = require('electron');

// Sprint 1 (docs/roadmap.md's "Windows + LAN multiplayer") - a bare
// Electron shell around the existing web build, nothing else. Points at
// the game's own Vite dev server rather than loading built files
// directly: same dev loop the browser build already has (edit, save,
// see it), and sidesteps the production build's `base: '/debris/'` path
// prefix entirely - that's Sprint 2's problem once an actual installer
// needs to load bundled static files instead.
const GAME_DEV_SERVER_URL = 'http://localhost:5175';

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

  win.loadURL(GAME_DEV_SERVER_URL);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // Windows/Linux convention - quit with the last window, unlike macOS.
  // Debris is Windows-first here, so this is the right default even
  // though Electron's own template guards it behind a platform check.
  app.quit();
});
