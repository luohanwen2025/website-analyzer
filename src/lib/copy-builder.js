// 复制文本拼接（纯函数）
// 把三问结果拼成一段可复制的 Markdown 文本

const QUESTION_TITLES = {
  positioning: '定位与差异化',
  monetization: '核心卖点与商业模式',
  traffic: '流量来源与用户留存',
};

const QUESTION_KEYS = ['positioning', 'monetization', 'traffic'];

/**
 * 拼接单个问题的复制文本
 * @param {string} key
 * @param {Object} result { status, value? | reason? }
 * @returns {string}
 */
export function buildSingleCopyText(key, result) {
  const title = QUESTION_TITLES[key] || key;
  if (result.status === 'fulfilled') {
    return `## ${title}\n\n${result.value || ''}`;
  }
  const errMsg =
    (result.reason && (result.reason.message || String(result.reason))) || '未知错误';
  return `## ${title}\n\n分析失败：${errMsg}`;
}

/**
 * 拼接所有三问的复制文本
 * @param {Object} results { positioning, monetization, traffic }
 * @param {Object} [meta] { url? }
 * @returns {string}
 */
export function buildCopyText(results, meta = {}) {
  const parts = [];

  if (meta.url) {
    parts.push(`# 网站分析报告\n\n网址：${meta.url}\n`);
  }

  for (const key of QUESTION_KEYS) {
    if (results[key]) {
      parts.push(buildSingleCopyText(key, results[key]));
    }
  }

  return parts.join('\n\n---\n\n');
}
