chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('tasks', (data) => {
    if (!data.tasks) {
      chrome.storage.local.set({ tasks: [] });
    }
  });
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'start-recording') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const data = await chrome.storage.local.get('currentRecording');
    if (data.currentRecording) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'STOP_RECORDING' });
      } catch (e) {}
    } else {
      const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      await chrome.storage.local.set({
        currentRecording: {
          id,
          name: '新任务 ' + new Date().toLocaleString('zh-CN'),
          steps: [],
          tabId: tab.id,
          startTime: Date.now()
        }
      });
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'START_RECORDING', recordingId: id });
      } catch (e) {}
    }
  } else if (command === 'start-playback') {
    const data = await chrome.storage.local.get('tasks');
    const tasks = data.tasks || [];
    if (tasks.length === 0) return;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'START_PLAYBACK',
        task: tasks[0],
        loop: 1,
        speed: 1
      });
    } catch (e) {}
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'RECORDING_STEP') {
    chrome.storage.local.get('currentRecording', (data) => {
      if (data.currentRecording) {
        data.currentRecording.steps.push(msg.step);
        chrome.storage.local.set({ currentRecording: data.currentRecording });
      }
    });
  } else if (msg.type === 'PLAYBACK_FINISHED') {
    chrome.runtime.sendMessage({ type: 'PLAYBACK_FINISHED' }).catch(() => {});
  } else if (msg.type === 'GET_RECORDING_STATE') {
    chrome.storage.local.get('currentRecording', (data) => {
      sendResponse({ recording: data.currentRecording || null });
    });
    return true;
  }
});
