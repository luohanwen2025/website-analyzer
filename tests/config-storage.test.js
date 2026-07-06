import { describe, it, expect, vi } from 'vitest';
import { createConfigStorage } from '../src/lib/config-storage.js';

// 可控的内存版 storage
function makeMemoryStorage() {
  const store = new Map();
  return {
    get: vi.fn(async (keys) => {
      if (keys == null) return Object.fromEntries(store);
      const arr = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const k of arr) if (store.has(k)) out[k] = store.get(k);
      return out;
    }),
    set: vi.fn(async (obj) => {
      for (const [k, v] of Object.entries(obj)) store.set(k, v);
    }),
  };
}

describe('createConfigStorage', () => {
  it('读取空存储返回默认配置', async () => {
    const storage = createConfigStorage(makeMemoryStorage());
    const config = await storage.load();
    expect(config.mode).toBe('free');
    expect(config.providerId).toBe('qwen');
    expect(config.apiKey).toBe('');
  });

  it('保存配置后能读回', async () => {
    const mem = makeMemoryStorage();
    const storage = createConfigStorage(mem);
    await storage.save({
      mode: 'self',
      providerId: 'deepseek',
      apiKey: 'sk-test',
      model: 'deepseek-chat',
    });
    const config = await storage.load();
    expect(config.mode).toBe('self');
    expect(config.providerId).toBe('deepseek');
    expect(config.apiKey).toBe('sk-test');
    expect(config.model).toBe('deepseek-chat');
  });

  it('保存时先校验，无效配置抛错且不写入', async () => {
    const mem = makeMemoryStorage();
    const storage = createConfigStorage(mem);
    await expect(
      storage.save({ mode: 'self', providerId: 'qwen', apiKey: '' })
    ).rejects.toThrow();
    // 确认未写入
    const config = await storage.load();
    expect(config.mode).toBe('free'); // 仍是默认
  });

  it('保存时自动去除 Key 首尾空格', async () => {
    const mem = makeMemoryStorage();
    const storage = createConfigStorage(mem);
    await storage.save({
      mode: 'self',
      providerId: 'qwen',
      apiKey: '  sk-real  ',
      model: 'qwen-plus',
    });
    const config = await storage.load();
    expect(config.apiKey).toBe('sk-real');
  });

  it('reset 恢复为默认配置', async () => {
    const mem = makeMemoryStorage();
    const storage = createConfigStorage(mem);
    await storage.save({ mode: 'self', providerId: 'qwen', apiKey: 'sk-x', model: 'qwen-plus' });
    await storage.reset();
    const config = await storage.load();
    expect(config.mode).toBe('free');
    expect(config.apiKey).toBe('');
  });

  it('只更新部分字段（保留其他字段）', async () => {
    const mem = makeMemoryStorage();
    const storage = createConfigStorage(mem);
    await storage.save({ mode: 'self', providerId: 'qwen', apiKey: 'sk-1', model: 'qwen-plus' });
    await storage.update({ apiKey: 'sk-2' });
    const config = await storage.load();
    expect(config.apiKey).toBe('sk-2');
    expect(config.mode).toBe('self'); // 保留
    expect(config.providerId).toBe('qwen'); // 保留
  });
});
