const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hydro', {
  getState: () => ipcRenderer.invoke('get-state'),
  add: ml => ipcRenderer.invoke('add', ml),
  setType: t => ipcRenderer.invoke('set-type', t),
  undo: () => ipcRenderer.invoke('undo'),
  saveSettings: patch => ipcRenderer.invoke('save-settings', patch),
  calcGoal: (w, a) => ipcRenderer.invoke('calc-goal', w, a),
  snooze: min => ipcRenderer.invoke('snooze', min),
  closePopup: () => ipcRenderer.invoke('close-popup'),
  showMain: () => ipcRenderer.invoke('show-main'),
  remindNow: () => ipcRenderer.invoke('remind-now'),
  onState: cb => ipcRenderer.on('state', (_, s) => cb(s)),
});
