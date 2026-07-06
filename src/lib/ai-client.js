// AI 客户端封装（支持依赖注入 fetch，便于测试）
// MVP 阶段仅支持 OpenAI 兼容请求格式（通义千问/DeepSeek/OpenAI/智谱 均兼容）

/**
 * 创建 AI 客户端
 * @param {Object} options
 * @param {Object} options.provider 服务商配置（来自 providers.js）
 * @param {string} options.apiKey
 * @param {string} [options.model] 模型名（缺省用 provider.defaultModel）
 * @param {Function} [options.fetchImpl] 可注入的 fetch（测试用，默认全局 fetch）
 * @returns {{ chat: (userMessage: string, systemPrompt?: string) => Promise<string> }}
 */
export function createAiClient({ provider, apiKey, model, fetchImpl }) {
  const fetchFn = fetchImpl || fetch;
  const useModel = model || provider.defaultModel;

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

      let resp;
      try {
        resp = await fetchFn(provider.endpoint, {
          method: 'POST',
          headers,
          body,
        });
      } catch (e) {
        throw new Error('network 请求失败：' + e.message);
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
