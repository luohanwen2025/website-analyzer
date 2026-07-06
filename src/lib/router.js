// 调用模式路由：根据调用模式解析最终请求参数
// 免费体验 → 中转服务（共享 Key + 设备配额）；自有 Key → 直连服务商

import { getProvider } from '../config/providers.js';

/**
 * 解析最终请求配置
 * @param {Object} config { mode, providerId, apiKey?, model?, deviceId? }
 * @param {Object} env { proxyBase } 中转服务基础地址
 * @returns {Object} { endpoint, apiKey, model, isProxy, deviceId?, headers }
 */
export function resolveRequestConfig(config, env) {
  const provider = getProvider(config.providerId);
  if (!provider) {
    throw new Error(`未知服务商: ${config.providerId}`);
  }

  if (config.mode === 'self') {
    if (!config.apiKey) {
      throw new Error('自有 Key 模式缺少 apiKey');
    }
    return {
      endpoint: provider.endpoint,
      apiKey: config.apiKey,
      model: config.model || provider.defaultModel,
      isProxy: false,
      headers: {},
    };
  }

  if (config.mode === 'free') {
    if (!config.deviceId) {
      throw new Error('免费体验模式缺少 deviceId');
    }
    return {
      endpoint: `${env.proxyBase}/${config.providerId}`,
      apiKey: 'proxy-managed',
      model: provider.defaultModel,
      isProxy: true,
      deviceId: config.deviceId,
      headers: { 'X-Device-Id': config.deviceId },
    };
  }

  throw new Error(`未知调用模式: ${config.mode}`);
}
