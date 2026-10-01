const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('UtangNative', {
  platform: 'desktop',
  load: () => ipcRenderer.sendSync('load'),
  save: json => ipcRenderer.send('save', json),
  share: (subject, text) => ipcRenderer.send('share', subject, text),
  onBackupSaved: cb => ipcRenderer.on('backup-saved', (_e, p) => cb(p))
});
