// AI 客户端封装（支持依赖注入 fetch，便于测试）
// MVP 阶段仅支持 OpenAI 兼容请求格式（通义千问/DeepSeek/OpenAI/智谱 均兼容）
// M7：加入超时控制（AbortController + timeoutMs）

export const DEFAULT_TIMEOUT_MS = 30000; // 单问超时上限（需求 5.1：整体 20s，单问留余量）

/**
 * 创建 AI 客户端
 * @param {Object} options
 * @param {Object} options.provider 服务商配置（来自 providers.js）
 * @param {string} options.apiKey
 * @param {string} [options.model] 模型名（缺省用 provider.defaultModel）
 * @param {Function} [options.fetchImpl] 可注入的 fetch（测试用，默认全局 fetch）
 * @param {number} [options.timeoutMs=DEFAULT_TIMEOUT_MS] 超时毫秒，0 表示禁用
 * @param {AbortSignal} [options.signal] 外部 signal（如页面卸载）
 * @returns {{ chat: (userMessage: string, systemPrompt?: string) => Promise<string> }}
 */
export function createAiClient({ provider, apiKey, model, fetchImpl, timeoutMs, signal }) {
  const fetchFn = fetchImpl || fetch;
  const useModel = model || provider.defaultModel;
  const timeout = typeof timeoutMs === 'number' ? timeoutMs : DEFAULT_TIMEOUT_MS;

  return {
    /**
     * 发起一次 chat 请求
     * @param {string} userMessage
     * @param {string} [systemPrompt]
     * @returns {Promise<string>} AI 返回的文本
     */
    async chat(userMessage, systemPrompt) {
      const messages = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: userMessage });

      const body = JSON.stringify({ model: useModel, messages });
      const headers = provider.buildHeaders(apiKey);

      // 超时控制
      let signalForFetch;
      let timeoutId;
      const controller = (timeout > 0) ? new AbortController() : null;

      if (controller) {
        signalForFetch = controller.signal;
        // 外部 signal 合并：外部 abort 时同步 abort 内部
        if (signal) {
          if (signal.aborted) {
            throw new DOMException('The operation was aborted', 'AbortError');
          }
          signal.addEventListener('abort', () => controller.abort(), { once: true });
        }
        timeoutId = setTimeout(() => controller.abort(), timeout);
      } else if (signal && signal.aborted) {
        throw new DOMException('The operation was aborted', 'AbortError');
      }

      let resp;
      try {
        const fetchOpts = { method: 'POST', headers, body };
        if (signalForFetch) fetchOpts.signal = signalForFetch;
        resp = await fetchFn(provider.endpoint, fetchOpts);
      } catch (e) {
        // 区分超时 abort 与普通网络错误
        if (controller && controller.signal.aborted) {
          throw new Error('请求超时（' + timeout + 'ms）');
        }
        throw new Error('network 请求失败：' + e.message);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`AI 请求失败 ${resp.status}：${errText.slice(0, 200)}`);
      }

      const data = await resp.json();
      const content =
        data &&
        Array.isArray(data.choices) &&
        data.choices[0] &&
        data.choices[0].message &&
        data.choices[0].message.content;

      if (typeof content !== 'string') {
        throw new Error('AI 响应解析失败：缺少 choices[0].message.content');
      }
      return content;
    },
  };
}
