import { describe, it, expect } from 'vitest';
import { resolveRequestConfig } from '../src/lib/router.js';
import { getProvider } from '../src/config/providers.js';

const PROXY_BASE = 'https://proxy.example.com/api/ai';

describe('resolveRequestConfig', () => {
  it('自有 Key 模式：直连服务商，使用用户 Key', () => {
    const config = {
      mode: 'self',
      providerId: 'qwen',
      apiKey: 'sk-user-key',
      model: 'qwen-plus',
    };
    const result = resolveRequestConfig(config, { proxyBase: PROXY_BASE });
    const provider = getProvider('qwen');
    expect(result.endpoint).toBe(provider.endpoint);
    expect(result.apiKey).toBe('sk-user-key');
    expect(result.model).toBe('qwen-plus');
    expect(result.isProxy).toBe(false);
  });

  it('免费体验模式：走中转服务，使用共享 Key', () => {
    const config = {
      mode: 'free',
      providerId: 'qwen',
      deviceId: 'dev-abc-123',
    };
    const result = resolveRequestConfig(config, { proxyBase: PROXY_BASE });
    expect(result.endpoint).toContain(PROXY_BASE);
    expect(result.isProxy).toBe(true);
    // 共享 Key 由中转服务托管，这里返回占位
    expect(result.apiKey).toBe('proxy-managed');
  });

  it('免费体验模式 endpoint 拼接服务商 id', () => {
    const config = {
      mode: 'free',
      providerId: 'deepseek',
      deviceId: 'dev-abc',
    };
    const result = resolveRequestConfig(config, { proxyBase: PROXY_BASE });
    expect(result.endpoint).toContain('deepseek');
  });

  it('免费体验模式附带 deviceId 用于配额', () => {
    const config = {
      mode: 'free',
      providerId: 'qwen',
      deviceId: 'dev-xyz',
    };
    const result = resolveRequestConfig(config, { proxyBase: PROXY_BASE });
    expect(result.deviceId).toBe('dev-xyz');
    expect(result.headers['X-Device-Id']).toBe('dev-xyz');
  });

  it('自有 Key 模式不附带 deviceId', () => {
    const config = {
      mode: 'self',
      providerId: 'qwen',
      apiKey: 'sk-user',
    };
    const result = resolveRequestConfig(config, { proxyBase: PROXY_BASE });
    expect(result.deviceId).toBeUndefined();
  });

  it('未知服务商 id 抛错', () => {
    const config = { mode: 'self', providerId: 'unknown', apiKey: 'sk' };
    expect(() => resolveRequestConfig(config, { proxyBase: PROXY_BASE })).toThrow();
  });

  it('未知调用模式抛错', () => {
    const config = { mode: 'invalid', providerId: 'qwen' };
    expect(() => resolveRequestConfig(config, { proxyBase: PROXY_BASE })).toThrow();
  });
});
