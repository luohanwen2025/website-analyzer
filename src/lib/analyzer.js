// 分析调度逻辑：组合 URL 过滤 + 页面提取
// 将 service-worker 中的核心判定抽离为纯函数，便于测试

import { isAnalyzableUrl } from './url-filter.js';
import { extractPageContent } from './extractor.js';

/**
 * 分析当前页面
 * @param {string} url 当前页 URL
 * @param {Document} doc 当前页 document
 * @returns {Object} { type, data? | error? }
 */
export function analyzeCurrentPage(url, doc) {
  if (!isAnalyzableUrl(url)) {
    return {
      type: 'EXTRACTION_ERROR',
      error: '该页面无法分析（浏览器内部页）',
    };
  }
  const data = extractPageContent(doc);
  return { type: 'EXTRACTED_CONTENT', data };
}
