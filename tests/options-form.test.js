import { describe, it, expect } from 'vitest';
import {
  buildConfigFromForm,
  resolveModelOnProviderChange,
} from '../src/lib/options-form.js';
import { buildProviderOptions } from '../src/lib/provider-options.js';

const PROVIDER_OPTIONS = buildProviderOptions();

describe('设置页表单纯函数 options-form', () => {
  describe('buildConfigFromForm', () => {
    it('免费模式下 apiKey 强制清空', () => {
      const config = buildConfigFromForm({
        mode: 'free',
        providerId: 'qwen',
        apiKey: '  sk-should-be-dropped  ',
        model: 'qwen-plus',
      });
      expect(config.apiKey).toBe('');
    });

    it('自有 Key 模式下保留并 trim apiKey', () => {
      const config = buildConfigFromForm({
        mode: 'self',
        providerId: 'deepseek',
        apiKey: '  sk-abc123  ',
        model: 'deepseek-chat',
      });
      expect(config.apiKey).toBe('sk-abc123');
      expect(config.mode).toBe('self');
      expect(config.providerId).toBe('deepseek');
    });

    it('trim mode/providerId/model', () => {
      const config = buildConfigFromForm({
        mode: '  self  ',
        providerId: '  qwen  ',
        apiKey: 'sk-x',
        model: '  qwen-plus  ',
      });
      expect(config.mode).toBe('self');
      expect(config.providerId).toBe('qwen');
      expect(config.model).toBe('qwen-plus');
    });

    it('model 为空字符串时保留空字符串', () => {
      const config = buildConfigFromForm({
        mode: 'self',
        providerId: 'qwen',
        apiKey: 'sk-x',
        model: '',
      });
      expect(config.model).toBe('');
    });
  });

  describe('resolveModelOnProviderChange', () => {
    it('切换服务商时若当前 model 为空，返回新服务商默认模型', () => {
      const next = resolveModelOnProviderChange({
        newProviderId: 'deepseek',
        oldProviderId: 'qwen',
        currentModel: '',
        providerOptions: PROVIDER_OPTIONS,
      });
      expect(next).toBe('deepseek-chat');
    });

    it('切换服务商时若当前 model 等于旧服务商默认模型，返回新服务商默认模型', () => {
      const next = resolveModelOnProviderChange({
        newProviderId: 'deepseek',
        oldProviderId: 'qwen',
        currentModel: 'qwen-plus', // qwen 默认
        providerOptions: PROVIDER_OPTIONS,
      });
      expect(next).toBe('deepseek-chat');
    });

    it('切换服务商时若当前 model 是用户自定义（非旧默认），保留用户输入', () => {
      const next = resolveModelOnProviderChange({
        newProviderId: 'deepseek',
        oldProviderId: 'qwen',
        currentModel: 'qwen-turbo', // 用户自定义
        providerOptions: PROVIDER_OPTIONS,
      });
      expect(next).toBe('qwen-turbo');
    });

    it('未切换服务商（新旧相同）时保留当前 model', () => {
      const next = resolveModelOnProviderChange({
        newProviderId: 'qwen',
        oldProviderId: 'qwen',
        currentModel: 'qwen-plus',
        providerOptions: PROVIDER_OPTIONS,
      });
      expect(next).toBe('qwen-plus');
    });

    it('新服务商不存在于选项时保留当前 model', () => {
      const next = resolveModelOnProviderChange({
        newProviderId: 'unknown',
        oldProviderId: 'qwen',
        currentModel: 'qwen-plus',
        providerOptions: PROVIDER_OPTIONS,
      });
      expect(next).toBe('qwen-plus');
    });
  });
});
