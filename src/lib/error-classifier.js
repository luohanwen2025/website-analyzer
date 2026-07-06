// 错误分类器（纯函数）
// 把各种 AI 请求错误映射为 {kind, retryable, userMessage, originalError}
// kind: network | timeout | auth | rate_limit | quota_exhausted | server | bad_request | parse | unknown
// 上层据此决定：是否重试、给用户什么提示、是否引导跳转设置页

const PATTERNS = [
  // 超时（优先于 network，因为 AbortError 也可能含 network 字样）
  {
    test: (msg, err) =>
      err && err.name === 'AbortError' ||
      /超时|timeout|aborted|timed?\s*out/i.test(msg),
    kind: 'timeout',
    retryable: true,
    userMessage: '请求超时，请稍后重试',
  },
  // 配额用尽（中转 429 + 配额关键词，优先于 rate_limit）
  {
    test: (msg) => /429.*配额|配额.*用完|额度.*用完|今日.*次数/i.test(msg),
    kind: 'quota_exhausted',
    retryable: false,
    userMessage: '今日免费体验配额已用完，可在设置中切换为自有 Key 模式继续使用',
  },
  // 限流
  {
    test: (msg) => /\b429\b|rate.?limit|too many requests/i.test(msg),
    kind: 'rate_limit',
    retryable: false,
    userMessage: '请求过于频繁，请稍后再试',
  },
  // 鉴权失败
  {
    test: (msg) => /\b401\b|\b403\b|invalid.?api.?key|unauthorized|forbidden/i.test(msg),
    kind: 'auth',
    retryable: false,
    userMessage: 'API Key 无效或已失效，请到设置页检查并重新配置',
  },
  // 服务端错误
  {
    test: (msg) => /\b5\d\d\b|internal.?error|bad.?gateway|service.?unavailable/i.test(msg),
    kind: 'server',
    retryable: true,
    userMessage: 'AI 服务暂时不可用，请稍后重试',
  },
  // 请求格式错误
  {
    test: (msg) => /\b400\b|bad.?request/i.test(msg),
    kind: 'bad_request',
    retryable: false,
    userMessage: '请求参数有误，请检查模型配置',
  },
  // 网络错误
  {
    test: (msg, err) =>
      /network|failed to fetch|fetch.?fail|网络|连接/i.test(msg) ||
      (err && (err instanceof TypeError)),
    kind: 'network',
    retryable: true,
    userMessage: '网络连接失败，请检查网络后重试',
  },
  // 响应解析失败
  {
    test: (msg) => /解析失败|parse|choices|message\.content/i.test(msg),
    kind: 'parse',
    retryable: false,
    userMessage: 'AI 响应格式异常，请重试或更换模型',
  },
];

const DEFAULT = {
  kind: 'unknown',
  retryable: false,
  userMessage: '发生未知错误',
};

/**
 * 分类错误
 * @param {Error|string|null|undefined} err
 * @returns {{kind:string, retryable:boolean, userMessage:string, originalError:*}}
 */
export function classifyError(err) {
  if (!err) {
    return { ...DEFAULT, originalError: err };
  }
  const msg = typeof err === 'string' ? err : (err.message || '');
  for (const p of PATTERNS) {
    if (p.test(msg, err)) {
      return { ...p, originalError: err };
    }
  }
  return { ...DEFAULT, originalError: err };
}
