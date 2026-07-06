import { describe, it, expect } from 'vitest';
import {
  parseProviderIdFromPath,
  buildUpstreamRequest,
  createJsonResponse,
  createErrorResponse,
  extractDeviceId,
} from '../src/lib/proxy-forwarder.js';

describe('中转请求转发 proxy-forwarder', () => {
  describe('parseProviderIdFromPath', () => {
    it('从 /api/ai/qwen 解析出 qwen', () => {
      expect(parseProviderIdFromPath('/api/ai/qwen')).toBe('qwen');
    });

    it('从 /api/ai/deepseek 解析出 deepseek', () => {
      expect(parseProviderIdFromPath('/api/ai/deepseek')).toBe('deepseek');
    });

    it('忽略尾部斜杠', () => {
      expect(parseProviderIdFromPath('/api/ai/qwen/')).toBe('qwen');
    });

    it('不匹配前缀时返回 null', () => {
      expect(parseProviderIdFromPath('/foo/bar')).toBeNull();
    });

    it('路径仅 /api/ai 时返回 null', () => {
      expect(parseProviderIdFromPath('/api/ai')).toBeNull();
      expect(parseProviderIdFromPath('/api/ai/')).toBeNull();
    });

    it('多段路径只取第一段作为 providerId', () => {
      expect(parseProviderIdFromPath('/api/ai/qwen/extra')).toBe('qwen');
    });
  });

  describe('extractDeviceId', () => {
    it('从 X-Device-Id header 提取', () => {
      const headers = new Headers({ 'X-Device-Id': 'dev-abc123' });
      expect(extractDeviceId(headers)).toBe('dev-abc123');
    });

    it('header 不存在时抛错', () => {
      const headers = new Headers({});
      expect(() => extractDeviceId(headers)).toThrow();
    });

    it('header 为空字符串时抛错', () => {
      const headers = new Headers({ 'X-Device-Id': '' });
      expect(() => extractDeviceId(headers)).toThrow();
    });

    it('trim 空白字符', () => {
      const headers = new Headers({ 'X-Device-Id': '  dev-xyz  ' });
      expect(extractDeviceId(headers)).toBe('dev-xyz');
    });
  });

  describe('buildUpstreamRequest', () => {
    const upstream = {
      endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      apiKey: 'sk-real-key',
    };

    it('构造 GET 上游请求参数 {url, headers, body}', async () => {
      const incomingBody = {
        model: 'qwen-plus',
        messages: [{ role: 'user', content: 'hello' }],
      };
      const r = buildUpstreamRequest(incomingBody, upstream);
      expect(r.url).toBe(upstream.endpoint);
      expect(r.headers['Authorization']).toBe('Bearer sk-real-key');
      expect(r.headers['Content-Type']).toBe('application/json');
      expect(typeof r.body).toBe('string');
      const parsed = JSON.parse(r.body);
      expect(parsed.messages).toEqual(incomingBody.messages);
    });

    it('保留 incomingBody 中的 model 字段', async () => {
      const incomingBody = { model: 'qwen-turbo', messages: [] };
      const r = buildUpstreamRequest(incomingBody, upstream);
      const parsed = JSON.parse(r.body);
      expect(parsed.model).toBe('qwen-turbo');
    });

    it('incomingBody 缺少 model 时注入上游默认 model', async () => {
      const incomingBody = { messages: [] };
      const r = buildUpstreamRequest(incomingBody, {
        ...upstream,
        defaultModel: 'qwen-plus',
      });
      const parsed = JSON.parse(r.body);
      expect(parsed.model).toBe('qwen-plus');
    });

    it('incomingBody 为 null/undefined 时抛错', () => {
      expect(() => buildUpstreamRequest(null, upstream)).toThrow();
      expect(() => buildUpstreamRequest(undefined, upstream)).toThrow();
    });

    it('upstream 缺少 endpoint 时抛错', () => {
      expect(() =>
        buildUpstreamRequest({ messages: [] }, { apiKey: 'sk-x' })
      ).toThrow();
    });

    it('upstream 缺少 apiKey 时抛错', () => {
      expect(() =>
        buildUpstreamRequest({ messages: [] }, { endpoint: 'https://x' })
      ).toThrow();
    });

    it('不携带无关敏感字段（如 deviceId 不应转发给上游）', async () => {
      const incomingBody = {
        model: 'qwen-plus',
        messages: [],
        deviceId: 'dev-secret',
      };
      const r = buildUpstreamRequest(incomingBody, upstream);
      const parsed = JSON.parse(r.body);
      expect(parsed.deviceId).toBeUndefined();
      expect(parsed.messages).toEqual([]);
    });
  });

  describe('createJsonResponse', () => {
    it('返回 200 + JSON body', async () => {
      const resp = createJsonResponse({ ok: true });
      expect(resp.status).toBe(200);
      expect(resp.headers.get('Content-Type')).toContain('application/json');
      const body = await resp.json();
      expect(body).toEqual({ ok: true });
    });

    it('支持自定义状态码', () => {
      const resp = createJsonResponse({ err: 'bad' }, 400);
      expect(resp.status).toBe(400);
    });

    it('支持自定义 headers', () => {
      const resp = createJsonResponse(
        { ok: true },
        200,
        { 'X-Custom': 'yes' }
      );
      expect(resp.headers.get('X-Custom')).toBe('yes');
    });
  });

  describe('createErrorResponse', () => {
    it('返回 JSON 格式错误 {error, status}', async () => {
      const resp = createErrorResponse('配额已满', 429);
      expect(resp.status).toBe(429);
      const body = await resp.json();
      expect(body.error).toBe('配额已满');
      expect(body.status).toBe(429);
    });

    it('默认状态码 500', () => {
      const resp = createErrorResponse('内部错误');
      expect(resp.status).toBe(500);
    });

    it('允许附加额外字段', async () => {
      const resp = createErrorResponse('配额已满', 429, { remaining: 0 });
      const body = await resp.json();
      expect(body.remaining).toBe(0);
    });
  });
});
