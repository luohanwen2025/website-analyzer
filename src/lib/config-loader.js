// 配置加载器（纯函数，便于测试）
// 把 chrome.storage 中的用户配置与默认值合并

import { DEFAULT_PROVIDER_ID } from '../config/providers.js';

// 中转服务地址（M6 部署后替换为真实地址）
export const PROXY_BASE = 'https://wa-proxy.example.workers.dev/api/ai';

// 默认配置（对照需求文档 2.5 节）
export const DEFAULT_CONFIG = {
  mode: 'free', // 免费体验为默认
  providerId: DEFAULT_PROVIDER_ID,
  model: 'qwen-plus',
  apiKey: '',
};

const VALID_MODES = ['free', 'self'];

/**
 * 将用户存储的配置与默认值合并
 * @param {Object} stored chrome.storage 中的原始数据
 * @returns {Object} 合并后的完整配置
 */
export function mergeWithDefaults(stored) {
  const mode = VALID_MODES.includes(stored.mode) ? stored.mode : 'free';
  const providerId = stored.providerId || DEFAULT_CONFIG.providerId;
  const model = stored.model || DEFAULT_CONFIG.model;
  const apiKey = typeof stored.apiKey === 'string' ? stored.apiKey : '';

  return { mode, providerId, model, apiKey };
}
