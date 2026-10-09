const { contextBridge, ipcRenderer } = require('electron');

// The safe bridge nodeIntegration: false / contextIsolation: true forces -
// the renderer (the game itself, loaded via loadURL/loadFile in main.js)
// gets exactly this surface, nothing else of Node's. See
// `game/src/systems/LanDiscovery.ts` for the renderer-side wrapper that
// actually calls this, and `main.js` for what each channel does.
contextBridge.exposeInMainWorld('debrisLan', {
  startListening: (port) => ipcRenderer.send('lan:startListening', port),
  stopListening: () => ipcRenderer.send('lan:stopListening'),
  broadcast: (port, message) => ipcRenderer.send('lan:broadcast', port, message),
  sendTo: (address, port, message) => ipcRenderer.send('lan:sendTo', address, port, message),
  onMessage: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('lan:message', listener);
    return () => ipcRenderer.removeListener('lan:message', listener);
  },
});
