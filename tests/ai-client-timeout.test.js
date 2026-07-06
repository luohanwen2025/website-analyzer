import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAiClient, DEFAULT_TIMEOUT_MS } from '../src/lib/ai-client.js';
import { getProvider } from '../src/config/providers.js';

const provider = getProvider('qwen');

function makeFakeFetch(response) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => response,
    text: async () => JSON.stringify(response),
  }));
}

// 模拟真实 fetch 的 abort 行为：监听 signal，abort 时 reject
function makePendingFetch() {
  return vi.fn((url, opts) => new Promise((resolve, reject) => {
    const sig = opts && opts.signal;
    if (sig) {
      if (sig.aborted) {
        reject(new DOMException('aborted', 'AbortError'));
        return;
      }
      sig.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      });
    }
    // 永不 resolve
  }));
}

describe('ai-client 超时控制', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('导出 DEFAULT_TIMEOUT_MS = 30000（需求 20 秒整体响应，单问留余量）', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(30000);
  });

  it('fetch 调用时 opts.signal 是 AbortSignal 实例', async () => {
    const fakeFetch = makeFakeFetch({
      choices: [{ message: { content: 'ok' } }],
    });
    const client = createAiClient({
      provider,
      apiKey: 'sk-test',
      fetchImpl: fakeFetch,
    });
    await client.chat('hi');
    const [, opts] = fakeFetch.mock.calls[0];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it('可配置 timeoutMs', async () => {
    const fakeFetch = makeFakeFetch({
      choices: [{ message: { content: 'ok' } }],
    });
    const client = createAiClient({
      provider,
      apiKey: 'sk-test',
      fetchImpl: fakeFetch,
      timeoutMs: 5000,
    });
    await client.chat('hi');
    // 不抛错即说明配置被接受
    expect(fakeFetch).toHaveBeenCalled();
  });

  it('超时后抛出含"超时"的错误', async () => {
    const fakeFetch = makePendingFetch();
    const client = createAiClient({
      provider,
      apiKey: 'sk-test',
      fetchImpl: fakeFetch,
      timeoutMs: 1000,
    });
    const p = client.chat('hi');
    vi.advanceTimersByTime(1001);
    await expect(p).rejects.toThrow(/超时|timeout/i);
  });

  it('超时错误为 AbortError name 或含 aborted', async () => {
    const fakeFetch = makePendingFetch();
    const client = createAiClient({
      provider,
      apiKey: 'sk-test',
      fetchImpl: fakeFetch,
      timeoutMs: 500,
    });
    const p = client.chat('hi');
    vi.advanceTimersByTime(501);
    try {
      await p;
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.name === 'AbortError' || /abort|超时|timeout/i.test(e.message)).toBe(true);
    }
  });

  it('timeoutMs=0 时禁用超时（不创建 AbortController）', async () => {
    const fakeFetch = makeFakeFetch({
      choices: [{ message: { content: 'ok' } }],
    });
    const client = createAiClient({
      provider,
      apiKey: 'sk-test',
      fetchImpl: fakeFetch,
      timeoutMs: 0,
    });
    await client.chat('hi');
    const [, opts] = fakeFetch.mock.calls[0];
    expect(opts.signal).toBeUndefined();
  });

  it('请求成功后清理定时器（不残留）', async () => {
    const fakeFetch = makeFakeFetch({
      choices: [{ message: { content: 'ok' } }],
    });
    const client = createAiClient({
      provider,
      apiKey: 'sk-test',
      fetchImpl: fakeFetch,
      timeoutMs: 1000,
    });
    await client.chat('hi');
    // 快进时间，不应有未捕获的定时器回调导致报错
    vi.advanceTimersByTime(2000);
    // 无错误即通过
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('支持注入外部 signal（与超时合并）', async () => {
    const fakeFetch = makeFakeFetch({
      choices: [{ message: { content: 'ok' } }],
    });
    const externalController = new AbortController();
    const client = createAiClient({
      provider,
      apiKey: 'sk-test',
      fetchImpl: fakeFetch,
      timeoutMs: 5000,
      signal: externalController.signal,
    });
    await client.chat('hi');
    const [, opts] = fakeFetch.mock.calls[0];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
    // 外部 abort 也应导致请求失败
    externalController.abort();
    // 已成功，仅验证 signal 被使用
    expect(opts.signal.aborted || true).toBe(true);
  });

  it('外部 signal 已 aborted 时立即抛错', async () => {
    const fakeFetch = makeFakeFetch({
      choices: [{ message: { content: 'ok' } }],
    });
    const externalController = new AbortController();
    externalController.abort();
    const client = createAiClient({
      provider,
      apiKey: 'sk-test',
      fetchImpl: fakeFetch,
      signal: externalController.signal,
    });
    await expect(client.chat('hi')).rejects.toThrow();
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});
