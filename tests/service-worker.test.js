// 回归保护：RETRY_QUESTION 在分析失败时必须推送 ANALYSIS_DONE(error)，
// 否则 sidepanel 收不到结束信号，重试的标签会永久卡在 "正在分析…"。
// 背景：RETRY 的 catch 曾只有 sendResponse、缺 notifyPopup('ANALYSIS_DONE')，
//   而 runAnalysis 在 content 提取阶段（chrome.tabs.sendMessage）就 reject，
//   走不到会发 QUESTION_PROGRESS 的 analyzeSite；
//   sidepanel 又是「无回调」发 RETRY_QUESTION（不接 sendResponse），
//   三路信号（QUESTION_PROGRESS / ANALYSIS_DONE / sendResponse 回调）全断 → 标签永远 loading。
//   对比 START_ANALYSIS_V2 的 catch 有 notifyPopup('ANALYSIS_DONE', { overall:'error' })，故首次失败能显示、重试却卡死。
//
// 本测试是项目第一个 stub chrome.* 的集成测试（其余 289 个都只测 lib 纯函数），
// 原因是该 bug 在 service-worker 胶水层的控制流，纯函数测不到。

import { describe, it, expect, vi, beforeEach } from 'vitest';

/** 构造一个最小 chrome 桩，content script 通信按 contentError 决定成功/失败 */
function createChromeStub({ contentError = null } = {}) {
  const sentMessages = []; // chrome.runtime.sendMessage 发出的所有消息
  const listeners = []; // onMessage 注册的 listener
  return {
    sentMessages,
    listeners,
    chrome: {
      sidePanel: { setPanelBehavior: () => Promise.resolve() },
      storage: {
        local: {
          get: vi.fn(() => Promise.resolve({})),
          set: vi.fn(() => Promise.resolve()),
        },
      },
      runtime: {
        onMessage: { addListener: (fn) => listeners.push(fn) },
        sendMessage: (msg) => {
          sentMessages.push(msg);
          return Promise.resolve();
        },
      },
      tabs: {
        get: vi.fn(() => Promise.resolve({ id: 1, url: 'https://example.com' })),
        sendMessage: vi.fn(() =>
          contentError ? Promise.reject(new Error(contentError)) : Promise.resolve({ type: 'EXTRACTED_CONTENT', data: {} })
        ),
      },
    },
  };
}

/** 重置模块缓存后加载 service-worker，让其顶层 listener 注册到当前 chrome 桩 */
async function loadServiceWorker() {
  vi.resetModules();
  await import('../src/background/service-worker.js');
  return;
}

describe('service-worker RETRY_QUESTION 错误传播', () => {
  beforeEach(() => {
    delete globalThis.chrome;
  });

  it('分析失败时推送 ANALYSIS_DONE(error)，避免 sidepanel 卡 loading', async () => {
    const env = createChromeStub({
      contentError: 'Could not establish connection. Receiving end does not exist.',
    });
    globalThis.chrome = env.chrome;
    await loadServiceWorker();

    const listener = env.listeners[0];
    expect(listener).toBeTruthy();

    // 驱动 RETRY_QUESTION；sendResponse 被调（resolve）即代表 runAnalysis 已走完 catch
    await new Promise((resolve) => {
      listener({ type: 'RETRY_QUESTION', key: 'monetization', tabId: 1 }, {}, resolve);
    });

    const doneMsg = env.sentMessages.find((m) => m.type === 'ANALYSIS_DONE');
    expect(doneMsg, 'RETRY 失败应推送 ANALYSIS_DONE，否则 sidepanel 永远 loading').toBeTruthy();
    expect(doneMsg.overall).toBe('error');
  });
});
