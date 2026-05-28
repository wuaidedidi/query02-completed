const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  selectBoardDirectory: () => ipcRenderer.invoke('select-board-directory'),
  loadBoardDirectory: (rootDir) => ipcRenderer.invoke('load-board-directory', rootDir),
  readPromptFile: (rootDir) => ipcRenderer.invoke('read-prompt-file', rootDir),
  saveBoardCell: (payload) => ipcRenderer.invoke('save-board-cell', payload),
  startBoardWatch: (rootDir) => ipcRenderer.invoke('start-board-watch', rootDir),
  stopBoardWatch: () => ipcRenderer.invoke('stop-board-watch'),
  onBoardDirectoryUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('board-directory-updated', listener);
    return () => {
      ipcRenderer.removeListener('board-directory-updated', listener);
    };
  }
});
