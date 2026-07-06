// 中转请求转发纯函数（Cloudflare Worker 侧使用）
// 与 Worker 运行时解耦：输入/输出均为可序列化对象，便于测试
// 仅 createJsonResponse/createErrorResponse 返回 Response（使用全局 Response，Worker 与 jsdom 均支持）

const PROXY_PATH_PREFIX = '/api/ai/';

/**
 * 从 URL pathname 解析 providerId
 * @param {string} pathname 如 /api/ai/qwen
 * @returns {string|null}
 */
export function parseProviderIdFromPath(pathname) {
  if (!pathname || !pathname.startsWith(PROXY_PATH_PREFIX)) return null;
  const rest = pathname.slice(PROXY_PATH_PREFIX.length);
  // 取第一段，忽略尾部斜杠与多段
  const segments = rest.split('/').filter(Boolean);
  return segments[0] || null;
}

/**
 * 从请求 headers 提取 deviceId
 * @param {Headers} headers
 * @returns {string}
 */
export function extractDeviceId(headers) {
  const raw = headers.get('X-Device-Id');
  const trimmed = (raw || '').trim();
  if (!trimmed) throw new Error('缺少 X-Device-Id 头');
  return trimmed;
}

/**
 * 构造转发给上游服务商的请求参数
 * - 注入真实 apiKey（中转托管）
 * - 若 incomingBody 缺 model 则注入 upstream.defaultModel
 * - 剥离 deviceId 等不该转发的字段
 * @param {Object} incomingBody 插件发来的请求体
 * @param {{endpoint:string, apiKey:string, defaultModel?:string}} upstream
 * @returns {{url:string, headers:Object, body:string}}
 */
export function buildUpstreamRequest(incomingBody, upstream) {
  if (!incomingBody) throw new Error('incomingBody 不能为空');
  if (!upstream || !upstream.endpoint) {
    throw new Error('upstream.endpoint 缺失');
  }
  if (!upstream.apiKey) throw new Error('upstream.apiKey 缺失');

  // 白名单字段：只转发 OpenAI 兼容字段，避免泄露 deviceId 等
  const { model, messages, temperature, max_tokens, stream, top_p } = incomingBody;
  const outbound = { messages };
  if (model) {
    outbound.model = model;
  } else if (upstream.defaultModel) {
    outbound.model = upstream.defaultModel;
  }
  if (temperature !== undefined) outbound.temperature = temperature;
  if (max_tokens !== undefined) outbound.max_tokens = max_tokens;
  if (stream !== undefined) outbound.stream = stream;
  if (top_p !== undefined) outbound.top_p = top_p;

  return {
    url: upstream.endpoint,
    headers: {
      Authorization: `Bearer ${upstream.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(outbound),
  };
}

/**
 * 构造 JSON 响应
 * @param {Object} data
 * @param {number} [status=200]
 * @param {Object} [extraHeaders]
 * @returns {Response}
 */
export function createJsonResponse(data, status = 200, extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    ...extraHeaders,
  };
  return new Response(JSON.stringify(data), { status, headers });
}

/**
 * 构造错误响应
 * @param {string} message
 * @param {number} [status=500]
 * @param {Object} [extra] 额外字段
 * @returns {Response}
 */
export function createErrorResponse(message, status = 500, extra = {}) {
  return createJsonResponse(
    { error: message, status, ...extra },
    status
  );
}
