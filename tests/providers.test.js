import { describe, it, expect } from 'vitest';
import {
  getProvider,
  listProviderIds,
  DEFAULT_PROVIDER_ID,
} from '../src/config/providers.js';

describe('AI 服务商配置 providers', () => {
  it('包含通义千问（默认国内）', () => {
    const p = getProvider('qwen');
    expect(p).toBeDefined();
    expect(p.id).toBe('qwen');
    expect(p.name).toContain('通义');
    expect(p.endpoint).toContain('dashscope.aliyuncs.com');
    expect(p.defaultModel).toBeTruthy();
  });

  it('包含 DeepSeek', () => {
    const p = getProvider('deepseek');
    expect(p).toBeDefined();
    expect(p.endpoint).toContain('deepseek.com');
  });

  it('包含 OpenAI', () => {
    const p = getProvider('openai');
    expect(p).toBeDefined();
    expect(p.endpoint).toContain('openai.com');
  });

  it('每个服务商含必要字段', () => {
    const ids = listProviderIds();
    expect(ids.length).toBeGreaterThanOrEqual(3);
    for (const id of ids) {
      const p = getProvider(id);
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('endpoint');
      expect(p).toHaveProperty('defaultModel');
      expect(p).toHaveProperty('requestFormat'); // 'openai' | 'anthropic' 等
      expect(typeof p.buildHeaders).toBe('function'); // 构造请求头（含 Key）
    }
  });

  it('默认服务商为通义千问', () => {
    expect(DEFAULT_PROVIDER_ID).toBe('qwen');
  });

  it('getProvider 对未知 id 返回 undefined', () => {
    expect(getProvider('nonexistent')).toBeUndefined();
  });

  it('buildHeaders 包含 Authorization 与 Content-Type', () => {
    const p = getProvider('qwen');
    const headers = p.buildHeaders('sk-test-key');
    expect(headers['Authorization']).toBe('Bearer sk-test-key');
    expect(headers['Content-Type']).toBe('application/json');
  });
});
