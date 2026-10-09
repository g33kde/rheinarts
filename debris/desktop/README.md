# Debris Desktop

Sprint 1 of `docs/roadmap.md`'s "Windows + LAN multiplayer" concept: a
bare Electron shell around the existing web build. No gameplay code is
touched - if it works in a browser today, it works identically here.

## Running it

```
npm install
npm run dev
```

This starts the game's own Vite dev server (`../game`) and an Electron
window pointed at it, together. Edit `../game/src` as usual; the
Electron window picks up changes the same way a browser tab would.

There is no installer yet - that's Sprint 2 (`docs/roadmap.md`), once a
build needs to load bundled static files instead of a dev server.
