import { describe, it, expect } from 'vitest';
import { handleProxyRequest } from '../src/lib/proxy-handler.js';
import { createQuotaChecker } from '../src/lib/quota-checker.js';

// 内存 KV
function createMemoryKV() {
  const store = new Map();
  return {
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
  };
}

// 上游服务商配置解析（注入版）
const upstreamResolver = (providerId) => {
  const map = {
    qwen: {
      endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      apiKey: 'sk-qwen-real',
      defaultModel: 'qwen-plus',
    },
    deepseek: {
      endpoint: 'https://api.deepseek.com/v1/chat/completions',
      apiKey: 'sk-deepseek-real',
      defaultModel: 'deepseek-chat',
    },
  };
  return map[providerId] || null;
};

// 构造 mock fetch：返回固定 200 + OpenAI 兼容响应
function createMockFetch(responseBody, status = 200) {
  return async (url, options) => {
    mockFetch.lastUrl = url;
    mockFetch.lastOptions = options;
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
const mockFetch = createMockFetch({
  choices: [{ message: { content: 'AI 回答' } }],
});

function makeRequest(path, { method = 'POST', headers = {}, body } = {}) {
  const url = `https://proxy.example.com${path}`;
  const init = { method, headers };
  if (body) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request(url, init);
}

describe('中转请求处理器 handleProxyRequest', () => {
  function makeDeps(limit = 3) {
    const kv = createMemoryKV();
    return {
      quotaChecker: createQuotaChecker(kv, { limit }),
      resolveUpstream: upstreamResolver,
      fetchImpl: mockFetch,
    };
  }

  it('OPTIONS 预检返回 204', async () => {
    const req = makeRequest('/api/ai/qwen', { method: 'OPTIONS' });
    const resp = await handleProxyRequest(req, makeDeps());
    expect(resp.status).toBe(204);
  });

  it('非 POST 方法返回 405', async () => {
    const req = makeRequest('/api/ai/qwen', { method: 'GET' });
    const resp = await handleProxyRequest(req, makeDeps());
    expect(resp.status).toBe(405);
  });

  it('路径不匹配 /api/ai/:provider 返回 404', async () => {
    const req = makeRequest('/foo', {
      headers: { 'X-Device-Id': 'dev-a' },
      body: { messages: [] },
    });
    const resp = await handleProxyRequest(req, makeDeps());
    expect(resp.status).toBe(404);
  });

  it('缺少 X-Device-Id 返回 400', async () => {
    const req = makeRequest('/api/ai/qwen', {
      body: { messages: [] },
    });
    const resp = await handleProxyRequest(req, makeDeps());
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain('Device-Id');
  });

  it('未知 providerId 返回 400', async () => {
    const req = makeRequest('/api/ai/unknown', {
      headers: { 'X-Device-Id': 'dev-a' },
      body: { messages: [] },
    });
    const resp = await handleProxyRequest(req, makeDeps());
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toContain('unknown');
  });

  it('正常流程：检查配额→转发上游→递增配额→返回 200', async () => {
    const deps = makeDeps();
    const req = makeRequest('/api/ai/qwen', {
      headers: { 'X-Device-Id': 'dev-a' },
      body: { model: 'qwen-plus', messages: [{ role: 'user', content: 'hi' }] },
    });
    const resp = await handleProxyRequest(req, deps);
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.choices[0].message.content).toBe('AI 回答');

    // 上游收到正确请求
    expect(mockFetch.lastUrl).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
    );
    const upstreamBody = JSON.parse(mockFetch.lastOptions.body);
    expect(upstreamBody.model).toBe('qwen-plus');
    expect(upstreamBody.messages[0].content).toBe('hi');
    expect(mockFetch.lastOptions.headers['Authorization']).toBe(
      'Bearer sk-qwen-real'
    );

    // 配额已递增
    const quota = await deps.quotaChecker.check('dev-a', null);
    expect(quota.used).toBe(1);
  });

  it('配额已满时返回 429 且不调用上游', async () => {
    const deps = makeDeps(1);
    // 先用掉配额
    await deps.quotaChecker.increment('dev-a', null);
    let fetchCalled = false;
    const deps2 = {
      ...deps,
      fetchImpl: async () => {
        fetchCalled = true;
        return new Response('{}', { status: 200 });
      },
    };
    const req = makeRequest('/api/ai/qwen', {
      headers: { 'X-Device-Id': 'dev-a' },
      body: { messages: [] },
    });
    const resp = await handleProxyRequest(req, deps2);
    expect(resp.status).toBe(429);
    expect(fetchCalled).toBe(false);
    const body = await resp.json();
    expect(body.error).toMatch(/配额|额度|quota/i);
    expect(body.remaining).toBe(0);
  });

  it('上游返回 4xx 错误时透传状态码与 body', async () => {
    const deps = {
      ...makeDeps(),
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: 'invalid_api_key' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
    };
    const req = makeRequest('/api/ai/qwen', {
      headers: { 'X-Device-Id': 'dev-a' },
      body: { messages: [] },
    });
    const resp = await handleProxyRequest(req, deps);
    expect(resp.status).toBe(401);
    const body = await resp.json();
    expect(body.error).toBe('invalid_api_key');
  });

  it('请求 body 不是合法 JSON 时返回 400', async () => {
    const req = makeRequest('/api/ai/qwen', {
      headers: { 'X-Device-Id': 'dev-a' },
      body: 'not-json',
    });
    const resp = await handleProxyRequest(req, makeDeps());
    expect(resp.status).toBe(400);
  });

  it('响应包含 CORS 头', async () => {
    const req = makeRequest('/api/ai/qwen', {
      headers: { 'X-Device-Id': 'dev-a' },
      body: { messages: [] },
    });
    const resp = await handleProxyRequest(req, makeDeps());
    expect(resp.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('正常调用后配额递增到上限时第二次拒绝', async () => {
    const deps = makeDeps(1);
    const mk = () =>
      makeRequest('/api/ai/qwen', {
        headers: { 'X-Device-Id': 'dev-a' },
        body: { messages: [] },
      });
    const r1 = await handleProxyRequest(mk(), deps);
    expect(r1.status).toBe(200);
    const r2 = await handleProxyRequest(mk(), deps);
    expect(r2.status).toBe(429);
  });
});
