(function () {
  let isRecording = false;
  let isPlaying = false;
  let recordingId = null;
  let playbackSteps = [];
  let playbackIndex = 0;
  let playbackLoop = 1;
  let playbackSpeed = 1;
  let currentLoop = 0;
  let isPaused = false;
  let playbackTimer = null;
  let floatingPanel = null;

  function getCssPath(el) {
    if (!el || el === document.body || el === document.documentElement) {
      return el.tagName.toLowerCase();
    }

    const path = [];
    let current = el;
    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += '#' + CSS.escape(current.id);
        path.unshift(selector);
        break;
      } else {
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            (c) => c.tagName === current.tagName
          );
          if (siblings.length > 1) {
            const idx = siblings.indexOf(current) + 1;
            selector += ':nth-of-type(' + idx + ')';
          }
        }
        path.unshift(selector);
      }
      current = current.parentElement;
    }
    return path.join(' > ');
  }

  function getElementByPath(path) {
    try {
      return document.querySelector(path);
    } catch (e) {
      return null;
    }
  }

  function recordStep(step) {
    if (!isRecording) return;
    chrome.runtime.sendMessage({
      type: 'RECORDING_STEP',
      step: step
    });
  }

  function onMouseEvent(e) {
    if (!isRecording) return;
    if (e.target.closest('.ez-work-floating-panel')) return;
    if (e.target.closest('#ez-work-recording-indicator')) return;

    const step = {
      type: e.type,
      path: getCssPath(e.target),
      x: e.clientX,
      y: e.clientY,
      button: e.button,
      timestamp: Date.now(),
      url: window.location.href
    };

    if (e.type === 'click') {
      step.value = e.target.value || '';
      step.tagName = e.target.tagName;
    }

    recordStep(step);
  }

  function onKeyboardEvent(e) {
    if (!isRecording) return;
    if (e.target.closest('.ez-work-floating-panel')) return;
    if (e.target.closest('#ez-work-recording-indicator')) return;

    const step = {
      type: e.type,
      path: getCssPath(e.target),
      key: e.key,
      code: e.code,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      timestamp: Date.now(),
      url: window.location.href
    };

    if (e.type === 'keydown' && e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      step.inputValue = e.target.value;
    }

    recordStep(step);
  }

  function onInputEvent(e) {
    if (!isRecording) return;
    if (e.target.closest('.ez-work-floating-panel')) return;
    if (e.target.closest('#ez-work-recording-indicator')) return;

    const step = {
      type: 'input',
      path: getCssPath(e.target),
      value: e.target.value,
      timestamp: Date.now(),
      url: window.location.href
    };

    recordStep(step);
  }

  function onFocusEvent(e) {
    if (!isRecording) return;
    if (e.target.closest('.ez-work-floating-panel')) return;
    if (e.target.closest('#ez-work-recording-indicator')) return;

    const step = {
      type: 'focus',
      path: getCssPath(e.target),
      timestamp: Date.now(),
      url: window.location.href
    };

    recordStep(step);
  }

  function startRecording(recId) {
    isRecording = true;
    recordingId = recId;
    document.addEventListener('click', onMouseEvent, true);
    document.addEventListener('mousedown', onMouseEvent, true);
    document.addEventListener('mouseup', onMouseEvent, true);
    document.addEventListener('keydown', onKeyboardEvent, true);
    document.addEventListener('keyup', onKeyboardEvent, true);
    document.addEventListener('input', onInputEvent, true);
    document.addEventListener('focus', onFocusEvent, true);
    showRecordingIndicator();
  }

  function stopRecording() {
    isRecording = false;
    recordingId = null;
    document.removeEventListener('click', onMouseEvent, true);
    document.removeEventListener('mousedown', onMouseEvent, true);
    document.removeEventListener('mouseup', onMouseEvent, true);
    document.removeEventListener('keydown', onKeyboardEvent, true);
    document.removeEventListener('keyup', onKeyboardEvent, true);
    document.removeEventListener('input', onInputEvent, true);
    document.removeEventListener('focus', onFocusEvent, true);
    hideRecordingIndicator();
  }

  function showRecordingIndicator() {
    let indicator = document.getElementById('ez-work-recording-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'ez-work-recording-indicator';
      indicator.style.cssText =
        'position:fixed;top:10px;right:10px;z-index:2147483647;' +
        'background:#ff4d4f;color:white;padding:6px 14px;border-radius:20px;' +
        'font-size:13px;font-family:sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.2);' +
        'display:flex;align-items:center;gap:8px;user-select:none;';
      indicator.innerHTML =
        '<span style="width:8px;height:8px;border-radius:50%;background:white;animation:ez-pulse 1s infinite;"></span>' +
        '<span class="ez-rec-text">录制中</span>' +
        '<button class="ez-rec-stop" style="background:rgba(255,255,255,0.2);border:none;color:white;padding:2px 10px;border-radius:12px;cursor:pointer;font-size:12px;margin-left:4px;">停止</button>' +
        '<span class="ez-rec-drag" style="cursor:move;padding:0 4px;">⋮⋮</span>';
      document.body.appendChild(indicator);

      const stopBtn = indicator.querySelector('.ez-rec-stop');
      stopBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        stopRecordingAndSave();
      });

      const dragHandle = indicator.querySelector('.ez-rec-drag');
      let isDragging = false;
      let startX, startY, origX, origY;
      dragHandle.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        origX = indicator.offsetLeft;
        origY = indicator.offsetTop;
        e.preventDefault();
      });
      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        indicator.style.left = origX + (e.clientX - startX) + 'px';
        indicator.style.top = origY + (e.clientY - startY) + 'px';
        indicator.style.right = 'auto';
      });
      document.addEventListener('mouseup', () => {
        isDragging = false;
      });
    }
    indicator.style.display = '';
  }

  async function stopRecordingAndSave() {
    stopRecording();
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

  function hideRecordingIndicator() {
    const indicator = document.getElementById('ez-work-recording-indicator');
    if (indicator) indicator.style.display = 'none';
  }

  async function executeStep(step) {
    const el = getElementByPath(step.path);

    if (step.type === 'focus') {
      if (el) el.focus();
      return;
    }

    if (step.type === 'click' || step.type === 'mousedown' || step.type === 'mouseup') {
      if (el) {
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        await sleep(50);

        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
        for (const eventType of events) {
          const evt = new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: x,
            clientY: y,
            button: step.button || 0
          });
          el.dispatchEvent(evt);
          await sleep(10);
        }
      }
      return;
    }

    if (step.type === 'keydown') {
      if (el) {
        el.focus();
        const evt = new KeyboardEvent('keydown', {
          key: step.key,
          code: step.code,
          altKey: step.altKey,
          ctrlKey: step.ctrlKey,
          shiftKey: step.shiftKey,
          metaKey: step.metaKey,
          bubbles: true,
          cancelable: true
        });
        el.dispatchEvent(evt);
      }
      return;
    }

    if (step.type === 'keyup') {
      if (el) {
        const evt = new KeyboardEvent('keyup', {
          key: step.key,
          code: step.code,
          altKey: step.altKey,
          ctrlKey: step.ctrlKey,
          shiftKey: step.shiftKey,
          metaKey: step.metaKey,
          bubbles: true,
          cancelable: true
        });
        el.dispatchEvent(evt);
      }
      return;
    }

    if (step.type === 'input') {
      if (el) {
        el.focus();
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set;

        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(el, step.value);
        } else {
          el.value = step.value;
        }

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function startPlayback(task, loop, speed) {
    if (isPlaying) return;

    isPlaying = true;
    playbackSteps = task.steps;
    playbackLoop = loop;
    playbackSpeed = speed;
    currentLoop = 0;
    isPaused = false;

    createFloatingPanel(task.name);

    await runPlayback();
  }

  async function runPlayback() {
    for (currentLoop = 0; currentLoop < playbackLoop; currentLoop++) {
      if (!isPlaying) break;

      updateFloatingPanel(
        '回放中',
        '第 ' + (currentLoop + 1) + '/' + playbackLoop + ' 轮'
      );

      for (playbackIndex = 0; playbackIndex < playbackSteps.length; playbackIndex++) {
        if (!isPlaying) break;

        while (isPaused && isPlaying) {
          await sleep(100);
        }
        if (!isPlaying) break;

        const step = playbackSteps[playbackIndex];
        updateFloatingPanel(
          '回放中',
          '第 ' + (currentLoop + 1) + '/' + playbackLoop + ' 轮 · 步骤 ' + (playbackIndex + 1) + '/' + playbackSteps.length
        );

        await executeStep(step);

        const nextStep = playbackSteps[playbackIndex + 1];
        if (nextStep) {
          const delay = Math.min(
            (nextStep.timestamp - step.timestamp) / playbackSpeed,
            3000
          );
          await sleep(Math.max(delay, 50));
        }
      }
    }

    if (isPlaying) {
      stopPlayback();
      chrome.runtime.sendMessage({ type: 'PLAYBACK_FINISHED' });
    }
  }

  function stopPlayback() {
    isPlaying = false;
    isPaused = false;
    removeFloatingPanel();
  }

  function pausePlayback() {
    isPaused = true;
    updateFloatingPanel('已暂停', '步骤 ' + (playbackIndex + 1) + '/' + playbackSteps.length);
  }

  function resumePlayback() {
    isPaused = false;
    updateFloatingPanel('回放中', '步骤 ' + (playbackIndex + 1) + '/' + playbackSteps.length);
  }

  async function stepForward() {
    if (playbackIndex < playbackSteps.length) {
      await executeStep(playbackSteps[playbackIndex]);
      playbackIndex++;
      updateFloatingPanel('单步', '步骤 ' + playbackIndex + '/' + playbackSteps.length);
    }
  }

  function createFloatingPanel(taskName) {
    removeFloatingPanel();

    floatingPanel = document.createElement('div');
    floatingPanel.className = 'ez-work-floating-panel';
    floatingPanel.innerHTML =
      '<div class="ez-panel-header">' +
        '<span class="ez-panel-title">自动化WEB</span>' +
        '<span class="ez-panel-task-name">' + (taskName || '') + '</span>' +
        '<button class="ez-panel-close" id="ez-panel-close">✕</button>' +
      '</div>' +
      '<div class="ez-panel-status" id="ez-panel-status">回放中</div>' +
      '<div class="ez-panel-progress" id="ez-panel-progress"></div>' +
      '<div class="ez-panel-controls">' +
        '<button class="ez-panel-btn" id="ez-btn-pause" title="暂停">⏸</button>' +
        '<button class="ez-panel-btn" id="ez-btn-resume" title="继续" style="display:none;">▶</button>' +
        '<button class="ez-panel-btn" id="ez-btn-step" title="单步执行">⏭</button>' +
        '<button class="ez-panel-btn ez-panel-btn-stop" id="ez-btn-stop" title="停止">⏹</button>' +
      '</div>';

    document.body.appendChild(floatingPanel);

    document.getElementById('ez-panel-close').addEventListener('click', () => {
      stopPlayback();
    });
    document.getElementById('ez-btn-pause').addEventListener('click', () => {
      pausePlayback();
      document.getElementById('ez-btn-pause').style.display = 'none';
      document.getElementById('ez-btn-resume').style.display = '';
    });
    document.getElementById('ez-btn-resume').addEventListener('click', () => {
      resumePlayback();
      document.getElementById('ez-btn-pause').style.display = '';
      document.getElementById('ez-btn-resume').style.display = 'none';
    });
    document.getElementById('ez-btn-step').addEventListener('click', () => {
      if (!isPaused) {
        pausePlayback();
        document.getElementById('ez-btn-pause').style.display = 'none';
        document.getElementById('ez-btn-resume').style.display = '';
      }
      stepForward();
    });
    document.getElementById('ez-btn-stop').addEventListener('click', () => {
      stopPlayback();
    });

    makeDraggable(floatingPanel);
  }

  function updateFloatingPanel(status, progress) {
    if (!floatingPanel) return;
    const statusEl = floatingPanel.querySelector('#ez-panel-status');
    const progressEl = floatingPanel.querySelector('#ez-panel-progress');
    if (statusEl) statusEl.textContent = status;
    if (progressEl) progressEl.textContent = progress;
  }

  function removeFloatingPanel() {
    if (floatingPanel && floatingPanel.parentNode) {
      floatingPanel.parentNode.removeChild(floatingPanel);
    }
    floatingPanel = null;
  }

  function makeDraggable(el) {
    const header = el.querySelector('.ez-panel-header');
    if (!header) return;

    let isDragging = false;
    let startX, startY, origX, origY;

    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      origX = el.offsetLeft;
      origY = el.offsetTop;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      el.style.left = origX + (e.clientX - startX) + 'px';
      el.style.top = origY + (e.clientY - startY) + 'px';
      el.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_RECORDING') {
      startRecording(msg.recordingId);
    } else if (msg.type === 'STOP_RECORDING') {
      stopRecordingAndSave().then(() => {
        sendResponse({ success: true });
      });
      return true;
    } else if (msg.type === 'START_PLAYBACK') {
      startPlayback(msg.task, msg.loop, msg.speed);
    } else if (msg.type === 'STOP_PLAYBACK') {
      stopPlayback();
    }
  });

  const style = document.createElement('style');
  style.textContent = '@keyframes ez-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }';
  document.head.appendChild(style);
})();
