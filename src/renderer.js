const storageKeys = {
  prompts: 'prompt-board.prompts',
  rootDir: 'prompt-board.root-dir'
};

const folderColumns = [
  { name: 'R1_GPT5.4', label: 'GPT5.4' },
  { name: 'R2_Gemini 3.1 pro', label: 'Gemini 3.1 Pro' },
  { name: 'R3_DeepSeek-v4', label: 'DeepSeek-v4' },
  { name: 'R4_Doubao-Seed-2.0-Code', label: 'Doubao-Seed-2.0-Code' },
  { name: 'R5', label: 'R5' }
];

const r5RotationHint = '按行轮转';
const promptCount = 7;
const columnsPerRow = folderColumns.length;
const patchCommand = `p=$(ls *.patch 2>/dev/null | sed 's/.patch//' | sort -n | tail -1 | awk '{print $1+1}'); p="\${p:-1}.patch"; printf "即将生成: $p\\n"; git add -A -- ':!*.patch' && git diff --cached > "$p" && git reset --hard HEAD && git clean -fd -e "*.patch" && printf "\\n\\033[32m✅ 成功：$p 已生成，环境已重置\\033[0m\\n\\n"`;

const idleView = document.getElementById('idleView');
const setupView = document.getElementById('setupView');
const boardView = document.getElementById('boardView');
const openSetupBtn = document.getElementById('openSetupBtn');
const importDirectoryBtn = document.getElementById('importDirectoryBtn');
const patchShortcutBtn = document.getElementById('patchShortcutBtn');
const backBtn = document.getElementById('backBtn');
const clearDraftBtn = document.getElementById('clearDraftBtn');
const setupForm = document.getElementById('setupForm');
const promptList = document.getElementById('promptList');
const boardGrid = document.getElementById('boardGrid');
const copyToast = document.getElementById('copyToast');
const editPromptsBtn = document.getElementById('editPromptsBtn');
const reloadDirectoryBtn = document.getElementById('reloadDirectoryBtn');
const rootStatusLabel = document.getElementById('rootStatusLabel');
const flowStatusLabel = document.getElementById('flowStatusLabel');
const promptInputTemplate = document.getElementById('promptInputTemplate');
const cellTemplate = document.getElementById('cellTemplate');
const cellEditorModal = document.getElementById('cellEditorModal');
const closeEditorBtn = document.getElementById('closeEditorBtn');
const editorTitle = document.getElementById('editorTitle');
const editorSubtitle = document.getElementById('editorSubtitle');
const editorHint = document.getElementById('editorHint');
const sessionidInput = document.getElementById('sessionidInput');
const trajectoryInput = document.getElementById('trajectoryInput');
const writeCellBtn = document.getElementById('writeCellBtn');

let toastTimer = null;

const state = {
  mode: 'idle',
  rootDir: loadStoredString(storageKeys.rootDir),
  prompts: loadDraftPrompts(),
  cells: createEmptyCells(),
  activeCell: null
};

function loadStoredString(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function saveStoredString(key, value) {
  try {
    localStorage.setItem(key, String(value ?? ''));
  } catch {
    // Local storage is only a convenience cache.
  }
}

function createCell(rowIndex, columnIndex) {
  const folder = folderColumns[columnIndex];
  return {
    folderName: folder.name,
    folderLabel: folder.label,
    round: rowIndex + 1,
    sessionid: '',
    trajectory: '',
    sessionExists: false,
    trajectoryExists: false,
    patchExists: false,
    saved: false
  };
}

function createEmptyCells() {
  return Array.from({ length: promptCount }, (_row, rowIndex) =>
    Array.from({ length: columnsPerRow }, (_column, columnIndex) => createCell(rowIndex, columnIndex))
  );
}

function normalizeSessionid(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function normalizeTrajectory(value) {
  return String(value ?? '').replace(/\r\n/g, '\n');
}

function getCell(rowIndex, columnIndex) {
  if (!state.cells[rowIndex]) {
    state.cells[rowIndex] = [];
  }

  if (!state.cells[rowIndex][columnIndex]) {
    state.cells[rowIndex][columnIndex] = createCell(rowIndex, columnIndex);
  }

  return state.cells[rowIndex][columnIndex];
}

function showToast(message, isError = false) {
  if (!copyToast) {
    return;
  }

  copyToast.textContent = message;
  copyToast.classList.toggle('error', isError);
  copyToast.classList.add('visible');

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    copyToast.classList.remove('visible');
    toastTimer = null;
  }, 2200);
}

function loadDraftPrompts() {
  try {
    const raw = localStorage.getItem(storageKeys.prompts);
    if (!raw) {
      return Array.from({ length: promptCount }, () => '');
    }

    const parsed = JSON.parse(raw);
    return Array.from({ length: promptCount }, (_item, index) => String(parsed[index] ?? ''));
  } catch {
    return Array.from({ length: promptCount }, () => '');
  }
}

function saveDraftPrompts(prompts) {
  localStorage.setItem(storageKeys.prompts, JSON.stringify(prompts));
}

function updateTopbarStatus() {
  rootStatusLabel.textContent = state.rootDir ? `工作目录：${state.rootDir}` : '未导入工作目录';

  const labels = {
    idle: '先导入目录，再填写 7 个 prompt',
    setup: '第 2 步：填写 7 个 prompt',
    board: '第 3 步：写入 sessionid 和轨迹'
  };
  flowStatusLabel.textContent = labels[state.mode] || labels.idle;
}

function normalizeSnapshotCells(cells) {
  if (!Array.isArray(cells)) {
    return createEmptyCells();
  }

  return Array.from({ length: promptCount }, (_row, rowIndex) =>
    Array.from({ length: columnsPerRow }, (_column, columnIndex) => {
      const fallback = createCell(rowIndex, columnIndex);
      return {
        ...fallback,
        ...(cells[rowIndex]?.[columnIndex] || {})
      };
    })
  );
}

function setMode(mode) {
  state.mode = mode;
  idleView.classList.toggle('hidden', mode !== 'idle');
  setupView.classList.toggle('hidden', mode !== 'setup');
  boardView.classList.toggle('hidden', mode !== 'board');
  idleView.classList.toggle('active', mode === 'idle');
  setupView.classList.toggle('active', mode === 'setup');
  boardView.classList.toggle('active', mode === 'board');
  updateTopbarStatus();
}

function renderPromptInputs(prompts) {
  promptList.innerHTML = '';
  prompts.forEach((prompt, index) => {
    const fragment = promptInputTemplate.content.cloneNode(true);
    const label = fragment.querySelector('.prompt-label');
    const textarea = fragment.querySelector('.prompt-textarea');
    label.textContent = `Prompt ${index + 1}`;
    textarea.placeholder = `输入第 ${index + 1} 行 Prompt`;
    textarea.value = prompt;
    textarea.dataset.index = String(index);
    textarea.addEventListener('input', (event) => {
      state.prompts[index] = event.currentTarget.value;
      saveDraftPrompts(state.prompts);
    });
    promptList.appendChild(fragment);
  });
}

async function copyText(text, successMessage) {
  try {
    if (window.electronAPI?.copyText) {
      await window.electronAPI.copyText(text);
    } else {
      await navigator.clipboard.writeText(text);
    }

    showToast(successMessage);
  } catch (error) {
    console.error('Copy failed:', error);
    showToast('复制失败，请重试', true);
  }
}

async function loadDirectoryIntoState(rootDir) {
  const result = await window.electronAPI?.loadBoardDirectory(rootDir);
  if (!result?.ok) {
    throw new Error(result?.error || '目录读取失败');
  }

  state.cells = normalizeSnapshotCells(result.cells);
  return result;
}

async function startDirectoryWatch(rootDir) {
  if (window.electronAPI?.startBoardWatch) {
    const result = await window.electronAPI.startBoardWatch(rootDir);
    if (!result?.ok) {
      throw new Error(result?.error || '目录监听失败');
    }
  }
}

async function importDirectory() {
  try {
    const directory = await window.electronAPI?.selectBoardDirectory();
    if (!directory) {
      return;
    }

    await loadDirectoryIntoState(directory);
    await startDirectoryWatch(directory);
    state.rootDir = directory;
    saveStoredString(storageKeys.rootDir, directory);
    state.prompts = loadDraftPrompts();
    renderPromptInputs(state.prompts);
    setMode('setup');
    showToast('目录已导入，请填写 7 个 prompt');
  } catch (error) {
    console.error('Import directory failed:', error);
    showToast(error.message || '目录导入失败', true);
  }
}

function validatePrompts(prompts) {
  return prompts.every((prompt) => prompt.trim().length > 0);
}

async function openBoardFromCurrentPrompts() {
  if (!state.rootDir) {
    showToast('请先导入目录', true);
    setMode('idle');
    return;
  }

  try {
    await loadDirectoryIntoState(state.rootDir);
    await startDirectoryWatch(state.rootDir);
    saveDraftPrompts(state.prompts);
    renderBoard();
    setMode('board');
  } catch (error) {
    console.error('Open board failed:', error);
    showToast(error.message || '目录读取失败', true);
  }
}

function formatBytes(text) {
  const bytes = new Blob([String(text ?? '')]).size;
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function hasFieldValue(value) {
  return String(value ?? '').trim().length > 0;
}

function getCellStatus(cell) {
  const hasSession = hasFieldValue(cell.sessionid);
  const hasTrajectory = hasFieldValue(cell.trajectory);
  if (hasSession && hasTrajectory && cell.saved && cell.patchExists) {
    return '完美';
  }
  if (hasSession && hasTrajectory && cell.saved) {
    return '已保存';
  }
  if (cell.patchExists) {
    return 'patch已有';
  }
  if (hasSession || hasTrajectory || cell.sessionExists || cell.trajectoryExists) {
    return '待补齐';
  }
  return '未开始';
}

function getPatchLabel(cell) {
  if (cell.saved && cell.patchExists) {
    return '完美';
  }
  if (cell.patchExists) {
    return 'patch已有';
  }
  return 'patch缺失';
}

function getFieldTone(value) {
  return hasFieldValue(value) ? 'ready' : 'missing';
}

function getPatchTone(cell) {
  if (cell.saved && cell.patchExists) {
    return 'perfect';
  }
  if (cell.patchExists) {
    return 'ready';
  }
  return 'missing';
}

function setStateText(element, text, tone) {
  element.textContent = text;
  element.classList.remove('state-missing', 'state-ready', 'state-perfect');
  element.classList.add(`state-${tone}`);
}

function buildDuplicateStats() {
  const sessionCounts = new Map();
  const trajectoryCounts = new Map();

  state.cells.forEach((row) => {
    row.forEach((cell) => {
      const sessionKey = normalizeSessionid(cell.sessionid);
      const trajectoryKey = normalizeTrajectory(cell.trajectory).trim();

      if (sessionKey) {
        sessionCounts.set(sessionKey, (sessionCounts.get(sessionKey) || 0) + 1);
      }

      if (trajectoryKey) {
        trajectoryCounts.set(trajectoryKey, (trajectoryCounts.get(trajectoryKey) || 0) + 1);
      }
    });
  });

  return { sessionCounts, trajectoryCounts };
}

function getFieldLabel(value, fileExists, isTrajectory = false) {
  if (hasFieldValue(value)) {
    return isTrajectory ? formatBytes(value) : '已填';
  }

  return fileExists ? '空文件' : '未填';
}

function getCellLocation(rowIndex, columnIndex) {
  const folder = folderColumns[columnIndex];
  return `第 ${rowIndex + 1} 行 · 第 ${columnIndex + 1} 列 · ${folder.label}`;
}

function renderBoard() {
  boardGrid.innerHTML = '';
  const duplicateStats = buildDuplicateStats();

  state.prompts.forEach((prompt, rowIndex) => {
    for (let columnIndex = 0; columnIndex < columnsPerRow; columnIndex += 1) {
      const cellData = getCell(rowIndex, columnIndex);
      const fragment = cellTemplate.content.cloneNode(true);
      const cell = fragment.querySelector('.cell');
      const rowBadge = fragment.querySelector('.row-badge');
      const modelName = fragment.querySelector('.model-name');
      const cellNote = fragment.querySelector('.cell-note');
      const statusPill = fragment.querySelector('.status-pill');
      const sessionState = fragment.querySelector('.session-state');
      const trajectoryState = fragment.querySelector('.trajectory-state');
      const patchState = fragment.querySelector('.patch-state');
      const copyButton = fragment.querySelector('.copy-button');
      const editButton = fragment.querySelector('.edit-button');
      const sessionKey = normalizeSessionid(cellData.sessionid);
      const trajectoryKey = normalizeTrajectory(cellData.trajectory).trim();
      const sessionDuplicate = sessionKey && (duplicateStats.sessionCounts.get(sessionKey) || 0) > 1;
      const trajectoryDuplicate = trajectoryKey && (duplicateStats.trajectoryCounts.get(trajectoryKey) || 0) > 1;
      const isComplete = Boolean(cellData.saved && hasFieldValue(cellData.sessionid) && hasFieldValue(cellData.trajectory));
      const hasPartialData = !isComplete && (hasFieldValue(cellData.sessionid) || hasFieldValue(cellData.trajectory) || cellData.sessionExists || cellData.trajectoryExists);
      const isDuplicate = sessionDuplicate || trajectoryDuplicate;
      const isPerfect = isComplete && cellData.patchExists;

      rowBadge.textContent = `第 ${rowIndex + 1} 行 · 第 ${columnIndex + 1} 列`;
      modelName.textContent = cellData.folderLabel;
      if (cellData.folderName === 'R5') {
        cellNote.textContent = r5RotationHint;
        cellNote.classList.add('visible');
      }
      statusPill.textContent = isDuplicate ? '重复' : getCellStatus(cellData);
      setStateText(sessionState, getFieldLabel(cellData.sessionid, cellData.sessionExists), getFieldTone(cellData.sessionid));
      setStateText(trajectoryState, getFieldLabel(cellData.trajectory, cellData.trajectoryExists, true), getFieldTone(cellData.trajectory));
      setStateText(patchState, getPatchLabel(cellData), getPatchTone(cellData));
      cell.classList.toggle('completed', isComplete);
      cell.classList.toggle('partial', hasPartialData);
      cell.classList.toggle('duplicate', isDuplicate);
      cell.classList.toggle('perfect', isPerfect);

      copyButton.disabled = !prompt.trim();
      copyButton.addEventListener('click', () => {
        copyText(prompt, 'prompt 已复制');
      });

      editButton.addEventListener('click', () => {
        openEditor(rowIndex, columnIndex);
      });

      boardGrid.appendChild(fragment);
    }
  });
}

function openEditor(rowIndex, columnIndex) {
  const cellData = getCell(rowIndex, columnIndex);
  state.activeCell = { rowIndex, columnIndex };

  editorTitle.textContent = getCellLocation(rowIndex, columnIndex);
  editorSubtitle.textContent = `目标：${cellData.folderName}/${cellData.round}.txt 和 ${cellData.round}.json`;
  sessionidInput.value = cellData.sessionid || '';
  trajectoryInput.value = cellData.trajectory || '';
  cellEditorModal.classList.remove('hidden');
  cellEditorModal.setAttribute('aria-hidden', 'false');
  updateEditorHint();
  sessionidInput.focus();
}

function closeEditor() {
  state.activeCell = null;
  cellEditorModal.classList.add('hidden');
  cellEditorModal.setAttribute('aria-hidden', 'true');
  editorHint.classList.remove('error');
}

function setEditorError(message) {
  editorHint.textContent = message;
  editorHint.classList.add('error');
}

function updateEditorHint() {
  const sessionid = normalizeSessionid(sessionidInput.value);
  const trajectory = normalizeTrajectory(trajectoryInput.value);
  const ready = Boolean(sessionid && trajectory.trim());

  writeCellBtn.disabled = !ready;
  editorHint.classList.remove('error');
  editorHint.textContent = ready
    ? `轨迹大小：${formatBytes(trajectory)}`
    : 'sessionid 和轨迹都填写后才能确定写入。';
}

function findDuplicate(rowIndex, columnIndex, sessionid, trajectory) {
  const normalizedSessionid = normalizeSessionid(sessionid);
  const normalizedTrajectory = normalizeTrajectory(trajectory).trim();

  for (let otherRow = 0; otherRow < promptCount; otherRow += 1) {
    for (let otherColumn = 0; otherColumn < columnsPerRow; otherColumn += 1) {
      if (otherRow === rowIndex && otherColumn === columnIndex) {
        continue;
      }

      const cell = getCell(otherRow, otherColumn);
      if (normalizedSessionid && normalizeSessionid(cell.sessionid) === normalizedSessionid) {
        return {
          type: 'sessionid',
          location: getCellLocation(otherRow, otherColumn)
        };
      }

      if (normalizedTrajectory && normalizeTrajectory(cell.trajectory).trim() === normalizedTrajectory) {
        return {
          type: '轨迹',
          location: getCellLocation(otherRow, otherColumn)
        };
      }
    }
  }

  return null;
}

function looksLikeSessionid(sessionid) {
  if (sessionid.length < 25) {
    return false;
  }

  return sessionid.includes(':') && sessionid.includes('_') && sessionid.includes('.');
}

async function writeActiveCell() {
  if (!state.activeCell) {
    return;
  }

  const { rowIndex, columnIndex } = state.activeCell;
  const cellData = getCell(rowIndex, columnIndex);
  const sessionid = normalizeSessionid(sessionidInput.value);
  const trajectory = normalizeTrajectory(trajectoryInput.value);

  if (!sessionid || !trajectory.trim()) {
    setEditorError('sessionid 和轨迹都不能为空。');
    return;
  }

  if (!looksLikeSessionid(sessionid)) {
    setEditorError('sessionid 格式看起来不太对，请重新粘贴。');
    return;
  }

  const duplicate = findDuplicate(rowIndex, columnIndex, sessionid, trajectory);
  if (duplicate) {
    const message = `${duplicate.type} 与 ${duplicate.location} 重复`;
    setEditorError(message);
    showToast(message, true);
    return;
  }

  writeCellBtn.disabled = true;
  writeCellBtn.textContent = '写入中...';

  try {
    const result = await window.electronAPI?.saveBoardCell({
      rootDir: state.rootDir,
      folderName: cellData.folderName,
      round: cellData.round,
      sessionid,
      trajectory
    });

    if (!result?.ok) {
      throw new Error(result?.error || '写入失败');
    }

    state.cells[rowIndex][columnIndex] = {
      ...cellData,
      sessionid,
      trajectory,
      sessionExists: true,
      trajectoryExists: true,
      saved: true
    };

    renderBoard();
    closeEditor();
    showToast(`写入成功：${cellData.folderLabel} / ${cellData.round}.txt + ${cellData.round}.json`);
  } catch (error) {
    console.error('Write cell failed:', error);
    const message = error.message || '写入失败，请检查目录权限';
    setEditorError(message);
    showToast(message, true);
  } finally {
    writeCellBtn.textContent = '确定写入';
    if (!cellEditorModal.classList.contains('hidden')) {
      const ready = Boolean(normalizeSessionid(sessionidInput.value) && normalizeTrajectory(trajectoryInput.value).trim());
      writeCellBtn.disabled = !ready;
    }
  }
}

function handleSetupSubmit(event) {
  event.preventDefault();
  const textareas = Array.from(setupForm.querySelectorAll('textarea'));
  const prompts = textareas.map((textarea) => textarea.value.trim());

  if (!validatePrompts(prompts)) {
    showToast('请先填写完整的 7 个 prompt', true);
    return;
  }

  state.prompts = prompts;
  openBoardFromCurrentPrompts();
}

function startPromptEditing() {
  renderPromptInputs(state.prompts);
  setMode('setup');
}

async function reloadDirectory() {
  if (!state.rootDir) {
    showToast('请先导入目录', true);
    return;
  }

  try {
    await loadDirectoryIntoState(state.rootDir);
    renderBoard();
    showToast('目录已重新读取');
  } catch (error) {
    console.error('Reload directory failed:', error);
    showToast(error.message || '目录读取失败', true);
  }
}

openSetupBtn.addEventListener('click', importDirectory);
importDirectoryBtn.addEventListener('click', importDirectory);
patchShortcutBtn.addEventListener('click', () => {
  copyText(patchCommand, 'patch 命令已复制');
});
backBtn.addEventListener('click', () => setMode('idle'));
clearDraftBtn.addEventListener('click', () => {
  state.prompts = Array.from({ length: promptCount }, () => '');
  saveDraftPrompts(state.prompts);
  renderPromptInputs(state.prompts);
});
setupForm.addEventListener('submit', handleSetupSubmit);
editPromptsBtn.addEventListener('click', startPromptEditing);
reloadDirectoryBtn.addEventListener('click', reloadDirectory);
closeEditorBtn.addEventListener('click', closeEditor);
writeCellBtn.addEventListener('click', writeActiveCell);
sessionidInput.addEventListener('input', updateEditorHint);
trajectoryInput.addEventListener('input', updateEditorHint);
cellEditorModal.addEventListener('click', (event) => {
  if (event.target?.dataset?.closeEditor) {
    closeEditor();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !cellEditorModal.classList.contains('hidden')) {
    closeEditor();
  }
});

if (window.electronAPI?.onBoardDirectoryUpdated) {
  window.electronAPI.onBoardDirectoryUpdated((snapshot) => {
    if (!snapshot?.ok) {
      showToast(snapshot?.error || '目录刷新失败', true);
      return;
    }

    if (snapshot.rootDir !== state.rootDir) {
      return;
    }

    state.cells = normalizeSnapshotCells(snapshot.cells);
    if (state.mode === 'board') {
      renderBoard();
    }
  });
}

updateTopbarStatus();
setMode('idle');
