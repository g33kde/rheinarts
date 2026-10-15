const { contextBridge, ipcRenderer } = require('electron');

// The only surface the game page gets from the server's main process -
// the counterpart of desktop/preload.js's `debrisLan`. Mirrored in the
// game as `window.debrisServer` (game/src/systems/ServerBridge.ts).
contextBridge.exposeInMainWorld('debrisServer', {
  // Tells the main process this page's signaling listener is registered, so held messages can be delivered.
  ready: () => ipcRenderer.send('server:ready'),
  // What the game page last knew about the lobby (who is on, in a match or not) - the main process answers signaling-socket status queries from it.
  setStatus: (status) => ipcRenderer.send('server:status', status),
  // A finished match; the main process posts the scores (it holds the API key, this page never does).
  reportResult: (report) => ipcRenderer.send('server:result', report),
  getConfig: () => ipcRenderer.invoke('server:config'),
  onSignal: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('server:signal-in', listener);
    return () => ipcRenderer.removeListener('server:signal-in', listener);
  },
  // A signaling socket closed (so a half-finished handshake from it can be dropped).
  onPeerClosed: (callback) => {
    const listener = (_event, peerId) => callback(peerId);
    ipcRenderer.on('server:peer-closed', listener);
    return () => ipcRenderer.removeListener('server:peer-closed', listener);
  },
  sendSignal: (peerId, data) => ipcRenderer.send('server:signal-out', peerId, data),
  log: (level, message) => ipcRenderer.send('server:log', level, message),
});
