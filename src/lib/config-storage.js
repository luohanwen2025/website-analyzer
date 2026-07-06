// 配置存储适配层（依赖注入 chrome.storage，便于测试）
// 负责：读取、保存（含校验）、更新部分字段、重置

import { mergeWithDefaults, DEFAULT_CONFIG } from './config-loader.js';
import { validateConfig } from './config-validator.js';

const STORAGE_KEYS = ['mode', 'providerId', 'model', 'apiKey'];

/**
 * 创建配置存储
 * @param {Object} chromeStorage chrome.storage.local 或注入的 mock
 * @returns {Object}
 */
export function createConfigStorage(chromeStorage) {
  return {
    /** 读取配置（合并默认值） */
    async load() {
      const raw = await chromeStorage.get(STORAGE_KEYS);
      return mergeWithDefaults(raw);
    },

    /** 保存完整配置（先校验） */
    async save(config) {
      const { valid, errors, normalized } = validateConfig(config);
      if (!valid) {
        throw new Error('配置无效：' + errors.join('；'));
      }
      await chromeStorage.set({
        mode: normalized.mode,
        providerId: normalized.providerId,
        model: normalized.model,
        apiKey: normalized.apiKey,
      });
    },

    /** 更新部分字段（保留其他字段） */
    async update(partial) {
      const current = await this.load();
      const merged = { ...current, ...partial };
      await this.save(merged);
    },

    /** 重置为默认配置 */
    async reset() {
      await chromeStorage.set({
        mode: DEFAULT_CONFIG.mode,
        providerId: DEFAULT_CONFIG.providerId,
        model: DEFAULT_CONFIG.model,
        apiKey: DEFAULT_CONFIG.apiKey,
      });
    },
  };
}
