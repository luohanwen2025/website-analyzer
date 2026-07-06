// Background Service Worker —— AI 调用中枢（M4 端到端串联）
import { isAnalyzableUrl } from '../lib/url-filter.js';
import { resolveRequestConfig } from '../lib/router.js';
import { createAiClient } from '../lib/ai-client.js';
import { analyzeSite } from '../lib/analyzer-orchestrator.js';
import { withRetry } from '../lib/retry.js';
import { mergeWithDefaults, PROXY_BASE } from '../lib/config-loader.js';
import { getProvider } from '../config/providers.js';

// 当前分析结果（供 popup 查询）
let currentResults = null;

// 设备 ID（免费体验配额用，持久化）
let cachedDeviceId = null;

/** 读取或生成设备 ID */
async function getDeviceId() {
  if (cachedDeviceId) return cachedDeviceId;
  const { deviceId } = await chrome.storage.local.get('deviceId');
  if (deviceId) {
    cachedDeviceId = deviceId;
    return deviceId;
  }
  const newId = 'dev-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  await chrome.storage.local.set({ deviceId: newId });
  cachedDeviceId = newId;
  return newId;
}

/** 读取用户配置 */
async function loadConfig() {
  const stored = await chrome.storage.local.get(['mode', 'providerId', 'model', 'apiKey']);
  return mergeWithDefaults(stored);
}

/** 向当前打开的 Popup 推送消息 */
function notifyPopup(type, payload) {
  chrome.runtime.sendMessage({ type, ...payload }).catch(() => {
    // Popup 可能未打开，忽略错误
  });
}

/** 构造 chat 函数（供 analyzeSite 使用），内部含重试 */
function buildChatFn(requestConfig) {
  const provider = getProvider(requestConfig.providerId || 'qwen');
  // 中转模式：改写 provider 的 endpoint（中转服务兼容 OpenAI 格式）
  const providerForClient = requestConfig.isProxy
    ? { ...provider, endpoint: requestConfig.endpoint, buildHeaders: (apiKey) => ({
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...requestConfig.headers,
      }) }
    : provider;

  const client = createAiClient({
    provider: providerForClient,
    apiKey: requestConfig.apiKey,
    model: requestConfig.model,
  });

  return async (userPrompt, systemPrompt) => {
    return withRetry(
      () => client.chat(userPrompt, systemPrompt),
      { maxAttempts: 2, backoffMs: 800 }
    );
  };
}

/** 执行完整分析流程 */
async function runAnalysis(retryKeys = null) {
  // 1. 获取当前标签页
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('未找到活动标签页');
  if (!isAnalyzableUrl(tab.url || '')) {
    throw new Error('该页面无法分析（浏览器内部页）');
  }

  // 2. 提取页面内容
  const pageData = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_CONTENT' });
  if (!pageData) throw new Error('未能提取页面内容');

  // 3. 加载配置并解析请求参数
  const config = await loadConfig();
  const deviceId = config.mode === 'free' ? await getDeviceId() : null;
  const requestConfig = resolveRequestConfig(
    { ...config, deviceId },
    { proxyBase: PROXY_BASE }
  );

  // 4. 构造 chat 函数
  const chatFn = buildChatFn({ ...requestConfig, providerId: config.providerId });

  // 5. 并行调度三问
  const results = await analyzeSite(pageData, { chat: chatFn }, (update) => {
    notifyPopup('QUESTION_PROGRESS', { update });
  });

  currentResults = results;

  // 6. 推送整体完成
  const hasRejected = Object.values(results).some((r) => r.status === 'rejected');
  const overall = hasRejected ? 'done-with-errors' : 'done';
  notifyPopup('ANALYSIS_DONE', { overall });
  return results;
}

// 消息监听
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'START_ANALYSIS') {
    // M1 兼容：仅返回提取结果
    handleExtractOnly().then(sendResponse).catch((err) =>
      sendResponse({ type: 'EXTRACTION_ERROR', error: err.message })
    );
    return true;
  }

  if (msg.type === 'START_ANALYSIS_V2') {
    // M4 完整流程
    runAnalysis()
      .then(() => sendResponse({ type: 'OK' }))
      .catch((err) => {
        notifyPopup('ANALYSIS_DONE', { overall: 'error', error: err.message });
        sendResponse({ type: 'ERROR', error: err.message });
      });
    return true;
  }

  if (msg.type === 'RETRY_QUESTION') {
    // 单问重试（M4 阶段简化为重新全量分析，后续优化）
    runAnalysis([msg.key])
      .then(() => sendResponse({ type: 'OK' }))
      .catch((err) => sendResponse({ type: 'ERROR', error: err.message }));
    return true;
  }

  if (msg.type === 'RETRY_ALL_FAILED') {
    runAnalysis()
      .then(() => sendResponse({ type: 'OK' }))
      .catch((err) => sendResponse({ type: 'ERROR', error: err.message }));
    return true;
  }

  if (msg.type === 'GET_RESULTS') {
    sendResponse({ results: currentResults });
    return false;
  }
});

/** M1 兼容：仅提取页面内容 */
async function handleExtractOnly() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('未找到活动标签页');
  if (!isAnalyzableUrl(tab.url || '')) {
    return { type: 'EXTRACTION_ERROR', error: '该页面无法分析（浏览器内部页）' };
  }
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_CONTENT' });
    return response || { type: 'EXTRACTION_ERROR', error: '未能提取内容' };
  } catch (e) {
    return { type: 'EXTRACTION_ERROR', error: '页面未就绪，请刷新后重试（' + e.message + '）' };
  }
}
