// 页面内容提取逻辑（纯函数，接收 document 参数以便测试注入）
import { extractPricingSignals } from './pricing-signals.js';
import { extractRetentionSignals } from './retention-signals.js';

/**
 * 从 document 提取分析所需内容
 * @param {Document} doc
 * @returns {Object}
 */
export function extractPageContent(doc) {
  const getMeta = (selector) => {
    const el =
      doc.querySelector(`meta[name="${selector}"]`) ||
      doc.querySelector(`meta[property="${selector}"]`);
    return el ? (el.getAttribute('content') || '').trim() : '';
  };

  // 收集 h1/h2 主标题（去重、过滤空值、限长）
  const headings = Array.from(doc.querySelectorAll('h1, h2'))
    .map((h) => (h.textContent || '').trim())
    .filter(Boolean)
    .slice(0, 10);

  // 正文文本去噪（粗略）
  const rawBody = (doc.body && doc.body.innerText) || '';
  const bodyText = rawBody
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 8000);

  // M2 新增：定价信号与留存信号
  const pricing = extractPricingSignals(doc);
  const retention = extractRetentionSignals(doc);

  return {
    url: location.href,
    domain: location.hostname,
    title: doc.title || '',
    description: getMeta('description') || getMeta('og:description'),
    keywords: getMeta('keywords'),
    ogTitle: getMeta('og:title'),
    ogType: getMeta('og:type'),
    headings,
    bodyLength: bodyText.length,
    bodyPreview: bodyText.slice(0, 500),
    pricing,
    retention,
  };
}
