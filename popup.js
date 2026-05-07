const btnCreate = document.getElementById('btnCreate');
const btnStopRecord = document.getElementById('btnStopRecord');
const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const taskCount = document.getElementById('taskCount');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const loopCountInput = document.getElementById('loopCount');
const playbackSpeedSelect = document.getElementById('playbackSpeed');
const btnOptions = document.getElementById('btnOptions');

let currentRecordingId = null;
let selectedTaskId = null;

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function loadTasks() {
  const data = await chrome.storage.local.get('tasks');
  const tasks = data.tasks || [];
  taskCount.textContent = tasks.length;

  if (tasks.length === 0) {
    emptyState.style.display = '';
    const items = taskList.querySelectorAll('.task-item');
    items.forEach(i => i.remove());
    return;
  }

  emptyState.style.display = 'none';

  const existingItems = taskList.querySelectorAll('.task-item');
  const existingIds = new Set();
  existingItems.forEach(el => existingIds.add(el.dataset.id));

  const taskIds = new Set(tasks.map(t => t.id));

  existingItems.forEach(el => {
    if (!taskIds.has(el.dataset.id)) el.remove();
  });

  for (const task of tasks) {
    let item = taskList.querySelector(`.task-item[data-id="${task.id}"]`);
    if (!item) {
      item = document.createElement('div');
      item.className = 'task-item';
      item.dataset.id = task.id;
      taskList.appendChild(item);
    }
    renderTaskItem(item, task);
  }
}

function renderTaskItem(item, task) {
  const isSelected = selectedTaskId === task.id;
  item.className = 'task-item' + (isSelected ? ' selected' : '');
  item.innerHTML = `
    <div class="task-item-header">
      <span class="task-name" title="${task.name}">${task.name}</span>
      <span class="task-meta">${task.steps.length}步 · ${formatTime(task.createdAt)}</span>
    </div>
    <div class="task-actions">
      <button class="btn btn-success btn-sm btn-playback" data-id="${task.id}">回放</button>
      <button class="btn btn-primary btn-sm btn-loop" data-id="${task.id}">循环回放</button>
      <button class="btn btn-sm btn-rename" style="background:#e8e8e8;color:#333;" data-id="${task.id}">重命名</button>
      <button class="btn btn-danger btn-sm btn-delete" data-id="${task.id}">删除</button>
    </div>
  `;
}

async function startRecording() {
  const tab = await getCurrentTab();
  if (!tab) return;

  if (!tab.url || tab.url.startsWith('edge://') || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
    statusText.textContent = '此页面不支持录制';
    return;
  }

  currentRecordingId = generateId();

  await chrome.storage.local.set({
    currentRecording: {
      id: currentRecordingId,
      name: '新任务 ' + new Date().toLocaleString('zh-CN'),
      steps: [],
      tabId: tab.id,
      startTime: Date.now()
    }
  });

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'START_RECORDING', recordingId: currentRecordingId });
  } catch (e) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await chrome.tabs.sendMessage(tab.id, { type: 'START_RECORDING', recordingId: currentRecordingId });
    } catch (e2) {
      statusText.textContent = '无法在此页面录制';
      await chrome.storage.local.remove('currentRecording');
      currentRecordingId = null;
      return;
    }
  }

  btnCreate.style.display = 'none';
  btnStopRecord.style.display = '';
  statusDot.className = 'status-dot recording';
  statusText.textContent = '录制中...';
}

async function stopRecording() {
  const tab = await getCurrentTab();

  let saveSuccess = false;
  if (tab) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'STOP_RECORDING' });
      saveSuccess = true;
    } catch (e) {}
  }

  if (!saveSuccess) {
    const data = await chrome.storage.local.get('currentRecording');
    const recording = data.currentRecording;
    if (recording && recording.steps.length > 0) {
      const tasksData = await chrome.storage.local.get('tasks');
      const tasks = tasksData.tasks || [];
      tasks.unshift({
        id: recording.id,
        name: recording.name,
        steps: recording.steps,
        createdAt: Date.now()
      });
      await chrome.storage.local.set({ tasks });
    }
    await chrome.storage.local.remove('currentRecording');
  }

  currentRecordingId = null;

  btnCreate.style.display = '';
  btnStopRecord.style.display = 'none';
  statusDot.className = 'status-dot';
  statusText.textContent = '就绪';

  await loadTasks();
}

async function startPlayback(taskId, loop = 1) {
  const tab = await getCurrentTab();
  if (!tab) return;

  const data = await chrome.storage.local.get('tasks');
  const task = (data.tasks || []).find(t => t.id === taskId);
  if (!task) return;

  const speed = parseFloat(playbackSpeedSelect.value);

  await chrome.tabs.sendMessage(tab.id, {
    type: 'START_PLAYBACK',
    task: task,
    loop: loop,
    speed: speed
  });

  statusDot.className = 'status-dot playing';
  statusText.textContent = `回放中 (${task.name})`;
}

async function deleteTask(taskId) {
  const data = await chrome.storage.local.get('tasks');
  const tasks = (data.tasks || []).filter(t => t.id !== taskId);
  await chrome.storage.local.set({ tasks });
  if (selectedTaskId === taskId) {
    selectedTaskId = null;
  }
  await loadTasks();
}

async function renameTask(taskId) {
  const item = taskList.querySelector(`.task-item[data-id="${taskId}"]`);
  if (!item) return;

  const nameEl = item.querySelector('.task-name');
  const oldName = nameEl.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename-input';
  input.value = oldName;
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const finish = async () => {
    const newName = input.value.trim() || oldName;
    const data = await chrome.storage.local.get('tasks');
    const tasks = data.tasks || [];
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      task.name = newName;
      await chrome.storage.local.set({ tasks });
    }
    await loadTasks();
  };

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') {
      input.value = oldName;
      input.blur();
    }
  });
}

function selectTask(taskId) {
  if (selectedTaskId === taskId) {
    selectedTaskId = null;
  } else {
    selectedTaskId = taskId;
  }
  loadTasks();
}

btnCreate.addEventListener('click', startRecording);
btnStopRecord.addEventListener('click', stopRecording);

taskList.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) {
    const item = e.target.closest('.task-item');
    if (item) selectTask(item.dataset.id);
    return;
  }

  const taskId = btn.dataset.id;
  if (btn.classList.contains('btn-playback')) {
    startPlayback(taskId, 1);
  } else if (btn.classList.contains('btn-loop')) {
    const loop = parseInt(loopCountInput.value) || 1;
    startPlayback(taskId, loop);
  } else if (btn.classList.contains('btn-delete')) {
    deleteTask(taskId);
  } else if (btn.classList.contains('btn-rename')) {
    renameTask(taskId);
  }
});

btnOptions.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'PLAYBACK_FINISHED') {
    statusDot.className = 'status-dot';
    statusText.textContent = '回放完成';
  } else if (msg.type === 'RECORDING_STEP') {
    statusText.textContent = `录制中... (${msg.stepCount}步)`;
  }
});

async function checkRecordingState() {
  const data = await chrome.storage.local.get('currentRecording');
  if (data.currentRecording) {
    currentRecordingId = data.currentRecording.id;
    btnCreate.style.display = 'none';
    btnStopRecord.style.display = '';
    statusDot.className = 'status-dot recording';
    statusText.textContent = `录制中... (${data.currentRecording.steps.length}步)`;
  }
}

checkRecordingState();
loadTasks();
