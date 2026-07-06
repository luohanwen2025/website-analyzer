// AI 服务商配置（对照需求文档第 6 节）
// 国内可直连服务商优先（P0），海外主流为 P1/P2

export const DEFAULT_PROVIDER_ID = 'qwen';

// 统一请求格式：
// - 'openai'：OpenAI 兼容（通义千问/DeepSeek/OpenAI/智谱 均兼容此格式）
// - 'anthropic'：Anthropic 原生 messages 接口
// - 'gemini'：Google Gemini 接口
const PROVIDERS = {
  qwen: {
    id: 'qwen',
    name: '通义千问',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultModel: 'qwen-plus',
    requestFormat: 'openai',
    buildHeaders: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    requestFormat: 'openai',
    buildHeaders: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  zhipu: {
    id: 'zhipu',
    name: '智谱 GLM',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    defaultModel: 'glm-4-flash',
    requestFormat: 'openai',
    buildHeaders: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    requestFormat: 'openai',
    buildHeaders: (apiKey) => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    endpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-5-sonnet-20241022',
    requestFormat: 'anthropic',
    buildHeaders: (apiKey) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    }),
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-1.5-flash',
    requestFormat: 'gemini',
    buildHeaders: (apiKey) => ({
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    }),
  },
};

/**
 * 获取服务商配置
 * @param {string} id
 * @returns {Object|undefined}
 */
export function getProvider(id) {
  return PROVIDERS[id];
}

/**
 * 列出所有服务商 id
 * @returns {string[]}
 */
export function listProviderIds() {
  return Object.keys(PROVIDERS);
}
