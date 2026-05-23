const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  selectBoardDirectory: () => ipcRenderer.invoke('select-board-directory'),
  loadBoardDirectory: (rootDir) => ipcRenderer.invoke('load-board-directory', rootDir),
  saveBoardCell: (payload) => ipcRenderer.invoke('save-board-cell', payload)
});
