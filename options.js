const defaultSpeedSelect = document.getElementById('defaultSpeed');
const maxDelayInput = document.getElementById('maxDelay');
const btnExport = document.getElementById('btnExport');
const btnImport = document.getElementById('btnImport');
const importFile = document.getElementById('importFile');
const btnClearAll = document.getElementById('btnClearAll');
const btnOpenShortcuts = document.getElementById('btnOpenShortcuts');
const toast = document.getElementById('toast');

function showToast(msg) {
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 2000);
}

async function loadSettings() {
  const data = await chrome.storage.local.get('settings');
  const settings = data.settings || {};
  if (settings.defaultSpeed) defaultSpeedSelect.value = settings.defaultSpeed;
  if (settings.maxDelay) maxDelayInput.value = settings.maxDelay;
}

async function saveSettings() {
  const settings = {
    defaultSpeed: defaultSpeedSelect.value,
    maxDelay: parseInt(maxDelayInput.value) || 3000
  };
  await chrome.storage.local.set({ settings });
  showToast('设置已保存');
}

defaultSpeedSelect.addEventListener('change', saveSettings);
maxDelayInput.addEventListener('change', saveSettings);

btnExport.addEventListener('click', async () => {
  const data = await chrome.storage.local.get('tasks');
  const tasks = data.tasks || [];
  const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ez-work-tasks-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('导出成功');
});

btnImport.addEventListener('click', () => {
  importFile.click();
});

importFile.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!Array.isArray(imported)) throw new Error('格式错误');

      const data = await chrome.storage.local.get('tasks');
      const existing = data.tasks || [];
      const existingIds = new Set(existing.map(t => t.id));

      const newTasks = imported.filter(t => !existingIds.has(t.id));
      const merged = [...newTasks, ...existing];

      await chrome.storage.local.set({ tasks: merged });
      showToast('导入成功，新增 ' + newTasks.length + ' 个任务');
    } catch (err) {
      showToast('导入失败：文件格式不正确');
    }
  };
  reader.readAsText(file);
  importFile.value = '';
});

btnClearAll.addEventListener('click', async () => {
  if (!confirm('确定要清除所有数据吗？此操作不可恢复。')) return;
  await chrome.storage.local.clear();
  showToast('已清除所有数据');
});

btnOpenShortcuts.addEventListener('click', () => {
  chrome.tabs.create({ url: 'edge://extensions/shortcuts' });
});

loadSettings();
