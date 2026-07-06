import { describe, it, expect } from 'vitest';
import { createQuotaChecker } from '../src/lib/quota-checker.js';
import { QUOTA_LIMIT_PER_DAY } from '../src/lib/quota.js';

// 内存版 KV storage，模拟 Cloudflare KV 接口
function createMemoryKV() {
  const store = new Map();
  return {
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value, options) {
      store.set(key, value);
      // 忽略 expirationTtl（内存版不实现过期）
    },
    _raw: store,
  };
}

describe('配额检查器 quota-checker', () => {
  it('首次调用返回 allowed=true, used=0, remaining=limit', async () => {
    const kv = createMemoryKV();
    const checker = createQuotaChecker(kv);
    const r = await checker.check('dev-abc', '2026-07-06');
    expect(r.allowed).toBe(true);
    expect(r.used).toBe(0);
    expect(r.remaining).toBe(QUOTA_LIMIT_PER_DAY);
  });

  it('increment 后再次 check 反映已用 1 次', async () => {
    const kv = createMemoryKV();
    const checker = createQuotaChecker(kv);
    await checker.increment('dev-abc', '2026-07-06');
    const r = await checker.check('dev-abc', '2026-07-06');
    expect(r.used).toBe(1);
    expect(r.remaining).toBe(QUOTA_LIMIT_PER_DAY - 1);
    expect(r.allowed).toBe(true);
  });

  it('increment 多次后达到上限时拒绝', async () => {
    const kv = createMemoryKV();
    const checker = createQuotaChecker(kv, { limit: 3 });
    await checker.increment('dev-abc', '2026-07-06');
    await checker.increment('dev-abc', '2026-07-06');
    await checker.increment('dev-abc', '2026-07-06');
    const r = await checker.check('dev-abc', '2026-07-06');
    expect(r.used).toBe(3);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it('不同 deviceId 互不影响', async () => {
    const kv = createMemoryKV();
    const checker = createQuotaChecker(kv, { limit: 2 });
    await checker.increment('dev-a', '2026-07-06');
    await checker.increment('dev-a', '2026-07-06');
    const a = await checker.check('dev-a', '2026-07-06');
    const b = await checker.check('dev-b', '2026-07-06');
    expect(a.allowed).toBe(false);
    expect(b.allowed).toBe(true);
    expect(b.used).toBe(0);
  });

  it('同 deviceId 不同日期互不影响', async () => {
    const kv = createMemoryKV();
    const checker = createQuotaChecker(kv, { limit: 2 });
    await checker.increment('dev-a', '2026-07-06');
    await checker.increment('dev-a', '2026-07-06');
    const today = await checker.check('dev-a', '2026-07-06');
    const tomorrow = await checker.check('dev-a', '2026-07-07');
    expect(today.allowed).toBe(false);
    expect(tomorrow.allowed).toBe(true);
    expect(tomorrow.used).toBe(0);
  });

  it('checkAndIncrement 在允许时递增并返回新状态', async () => {
    const kv = createMemoryKV();
    const checker = createQuotaChecker(kv, { limit: 2 });
    const r1 = await checker.checkAndIncrement('dev-abc', '2026-07-06');
    expect(r1.allowed).toBe(true);
    expect(r1.used).toBe(1); // 递增后
    expect(r1.remaining).toBe(1);

    const r2 = await checker.checkAndIncrement('dev-abc', '2026-07-06');
    expect(r2.allowed).toBe(true);
    expect(r2.used).toBe(2);
    expect(r2.remaining).toBe(0);
  });

  it('checkAndIncrement 在已达上限时不递增并返回拒绝', async () => {
    const kv = createMemoryKV();
    const checker = createQuotaChecker(kv, { limit: 1 });
    const r1 = await checker.checkAndIncrement('dev-abc', '2026-07-06');
    expect(r1.allowed).toBe(true);
    expect(r1.used).toBe(1);

    const r2 = await checker.checkAndIncrement('dev-abc', '2026-07-06');
    expect(r2.allowed).toBe(false);
    expect(r2.used).toBe(1); // 未递增
    expect(r2.remaining).toBe(0);
  });

  it('KV 中存的值是字符串数字', async () => {
    const kv = createMemoryKV();
    const checker = createQuotaChecker(kv);
    await checker.increment('dev-abc', '2026-07-06');
    const raw = await kv.get('quota:dev-abc:2026-07-06');
    expect(raw).toBe('1');
  });

  it('KV 中已存在非数字值时按 0 处理', async () => {
    const kv = createMemoryKV();
    await kv.put('quota:dev-abc:2026-07-06', 'garbage');
    const checker = createQuotaChecker(kv);
    const r = await checker.check('dev-abc', '2026-07-06');
    expect(r.used).toBe(0);
    expect(r.allowed).toBe(true);
  });

  it('支持注入自定义 limit', async () => {
    const kv = createMemoryKV();
    const checker = createQuotaChecker(kv, { limit: 10 });
    const r = await checker.check('dev-abc', '2026-07-06');
    expect(r.remaining).toBe(10);
  });

  it('checkAndIncrement 支持注入 now 用于测试', async () => {
    const kv = createMemoryKV();
    const checker = createQuotaChecker(kv, { limit: 2 });
    const fixedDate = new Date('2026-12-25T00:00:00+08:00');
    await checker.checkAndIncrement('dev-abc', null, { now: fixedDate });
    const raw = await kv.get('quota:dev-abc:2026-12-25');
    expect(raw).toBe('1');
  });
});
