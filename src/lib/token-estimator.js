// Token 估算与截断（纯函数）
// 不依赖 tiktoken 等重依赖，用启发式估算：
// - ASCII 英文：约 4 字符 / token
// - CJK 中文等：约 1.5 字符 / token（中文密度高）
// 估算误差可接受，目的是防止超长文本炸上下文

export const DEFAULT_TOKEN_LIMIT = 8000; // 需求 5.1

// CJK Unicode 范围（简化的中日韩判断）
function isCJK(ch) {
  const code = ch.codePointAt(0);
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK 统一汉字
    (code >= 0x3000 && code <= 0x30ff) || // CJK 标点 + 假名
    (code >= 0xff00 && code <= 0xffef) // 全角字符
  );
}

/**
 * 估算文本的 token 数
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text) return 0;
  const str = typeof text === 'string' ? text : String(text);
  if (str.length === 0) return 0;

  let cjkCount = 0;
  let otherCount = 0;
  for (const ch of str) {
    if (isCJK(ch)) cjkCount++;
    else otherCount++;
  }
  // 中文 ~1.5 字符/token，英文 ~4 字符/token
  return Math.ceil(cjkCount / 1.5 + otherCount / 4);
}

/**
 * 按token 上限截断文本
 * - 未超限：原样返回
 * - 超限：截断到上限内并追加 "…"
 * @param {string} text
 * @param {number} [limit=DEFAULT_TOKEN_LIMIT]
 * @returns {string}
 */
export function truncateToTokens(text, limit = DEFAULT_TOKEN_LIMIT) {
  if (!text) return '';
  const str = typeof text === 'string' ? text : String(text);
  if (limit <= 0) return '';
  if (estimateTokens(str) <= limit) return str;

  // 为省略号 "…" 预留 1 token 余量
  const targetLimit = Math.max(1, limit - 1);

  // 二分查找最大可保留字符数
  let lo = 0;
  let hi = str.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateTokens(str.slice(0, mid)) <= targetLimit) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return str.slice(0, lo) + '…';
}
