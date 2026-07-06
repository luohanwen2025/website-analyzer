import { describe, it, expect } from 'vitest';
import { mergeWithDefaults, DEFAULT_CONFIG, PROXY_BASE } from '../src/lib/config-loader.js';

describe('mergeWithDefaults', () => {
  it('空存储返回免费体验默认配置', () => {
    const config = mergeWithDefaults({});
    expect(config.mode).toBe('free');
    expect(config.providerId).toBe('qwen');
    expect(config.model).toBe('qwen-plus');
    expect(config.apiKey).toBe('');
  });

  it('保留用户已有的自有 Key 配置', () => {
    const config = mergeWithDefaults({
      mode: 'self',
      providerId: 'deepseek',
      apiKey: 'sk-user',
      model: 'deepseek-chat',
    });
    expect(config.mode).toBe('self');
    expect(config.providerId).toBe('deepseek');
    expect(config.apiKey).toBe('sk-user');
    expect(config.model).toBe('deepseek-chat');
  });

  it('补全缺失字段（用户只存了 mode）', () => {
    const config = mergeWithDefaults({ mode: 'self' });
    expect(config.mode).toBe('self');
    // 补全默认 provider 与 model
    expect(config.providerId).toBe('qwen');
    expect(config.model).toBe('qwen-plus');
  });

  it('未知 mode 回退为 free', () => {
    const config = mergeWithDefaults({ mode: 'invalid' });
    expect(config.mode).toBe('free');
  });

  it('自有 Key 模式但 apiKey 为空，仍返回（调用时再校验）', () => {
    const config = mergeWithDefaults({ mode: 'self', apiKey: '' });
    expect(config.mode).toBe('self');
    expect(config.apiKey).toBe('');
  });

  it('包含 PROXY_BASE（中转服务地址）', () => {
    expect(typeof PROXY_BASE).toBe('string');
    expect(PROXY_BASE).toContain('http');
    expect(DEFAULT_CONFIG.mode).toBe('free');
  });

  it('deviceId 不由用户配置，由运行时生成', () => {
    const config = mergeWithDefaults({});
    expect(config.deviceId).toBeUndefined();
  });
});
