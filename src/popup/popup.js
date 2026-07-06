// Popup 交互逻辑（M4：三问折叠面板 + 独立 loading + 复制 + 重试）
import { renderMarkdown } from '../lib/markdown-renderer.js';
import { buildCopyText, buildSingleCopyText } from '../lib/copy-builder.js';

const QUESTION_KEYS = ['positioning', 'monetization', 'traffic'];
const STATUS_LABEL = {
  idle: '',
  loading: '分析中…',
  fulfilled: '完成',
  rejected: '失败',
};

const btn = document.getElementById('analyzeBtn');
const copyAllBtn = document.getElementById('copyAllBtn');
const retryBtn = document.getElementById('retryBtn');
const siteInfo = document.getElementById('siteInfo');
const settingsBtn = document.getElementById('settingsBtn');

let currentUrl = '';

/** 初始化：显示当前标签页域名 */
async function initSiteInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    const url = new URL(tab.url);
    currentUrl = url.href;
    siteInfo.textContent = url.hostname;
  } catch {
    siteInfo.textContent = '当前页面不可分析';
    btn.disabled = true;
  }
}

/** 更新单个面板的状态徽章 */
function updatePanelStatus(key, status) {
  const statusEl = document.querySelector(`[data-status="${key}"]`);
  statusEl.textContent = STATUS_LABEL[status] || '';
  statusEl.className = 'panel-status' + (status !== 'idle' ? ' ' + status : '');
}

/** 渲染单个面板的结果 */
function renderPanelResult(key, status, valueOrError) {
  const bodyEl = document.querySelector(`[data-body="${key}"]`);
  bodyEl.innerHTML = '';

  if (status === 'loading') {
    bodyEl.hidden = false;
    bodyEl.innerHTML = '<p class="loading-text">正在分析…</p>';
    return;
  }

  if (status === 'fulfilled') {
    bodyEl.hidden = false;
    bodyEl.innerHTML = renderMarkdown(valueOrError || '');
    return;
  }

  if (status === 'rejected') {
    bodyEl.hidden = false;
    const err = valueOrError instanceof Error ? valueOrError.message : String(valueOrError);
    bodyEl.innerHTML = `<p class="error-text">分析失败：${escapeHtml(err)}</p>
      <button class="retry-btn" data-retry="${key}">重试此问</button>`;
    return;
  }

  bodyEl.hidden = true;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 处理来自 background 的进度推送 */
function handleProgress(update) {
  const { key, status, value, reason } = update;
  updatePanelStatus(key, status);
  renderPanelResult(
    key,
    status,
    status === 'fulfilled' ? value : status === 'rejected' ? reason : null
  );
  updateActions();
}

/** 更新底部按钮状态 */
function updateActions(overall) {
  // overall 由 background 推送的 ANALYSIS_DONE 事件携带
  if (overall === 'done' || overall === 'done-with-errors') {
    copyAllBtn.disabled = false;
    retryBtn.hidden = overall !== 'done-with-errors';
  } else if (overall === 'loading') {
    copyAllBtn.disabled = true;
    retryBtn.hidden = true;
  }
}

/** 点击「开始分析」 */
btn.addEventListener('click', async () => {
  btn.disabled = true;
  // 重置面板
  for (const key of QUESTION_KEYS) {
    updatePanelStatus(key, 'loading');
    renderPanelResult(key, 'loading', null);
  }
  retryBtn.hidden = true;
  copyAllBtn.disabled = true;

  try {
    chrome.runtime.sendMessage({ type: 'START_ANALYSIS_V2' });
    // 结果由 background 通过 onMessage 推送
  } catch (e) {
    btn.disabled = false;
    updatePanelStatus('positioning', 'rejected');
    renderPanelResult('positioning', 'rejected', e);
  }
});

/** 折叠面板点击 */
document.querySelectorAll('.panel-header').forEach((header) => {
  header.addEventListener('click', () => {
    const body = header.nextElementSibling;
    body.hidden = !body.hidden;
  });
});

/** 重试按钮（事件委托） */
document.addEventListener('click', (e) => {
  const retryTarget = e.target.dataset.retry;
  if (retryTarget) {
    chrome.runtime.sendMessage({ type: 'RETRY_QUESTION', key: retryTarget });
    updatePanelStatus(retryTarget, 'loading');
    renderPanelResult(retryTarget, 'loading', null);
  }
});

/** 重试失败项按钮 */
retryBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RETRY_ALL_FAILED' });
});

/** 复制全部 */
copyAllBtn.addEventListener('click', async () => {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_RESULTS' });
  if (resp && resp.results) {
    const text = buildCopyText(resp.results, { url: currentUrl });
    await navigator.clipboard.writeText(text);
    copyAllBtn.textContent = '已复制';
    setTimeout(() => (copyAllBtn.textContent = '复制全部'), 1500);
  }
});

/** 设置按钮：打开设置页 */
settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

/** 接收 background 推送 */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'QUESTION_PROGRESS') {
    handleProgress(msg.update);
  } else if (msg.type === 'ANALYSIS_DONE') {
    updateActions(msg.overall);
    btn.disabled = false;
  }
});

initSiteInfo();
