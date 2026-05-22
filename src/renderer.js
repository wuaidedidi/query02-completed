const storageKeys = {
  prompts: 'prompt-board.prompts',
  session: 'prompt-board.session'
};

const modelColumns = [
  'GPT5.4',
  'Gemini 3.1 Pro',
  'DeepSeek-v4-Pro',
  'Doubao-Seed-2.0-Code',
  null
];

const fallbackCycle = ['MinMax-M2.7', 'GLM-5.1', 'Qwen3.6-Plus'];
const promptCount = 7;
const columnsPerRow = 5;

const state = {
  mode: 'idle',
  prompts: Array.from({ length: promptCount }, () => ''),
  completed: Array.from({ length: promptCount }, () => Array(columnsPerRow).fill(false)),
  resetTimer: null
};

const idleView = document.getElementById('idleView');
const setupView = document.getElementById('setupView');
const boardView = document.getElementById('boardView');
const openSetupBtn = document.getElementById('openSetupBtn');
const backBtn = document.getElementById('backBtn');
const clearDraftBtn = document.getElementById('clearDraftBtn');
const setupForm = document.getElementById('setupForm');
const promptList = document.getElementById('promptList');
const boardGrid = document.getElementById('boardGrid');
const copyToast = document.getElementById('copyToast');
const editPromptsBtn = document.getElementById('editPromptsBtn');
const restartBtn = document.getElementById('restartBtn');
const promptInputTemplate = document.getElementById('promptInputTemplate');
const cellTemplate = document.getElementById('cellTemplate');

let toastTimer = null;

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
  }, 1400);
}

function cloneEmptyCompleted() {
  return Array.from({ length: promptCount }, () => Array(columnsPerRow).fill(false));
}

function getFallbackModel(rowIndex) {
  return fallbackCycle[rowIndex % fallbackCycle.length];
}

function getCellModelName(rowIndex, columnIndex) {
  if (columnIndex < 4) {
    return modelColumns[columnIndex];
  }
  return getFallbackModel(rowIndex);
}

function loadDraftPrompts() {
  try {
    const raw = localStorage.getItem(storageKeys.prompts);
    if (!raw) {
      return Array.from({ length: promptCount }, () => '');
    }
    const parsed = JSON.parse(raw);
    return Array.from({ length: promptCount }, (_, index) => String(parsed[index] ?? ''));
  } catch {
    return Array.from({ length: promptCount }, () => '');
  }
}

function saveDraftPrompts(prompts) {
  localStorage.setItem(storageKeys.prompts, JSON.stringify(prompts));
}

function clearSession() {
  localStorage.removeItem(storageKeys.session);
}

function saveSession() {
  const payload = {
    prompts: state.prompts,
    completed: state.completed
  };
  localStorage.setItem(storageKeys.session, JSON.stringify(payload));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(storageKeys.session);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return {
      prompts: Array.isArray(parsed.prompts) ? Array.from({ length: promptCount }, (_, index) => String(parsed.prompts[index] ?? '')) : null,
      completed: Array.isArray(parsed.completed) ? parsed.completed.map((row) => Array.from({ length: columnsPerRow }, (_, index) => Boolean(row?.[index]))) : null
    };
  } catch {
    return null;
  }
}

function setMode(mode) {
  state.mode = mode;
  idleView.classList.toggle('hidden', mode !== 'idle');
  setupView.classList.toggle('hidden', mode !== 'setup');
  boardView.classList.toggle('hidden', mode !== 'board');
  idleView.classList.toggle('active', mode === 'idle');
  setupView.classList.toggle('active', mode === 'setup');
  boardView.classList.toggle('active', mode === 'board');
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
      const target = event.currentTarget;
      state.prompts[index] = target.value;
      saveDraftPrompts(state.prompts);
    });
    promptList.appendChild(fragment);
  });
}

function openSetup() {
  state.prompts = loadDraftPrompts();
  renderPromptInputs(state.prompts);
  setMode('setup');
}

function openBoardFromCurrentPrompts() {
  state.completed = cloneEmptyCompleted();
  saveSession();
  renderBoard();
  setMode('board');
}

function renderBoard() {
  boardGrid.innerHTML = '';
  state.prompts.forEach((prompt, rowIndex) => {
    for (let columnIndex = 0; columnIndex < columnsPerRow; columnIndex += 1) {
      const fragment = cellTemplate.content.cloneNode(true);
      const cell = fragment.querySelector('.cell');
      const rowBadge = fragment.querySelector('.row-badge');
      const modelName = fragment.querySelector('.model-name');
      const statusPill = fragment.querySelector('.status-pill');
      const copyButton = fragment.querySelector('.copy-button');
      const completeButton = fragment.querySelector('.complete-button');
      const currentModel = getCellModelName(rowIndex, columnIndex);
      const isCompleted = Boolean(state.completed[rowIndex]?.[columnIndex]);

      rowBadge.textContent = `第 ${rowIndex + 1} 行 · 第 ${columnIndex + 1} 列`;
      modelName.textContent = currentModel;
      statusPill.textContent = isCompleted ? '已完成' : '待完成';
      cell.classList.toggle('completed', isCompleted);

      copyButton.addEventListener('click', async () => {
        const text = prompt || '';
        copyButton.disabled = true;

        try {
          if (window.electronAPI?.copyText) {
            await window.electronAPI.copyText(text);
          } else {
            await navigator.clipboard.writeText(text);
          }

          statusPill.textContent = '已复制';
          showToast('复制成功');
          setTimeout(() => {
            statusPill.textContent = state.completed[rowIndex][columnIndex] ? '已完成' : '待完成';
          }, 1000);
        } catch (error) {
          console.error('Copy failed:', error);
          statusPill.textContent = '复制失败';
          showToast('复制失败，请重试', true);
        } finally {
          copyButton.disabled = false;
        }
      });

      completeButton.addEventListener('click', () => {
        if (state.completed[rowIndex][columnIndex]) {
          return;
        }
        state.completed[rowIndex][columnIndex] = true;
        saveSession();
        renderBoard();
        if (isAllComplete()) {
          scheduleReset();
        }
      });

      boardGrid.appendChild(fragment);
    }
  });
}

function isAllComplete() {
  return state.completed.every((row) => row.every(Boolean));
}

function scheduleReset() {
  if (state.resetTimer) {
    clearTimeout(state.resetTimer);
  }
  state.resetTimer = setTimeout(() => {
    state.resetTimer = null;
    state.prompts = Array.from({ length: promptCount }, () => '');
    state.completed = cloneEmptyCompleted();
    clearSession();
    setMode('idle');
  }, 450);
}

function handleSetupSubmit(event) {
  event.preventDefault();
  const textareas = Array.from(setupForm.querySelectorAll('textarea'));
  state.prompts = textareas.map((textarea) => textarea.value.trim());
  saveDraftPrompts(state.prompts);
  openBoardFromCurrentPrompts();
}

function startSessionEditing() {
  if (state.mode === 'board') {
    state.prompts = loadDraftPrompts();
    renderPromptInputs(state.prompts);
  }
  setMode('setup');
}

function restoreSavedSession() {
  const session = loadSession();
  if (session?.prompts && session?.completed) {
    state.prompts = session.prompts;
    state.completed = session.completed;
    renderBoard();
    setMode('board');
    return;
  }
  state.prompts = loadDraftPrompts();
  setMode('idle');
}

openSetupBtn.addEventListener('click', openSetup);
backBtn.addEventListener('click', () => setMode('idle'));
clearDraftBtn.addEventListener('click', () => {
  state.prompts = Array.from({ length: promptCount }, () => '');
  saveDraftPrompts(state.prompts);
  renderPromptInputs(state.prompts);
});
setupForm.addEventListener('submit', handleSetupSubmit);
editPromptsBtn.addEventListener('click', startSessionEditing);
restartBtn.addEventListener('click', () => {
  if (state.resetTimer) {
    clearTimeout(state.resetTimer);
    state.resetTimer = null;
  }
  state.prompts = Array.from({ length: promptCount }, () => '');
  state.completed = cloneEmptyCompleted();
  clearSession();
  saveDraftPrompts(state.prompts);
  setMode('idle');
});

restoreSavedSession();
