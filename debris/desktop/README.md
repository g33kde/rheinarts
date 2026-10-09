# Debris Desktop

`docs/roadmap.md`'s "Windows + LAN multiplayer" concept: an Electron
shell around the existing web build. No gameplay code is touched - if
it works in a browser today, it works identically here.

## Dev mode (Sprint 1)

```
npm install
npm run dev
```

Starts the game's own Vite dev server (`../game`) and an Electron
window pointed at it, together. Edit `../game/src` as usual; the
Electron window picks up changes the same way a browser tab would.

## Testing the production build without packaging

```
npm run preview
```

Builds the game with `../game`'s `build:desktop` script (relative
asset paths, loaded from local disk rather than a dev server - see
that script's own comment in `../game/vite.config.ts`) and opens it in
an unpackaged Electron window. Useful for checking the real build
actually loads before running the slower full packaging step below.

## Building the Windows installer (Sprint 2)

```
npm run dist
```

Runs `build:desktop`, then `electron-builder --win` to produce a real
NSIS installer under `release/`. **Must be run on an actual Windows
machine, or a Mac/Linux host with Wine installed for its x64
architecture specifically** - electron-builder shells out to Wine to
stamp the .exe's version info even when not code-signing, and that step
has no fallback. If `npm run dist` fails with something like
`cannot execute ... wine64: bad CPU type in executable`, that's this
Wine-on-non-Windows limitation, not a problem with the packaging config
- it means the unpacked app itself still built fine under
`release/win-unpacked/`, just not the final installer.

No code-signing certificate is configured yet, and no custom app icon -
both deliberately deferred rather than blocking the first installer.
