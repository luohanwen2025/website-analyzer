import { describe, it, expect } from 'vitest';
import { validateConfig } from '../src/lib/config-validator.js';

describe('validateConfig', () => {
  it('免费体验模式始终有效（无需 Key）', () => {
    const result = validateConfig({ mode: 'free', providerId: 'qwen', apiKey: '' });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('自有 Key 模式且 Key 非空时有效', () => {
    const result = validateConfig({
      mode: 'self',
      providerId: 'qwen',
      apiKey: 'sk-abc123',
      model: 'qwen-plus',
    });
    expect(result.valid).toBe(true);
  });

  it('自有 Key 模式但 Key 为空时无效', () => {
    const result = validateConfig({
      mode: 'self',
      providerId: 'qwen',
      apiKey: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('自有 Key 模式下必须填写 API Key');
  });

  it('自有 Key 模式但 Key 仅空白字符时无效', () => {
    const result = validateConfig({
      mode: 'self',
      providerId: 'qwen',
      apiKey: '   ',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('未知服务商 id 时无效', () => {
    const result = validateConfig({
      mode: 'self',
      providerId: 'unknown-provider',
      apiKey: 'sk-test',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('服务商'))).toBe(true);
  });

  it('未知模式时无效', () => {
    const result = validateConfig({
      mode: 'invalid',
      providerId: 'qwen',
      apiKey: 'sk-test',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('模式'))).toBe(true);
  });

  it('Key 自动去除首尾空格', () => {
    const result = validateConfig({
      mode: 'self',
      providerId: 'qwen',
      apiKey: '  sk-real-key  ',
    });
    expect(result.valid).toBe(true);
    expect(result.normalized.apiKey).toBe('sk-real-key');
  });

  it('返回 normalized 字段（规范化后的配置）', () => {
    const result = validateConfig({
      mode: 'self',
      providerId: 'qwen',
      apiKey: '  sk-key  ',
      model: '  qwen-plus  ',
    });
    expect(result.normalized.apiKey).toBe('sk-key');
    expect(result.normalized.model).toBe('qwen-plus');
  });

  it('免费体验模式忽略空 Key（不报错）', () => {
    const result = validateConfig({ mode: 'free', providerId: 'qwen', apiKey: '' });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
