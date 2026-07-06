// 中转请求处理器（Cloudflare Worker 核心，可测）
// 把已测的纯函数组装成完整请求处理流程，依赖全部注入：
// - quotaChecker: 配额检查器
// - resolveUpstream: providerId → {endpoint, apiKey, defaultModel} | null
// - fetchImpl: 上游 fetch（默认全局 fetch）

import {
  parseProviderIdFromPath,
  extractDeviceId,
  buildUpstreamRequest,
  createJsonResponse,
  createErrorResponse,
} from './proxy-forwarder.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id',
};

/**
 * 处理中转请求
 * @param {Request} request
 * @param {{quotaChecker:Object, resolveUpstream:Function, fetchImpl?:Function}} deps
 * @returns {Promise<Response>}
 */
export async function handleProxyRequest(request, deps) {
  const fetchImpl = deps.fetchImpl || fetch;

  // CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return createErrorResponse('仅支持 POST 方法', 405);
  }

  const providerId = parseProviderIdFromPath(new URL(request.url).pathname);
  if (!providerId) {
    return createErrorResponse('路径不匹配 /api/ai/:providerId', 404);
  }

  let deviceId;
  try {
    deviceId = extractDeviceId(request.headers);
  } catch (e) {
    return createErrorResponse('缺少 X-Device-Id 头', 400);
  }

  const upstream = deps.resolveUpstream(providerId);
  if (!upstream) {
    return createErrorResponse(`未知的服务商: ${providerId}`, 400);
  }

  // 解析请求体
  let incomingBody;
  try {
    incomingBody = await request.json();
  } catch (e) {
    return createErrorResponse('请求体不是合法 JSON', 400);
  }

  // 配额检查并递增
  const quotaResult = await deps.quotaChecker.checkAndIncrement(deviceId, null);
  if (!quotaResult.allowed) {
    return createErrorResponse(
      '今日免费体验配额已用完，请明日再试或切换为自有 Key 模式',
      429,
      { remaining: 0, limit: quotaResult.used }
    );
  }

  // 构造上游请求
  let upstreamReq;
  try {
    upstreamReq = buildUpstreamRequest(incomingBody, upstream);
  } catch (e) {
    return createErrorResponse('构造上游请求失败：' + e.message, 400);
  }

  // 转发
  let upstreamResp;
  try {
    upstreamResp = await fetchImpl(upstreamReq.url, {
      method: 'POST',
      headers: upstreamReq.headers,
      body: upstreamReq.body,
    });
  } catch (e) {
    return createErrorResponse('上游请求失败：' + e.message, 502);
  }

  // 透传上游响应（附加 CORS 头）
  const upstreamText = await upstreamResp.text();
  return new Response(upstreamText, {
    status: upstreamResp.status,
    headers: {
      'Content-Type': upstreamResp.headers.get('Content-Type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export { CORS_HEADERS };
