import { describe, it, expect } from 'vitest';
import { buildProviderOptions } from '../src/lib/provider-options.js';
import { getProvider, listProviderIds, DEFAULT_PROVIDER_ID } from '../src/config/providers.js';

describe('服务商下拉选项 buildProviderOptions', () => {
  it('返回所有服务商的选项', () => {
    const options = buildProviderOptions();
    expect(options.length).toBe(listProviderIds().length);
  });

  it('每项包含 value/label/model 三个字段', () => {
    const options = buildProviderOptions();
    for (const opt of options) {
      expect(opt).toHaveProperty('value');
      expect(opt).toHaveProperty('label');
      expect(opt).toHaveProperty('model');
      expect(typeof opt.value).toBe('string');
      expect(typeof opt.label).toBe('string');
      expect(typeof opt.model).toBe('string');
    }
  });

  it('value 等于 provider.id，label 等于 provider.name，model 等于 defaultModel', () => {
    const options = buildProviderOptions();
    for (const opt of options) {
      const p = getProvider(opt.value);
      expect(p).toBeDefined();
      expect(opt.label).toBe(p.name);
      expect(opt.model).toBe(p.defaultModel);
    }
  });

  it('默认服务商排在第一位', () => {
    const options = buildProviderOptions();
    expect(options[0].value).toBe(DEFAULT_PROVIDER_ID);
  });

  it('支持注入自定义 providers 字典', () => {
    const custom = {
      foo: { id: 'foo', name: 'Foo 服务', defaultModel: 'foo-1' },
      bar: { id: 'bar', name: 'Bar 服务', defaultModel: 'bar-2' },
    };
    const options = buildProviderOptions(custom);
    expect(options.length).toBe(2);
    expect(options[0].value).toBe('foo');
    expect(options[0].label).toBe('Foo 服务');
    expect(options[0].model).toBe('foo-1');
  });

  it('注入空对象返回空数组', () => {
    expect(buildProviderOptions({})).toEqual([]);
  });

  it('可指定默认服务商 id（排在第一位）', () => {
    const options = buildProviderOptions(undefined, { defaultId: 'deepseek' });
    expect(options[0].value).toBe('deepseek');
  });

  it('指定的默认服务商 id 不存在时保持原顺序', () => {
    const options = buildProviderOptions(undefined, { defaultId: 'nonexistent' });
    // 不抛错，且第一项仍是 providers.js 中第一个
    expect(options[0].value).toBe(listProviderIds()[0]);
  });
});
