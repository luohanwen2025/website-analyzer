// Cloudflare Worker 入口（中转服务胶水层）
// 仅做 env 绑定：从 env 读取 KV namespace 和各服务商 API Key
// 业务逻辑全部委托给已测的 handleProxyRequest
//
// 部署后路径：https://<worker>.workers.dev/api/ai/:providerId
// 插件侧 PROXY_BASE 在 src/lib/config-loader.js 中配置

import { handleProxyRequest } from '../src/lib/proxy-handler.js';
import { createQuotaChecker } from '../src/lib/quota-checker.js';

// 上游服务商配置（endpoint + 从 env 读 apiKey）
// 仅暴露需要托管 Key 的服务商，未配置 Key 的会返回 400
function buildUpstreamResolver(env) {
  const configs = [
    {
      id: 'qwen',
      endpoint:
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      apiKey: env.AI_QWEN_KEY,
      defaultModel: 'qwen-plus',
    },
    {
      id: 'deepseek',
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      apiKey: env.AI_DEEPSEEK_KEY,
      defaultModel: 'deepseek-chat',
    },
    {
      id: 'zhipu',
      endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      apiKey: env.AI_ZHIPU_KEY,
      defaultModel: 'glm-4-flash',
    },
    {
      id: 'openai',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      apiKey: env.AI_OPENAI_KEY,
      defaultModel: 'gpt-4o-mini',
    },
  ];
  const map = new Map(configs.map((c) => [c.id, c]));
  return (providerId) => {
    const c = map.get(providerId);
    if (!c || !c.apiKey) return null;
    return c;
  };
}

export default {
  async fetch(request, env, ctx) {
    // 依赖：KV namespace（wrangler.toml 中绑定 QUOTA）
    const quotaChecker = createQuotaChecker(env.QUOTA, {
      limit: Number(env.QUOTA_LIMIT) || 3,
    });
    const resolveUpstream = buildUpstreamResolver(env);

    return handleProxyRequest(request, {
      quotaChecker,
      resolveUpstream,
      fetchImpl: fetch,
    });
  },
};
