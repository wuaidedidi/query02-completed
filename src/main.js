const { app, BrowserWindow, ipcMain, clipboard } = require('electron');
const path = require('path');

ipcMain.handle('copy-text', (_event, text) => {
  clipboard.writeText(String(text ?? ''));
  return true;
});

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 1040,
    minHeight: 720,
    title: 'Prompt Rollout Board',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
