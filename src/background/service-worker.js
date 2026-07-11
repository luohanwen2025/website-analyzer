// Background Service Worker —— AI 调用中枢（M4 端到端串联）
import { isAnalyzableUrl } from '../lib/url-filter.js';
import { unwrapExtractionResponse } from '../lib/analyzer.js';
import { resolveRequestConfig } from '../lib/router.js';
import { createAiClient } from '../lib/ai-client.js';
import { analyzeSite } from '../lib/analyzer-orchestrator.js';
import { withRetry } from '../lib/retry.js';
import { PROXY_BASE } from '../lib/config-loader.js';
import { createConfigStorage } from '../lib/config-storage.js';
import { getProvider } from '../config/providers.js';
import { assessContentSufficiency } from '../lib/content-sufficiency.js';
import { classifyError } from '../lib/error-classifier.js';

// Side Panel：点工具栏图标 toggle 开/关面板（window 级）。
// 放弃 per-tab 可见性：Chrome sidePanel 的 per-tab 是未修 bug（GoogleChrome/chrome-extensions-samples#987）——
//   open({tabId}) 仍是全局显示（切 tab 不隐藏），而全局 setOptions({enabled:false}) 又会让 open 报
//   "No active side panel for tabId"（per-tab setOptions 需带 path + await 才不报错，但可见性仍全局）。
//   四版实测印证走不通，故改用 window 级 toggle。
// 行为：面板常驻右侧（切 tab 不消失，但只占窄条、不挡网页主体）；点图标开/关；浏览器 × 关闭。
// 数据按 tab 隔离在 sidepanel.js 处理（Task 3）：切到 B 显示 B 的分析/空态，回 A 显示 A 结果。
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e) =>
  console.error('设置 Side Panel 行为失败', e)
);

// 当前分析结果（供 popup 查询）
let currentResults = null;

// 配置存储（统一走 config-storage 适配层，便于校验/重置）
const configStorage = createConfigStorage(chrome.storage.local);

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

/** 读取用户配置（走 config-storage 适配层） */
async function loadConfig() {
  return configStorage.load();
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
async function runAnalysis(tabId, retryKeys = null) {
  // 1. 获取标签页信息
  // 用 popup 传入的 tabId（popup 上下文里 currentWindow 可靠），而非在 service-worker 里
  // chrome.tabs.query({currentWindow:true})——后者在窗口失焦时会返回空，曾导致"未找到活动标签页"。
  if (!tabId) throw new Error('缺少 tabId');
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch (e) {
    throw new Error('无法获取标签页信息：' + e.message);
  }
  if (!isAnalyzableUrl(tab.url || '')) {
    throw new Error('该页面无法分析（浏览器内部页）');
  }

  // 2. 提取页面内容
  // content script 返回 { type, data } 包装；必须解包取 data 再传给下游
  // （analyzeSite / assessContentSufficiency 需要的是 extractPageContent 的返回值本身，
  //   曾因误传整个包装对象，AI 收到空白网站信息）
  const resp = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONTENT' });
  const pageData = unwrapExtractionResponse(resp);

  // 2.1 内容充足性检测（不阻塞，仅推送警告）
  const sufficiency = assessContentSufficiency(pageData);
  if (!sufficiency.sufficient || sufficiency.warning) {
    notifyPopup('CONTENT_WARNING', {
      sufficient: sufficiency.sufficient,
      reason: sufficiency.reason,
      warning: sufficiency.warning,
    });
  }

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
    // 失败时附加分类后的用户提示
    if (update.status === 'rejected' && update.reason) {
      const classified = classifyError(update.reason);
      update.errorKind = classified.kind;
      update.errorUserMessage = classified.userMessage;
      update.retryable = classified.retryable;
    }
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
  if (msg.type === 'START_ANALYSIS_V2') {
    // M4 完整流程
    runAnalysis(msg.tabId)
      .then(() => sendResponse({ type: 'OK' }))
      .catch((err) => {
        notifyPopup('ANALYSIS_DONE', { overall: 'error', error: err.message });
        sendResponse({ type: 'ERROR', error: err.message });
      });
    return true;
  }

  if (msg.type === 'RETRY_QUESTION') {
    // 单问重试（M4 阶段简化为重新全量分析，后续优化）
    runAnalysis(msg.tabId, [msg.key])
      .then(() => sendResponse({ type: 'OK' }))
      .catch((err) => {
        // 与 START_ANALYSIS_V2 一致：失败必须推送 ANALYSIS_DONE(error)。
        // runAnalysis 可能在 content 提取阶段（chrome.tabs.sendMessage）就 reject，
        // 走不到会发 QUESTION_PROGRESS 的 analyzeSite；而 sidepanel 又是「无回调」发
        // RETRY_QUESTION（不接 sendResponse），不推 ANALYSIS_DONE 则三路信号全断、标签永久卡 loading。
        notifyPopup('ANALYSIS_DONE', { overall: 'error', error: err.message });
        sendResponse({ type: 'ERROR', error: err.message });
      });
    return true;
  }

  if (msg.type === 'RETRY_ALL_FAILED') {
    runAnalysis(msg.tabId)
      .then(() => sendResponse({ type: 'OK' }))
      .catch((err) => sendResponse({ type: 'ERROR', error: err.message }));
    return true;
  }

  if (msg.type === 'GET_RESULTS') {
    sendResponse({ results: currentResults });
    return false;
  }
});
