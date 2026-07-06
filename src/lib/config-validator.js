// 配置校验（纯函数）
// 校验用户填写的配置是否可用，返回校验结果与规范化后的配置

import { getProvider } from '../config/providers.js';

const VALID_MODES = ['free', 'self'];

/**
 * 校验配置
 * @param {Object} config { mode, providerId, apiKey?, model? }
 * @returns {{ valid: boolean, errors: string[], normalized: Object }}
 */
export function validateConfig(config) {
  const errors = [];
  const normalized = { ...config };

  // 模式校验
  if (!VALID_MODES.includes(config.mode)) {
    errors.push(`未知的调用模式: ${config.mode}`);
  }

  // 服务商校验
  if (!getProvider(config.providerId)) {
    errors.push(`未知的服务商: ${config.providerId}`);
  }

  // Key 规范化（去首尾空格）
  if (typeof config.apiKey === 'string') {
    normalized.apiKey = config.apiKey.trim();
  }
  if (typeof config.model === 'string') {
    normalized.model = config.model.trim();
  }

  // 自有 Key 模式必须有 Key
  if (config.mode === 'self' && !normalized.apiKey) {
    errors.push('自有 Key 模式下必须填写 API Key');
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized,
  };
}
