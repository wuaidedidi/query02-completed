const { app, BrowserWindow, ipcMain, clipboard, dialog } = require('electron');
const fs = require('fs/promises');
const path = require('path');

const requiredFolders = [
  { name: 'R1_GPT5.4', label: 'GPT5.4' },
  { name: 'R2_Gemini 3.1 pro', label: 'Gemini 3.1 Pro' },
  { name: 'R3_DeepSeek-v4', label: 'DeepSeek-v4' },
  { name: 'R4_Doubao-Seed-2.0-Code', label: 'Doubao-Seed-2.0-Code' },
  { name: 'R5', label: 'R5' }
];

const roundCount = 7;

ipcMain.handle('copy-text', (_event, text) => {
  clipboard.writeText(String(text ?? ''));
  return true;
});

async function statDirectory(directoryPath) {
  try {
    const stats = await fs.stat(directoryPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function assertValidBoardDirectory(rootDir) {
  if (!rootDir || typeof rootDir !== 'string') {
    throw new Error('未选择目录');
  }

  const isRootDirectory = await statDirectory(rootDir);
  if (!isRootDirectory) {
    throw new Error('目录不存在或不可访问');
  }

  const missingFolders = [];
  for (const folder of requiredFolders) {
    const folderPath = path.join(rootDir, folder.name);
    const isFolder = await statDirectory(folderPath);
    if (!isFolder) {
      missingFolders.push(folder.name);
    }
  }

  if (missingFolders.length > 0) {
    throw new Error(`目录缺少文件夹：${missingFolders.join('、')}`);
  }
}

async function readFileIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadBoardDirectory(rootDir) {
  await assertValidBoardDirectory(rootDir);

  const cells = [];
  for (let rowIndex = 0; rowIndex < roundCount; rowIndex += 1) {
    const round = rowIndex + 1;
    const row = [];

    for (const folder of requiredFolders) {
      const folderPath = path.join(rootDir, folder.name);
      const txtPath = path.join(folderPath, `${round}.txt`);
      const jsonPath = path.join(folderPath, `${round}.json`);
      const [rawSessionid, rawTrajectory, sessionExists, trajectoryExists] = await Promise.all([
        readFileIfExists(txtPath),
        readFileIfExists(jsonPath),
        fileExists(txtPath),
        fileExists(jsonPath)
      ]);

      const sessionid = rawSessionid.replace(/\r\n/g, '\n').trim();
      const trajectory = rawTrajectory.replace(/\r\n/g, '\n');

      row.push({
        folderName: folder.name,
        folderLabel: folder.label,
        round,
        sessionid,
        trajectory,
        sessionExists,
        trajectoryExists,
        saved: Boolean(sessionid && trajectory.trim())
      });
    }

    cells.push(row);
  }

  return {
    ok: true,
    rootDir,
    folders: requiredFolders,
    cells
  };
}

ipcMain.handle('select-board-directory', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择工作目录',
    properties: ['openDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('load-board-directory', async (_event, rootDir) => {
  try {
    return await loadBoardDirectory(rootDir);
  } catch (error) {
    return {
      ok: false,
      error: error.message || '目录读取失败'
    };
  }
});

ipcMain.handle('save-board-cell', async (_event, payload) => {
  try {
    const rootDir = payload?.rootDir;
    const folderName = payload?.folderName;
    const round = Number(payload?.round);
    const sessionid = String(payload?.sessionid ?? '').trim();
    const trajectory = String(payload?.trajectory ?? '').replace(/\r\n/g, '\n');

    await assertValidBoardDirectory(rootDir);

    if (!requiredFolders.some((folder) => folder.name === folderName)) {
      throw new Error('目标文件夹不在允许范围内');
    }

    if (!Number.isInteger(round) || round < 1 || round > roundCount) {
      throw new Error('轮次编号不正确');
    }

    if (!sessionid || !trajectory.trim()) {
      throw new Error('sessionid 和轨迹都不能为空');
    }

    const folderPath = path.join(rootDir, folderName);
    const txtPath = path.join(folderPath, `${round}.txt`);
    const jsonPath = path.join(folderPath, `${round}.json`);

    await Promise.all([
      fs.writeFile(txtPath, sessionid, 'utf8'),
      fs.writeFile(jsonPath, trajectory, 'utf8')
    ]);

    return {
      ok: true,
      txtPath,
      jsonPath
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || '写入失败'
    };
  }
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
