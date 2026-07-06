import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../src/lib/retry.js';

describe('withRetry', () => {
  it('首次成功则不重试', async () => {
    const fn = vi.fn(async () => 'ok');
    const result = await withRetry(fn, { maxAttempts: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('失败后重试直到成功', async () => {
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts < 3) throw new Error('fail');
      return 'success';
    });
    const result = await withRetry(fn, { maxAttempts: 3 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('超过最大重试次数后抛出最后一次错误', async () => {
    const fn = vi.fn(async () => {
      throw new Error('永远失败');
    });
    await expect(withRetry(fn, { maxAttempts: 2 })).rejects.toThrow('永远失败');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('默认重试 3 次（maxAttempts 默认值）', async () => {
    const fn = vi.fn(async () => {
      throw new Error('失败');
    });
    await expect(withRetry(fn)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('重试之间有退避延迟（可通过 backoffMs 配置为 0 加速测试）', async () => {
    const fn = vi.fn(async () => {
      throw new Error('失败');
    });
    const start = Date.now();
    await expect(
      withRetry(fn, { maxAttempts: 3, backoffMs: 10 })
    ).rejects.toThrow();
    const elapsed = Date.now() - start;
    // 2 次退避，约 20ms
    expect(elapsed).toBeGreaterThanOrEqual(15);
  });

  it('backoffMs 默认为 0（不延迟）', async () => {
    const fn = vi.fn(async () => {
      throw new Error('失败');
    });
    const start = Date.now();
    await expect(withRetry(fn, { maxAttempts: 2 })).rejects.toThrow();
    expect(Date.now() - start).toBeLessThan(50);
  });
});
