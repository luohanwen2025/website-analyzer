// URL 过滤逻辑：判断页面是否可被分析（非浏览器内部页）

const INTERNAL_PROTOCOLS = ['chrome:', 'chrome-extension:', 'edge:', 'about:', 'devtools:'];

/**
 * 判断给定 URL 是否可被分析
 * @param {string} url
 * @returns {boolean}
 */
export function isAnalyzableUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return !INTERNAL_PROTOCOLS.some((p) => lower.startsWith(p));
}
