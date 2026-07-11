// Side Panel 交互（复用现有消息流 + lib，与 popup.js 同属 UI 胶水层）
import { renderMarkdown } from '../lib/markdown-renderer.js';
import { buildCopyText } from '../lib/copy-builder.js';

const QUESTION_KEYS = ['positioning', 'monetization', 'traffic'];
const LABELS = { positioning: '产品定位', monetization: '核心卖点', traffic: '流量来源' };

// 状态
const results = {}; // { [key]: { status: 'loading'|'fulfilled'|'rejected', value?, reason? } }
let activeKey = 'positioning';
let currentUrl = '';
let currentTabId = null;

// DOM
const tabs = document.querySelectorAll('.tab');
const siteInfo = document.getElementById('siteInfo');
const contentTitle = document.getElementById('contentTitle');
const contentBody = document.getElementById('contentBody');
const copyAllBtn = document.getElementById('copyAllBtn');
const settingsBtn = document.getElementById('settingsBtn');

/** 初始化：记录 tabId + 域名，随即自动发起分析（优化①：点图标开面板即分析） */
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  currentTabId = tab.id;
  try {
    const url = new URL(tab.url);
    currentUrl = url.href;
    siteInfo.textContent = url.hostname;
  } catch {
    siteInfo.textContent = '当前页面不可分析';
  }
  startAnalysis();
}

/** 发起（或重置）三问分析 */
function startAnalysis() {
  for (const key of QUESTION_KEYS) {
    results[key] = { status: 'loading' };
    setTabStatus(key, 'loading');
  }
  renderActiveContent();
  updateCopyBtn();
  chrome.runtime.sendMessage({ type: 'START_ANALYSIS_V2', tabId: currentTabId });
}

/** 设置某标签的状态图标 class */
function setTabStatus(key, status) {
  const el = document.querySelector(`.tab-status[data-status="${key}"]`);
  if (el) el.className = 'tab-status ' + status;
}

/** 渲染当前激活标签的右侧内容 */
function renderActiveContent() {
  contentTitle.textContent = LABELS[activeKey];
  const r = results[activeKey] || { status: 'loading' };
  contentBody.innerHTML = '';
  if (r.status === 'loading') {
    contentBody.innerHTML = '<p class="loading-text">正在分析…</p>';
  } else if (r.status === 'fulfilled') {
    contentBody.innerHTML = renderMarkdown(r.value || '');
  } else if (r.status === 'rejected') {
    const err = r.reason instanceof Error ? r.reason.message : String(r.reason || '分析失败');
    contentBody.innerHTML =
      `<p class="error-text">分析失败：${escapeHtml(err)}</p>` +
      `<button class="retry-btn" data-retry="${activeKey}">重试此问</button>`;
  }
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 复制按钮可用性：至少一问完成才可复制 */
function updateCopyBtn() {
  copyAllBtn.disabled = !Object.values(results).some((r) => r && r.status === 'fulfilled');
}

// 标签点击切换
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    activeKey = tab.dataset.key;
    renderActiveContent();
  });
});

// 重试（事件委托，按钮在错误态动态生成）
document.addEventListener('click', (e) => {
  const retryKey = e.target.dataset.retry;
  if (!retryKey) return;
  chrome.runtime.sendMessage({ type: 'RETRY_QUESTION', key: retryKey, tabId: currentTabId });
  results[retryKey] = { status: 'loading' };
  setTabStatus(retryKey, 'loading');
  if (retryKey === activeKey) renderActiveContent();
});

// 复制全部
copyAllBtn.addEventListener('click', async () => {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_RESULTS' });
  if (resp && resp.results) {
    const text = buildCopyText(resp.results, { url: currentUrl });
    await navigator.clipboard.writeText(text);
    copyAllBtn.textContent = '✓';
    setTimeout(() => (copyAllBtn.textContent = '📋'), 1500);
  }
});

// 设置
settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

// 接收 background 推送
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'QUESTION_PROGRESS') {
    const { key, status, value, reason } = msg.update;
    results[key] = { status, value, reason };
    setTabStatus(key, status);
    if (key === activeKey) renderActiveContent();
    updateCopyBtn();
  } else if (msg.type === 'ANALYSIS_DONE') {
    updateCopyBtn();
    // 整体失败（如提取/标签阶段错误）：把仍 loading 的标签置为失败并显示原因
    if (msg.overall === 'error') {
      for (const key of QUESTION_KEYS) {
        if (!results[key] || results[key].status === 'loading') {
          results[key] = { status: 'rejected', reason: new Error(msg.error || '分析失败') };
          setTabStatus(key, 'rejected');
        }
      }
      if (results[activeKey] && results[activeKey].status === 'rejected') renderActiveContent();
    }
  }
});

init();
