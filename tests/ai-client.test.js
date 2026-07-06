import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAiClient } from '../src/lib/ai-client.js';
import { getProvider } from '../src/config/providers.js';

// 构造一个可控的 fake fetch
function makeFakeFetch(response) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => response,
    text: async () => JSON.stringify(response),
  }));
}

describe('createAiClient', () => {
  const provider = getProvider('qwen');

  it('调用 fetch 并返回 AI 文本响应', async () => {
    const fakeFetch = makeFakeFetch({
      choices: [{ message: { content: '# 分析结果\n网站是一个...' } }],
    });
    const client = createAiClient({ provider, apiKey: 'sk-test', fetchImpl: fakeFetch });
    const result = await client.chat('分析这个网站');
    expect(result).toBe('# 分析结果\n网站是一个...');
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it('使用服务商 endpoint 发起请求', async () => {
    const fakeFetch = makeFakeFetch({
      choices: [{ message: { content: 'ok' } }],
    });
    const client = createAiClient({ provider, apiKey: 'sk-test', fetchImpl: fakeFetch });
    await client.chat('hi');
    const [url] = fakeFetch.mock.calls[0];
    expect(url).toBe(provider.endpoint);
  });

  it('请求头含 Authorization Bearer Key', async () => {
    const fakeFetch = makeFakeFetch({
      choices: [{ message: { content: 'ok' } }],
    });
    const client = createAiClient({ provider, apiKey: 'sk-secret', fetchImpl: fakeFetch });
    await client.chat('hi');
    const [, opts] = fakeFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe('Bearer sk-secret');
  });

  it('请求体包含 model、system prompt、user prompt', async () => {
    const fakeFetch = makeFakeFetch({
      choices: [{ message: { content: 'ok' } }],
    });
    const client = createAiClient({
      provider,
      apiKey: 'sk-test',
      model: 'qwen-plus',
      fetchImpl: fakeFetch,
    });
    await client.chat('user message', 'system prompt');
    const [, opts] = fakeFetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('qwen-plus');
    expect(body.messages).toEqual([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'user message' },
    ]);
  });

  it('使用服务商默认 model（未指定时）', async () => {
    const fakeFetch = makeFakeFetch({
      choices: [{ message: { content: 'ok' } }],
    });
    const client = createAiClient({ provider, apiKey: 'sk-test', fetchImpl: fakeFetch });
    await client.chat('hi');
    const [, opts] = fakeFetch.mock.calls[0];
    expect(JSON.parse(opts.body).model).toBe('qwen-plus');
  });

  it('HTTP 非 2xx 抛出含状态码的错误', async () => {
    const fakeFetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    }));
    const client = createAiClient({ provider, apiKey: 'bad', fetchImpl: fakeFetch });
    await expect(client.chat('hi')).rejects.toThrow(/401/);
  });

  it('网络错误抛出含 network 的错误', async () => {
    const fakeFetch = vi.fn(async () => {
      throw new Error('network down');
    });
    const client = createAiClient({ provider, apiKey: 'sk-test', fetchImpl: fakeFetch });
    await expect(client.chat('hi')).rejects.toThrow(/network/);
  });

  it('响应缺少 choices 时抛出解析错误', async () => {
    const fakeFetch = makeFakeFetch({ unexpected: true });
    const client = createAiClient({ provider, apiKey: 'sk-test', fetchImpl: fakeFetch });
    await expect(client.chat('hi')).rejects.toThrow(/解析|格式|choices/i);
  });
});
