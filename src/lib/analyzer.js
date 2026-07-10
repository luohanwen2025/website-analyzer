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

/**
 * 解包 content script 的提取响应
 * content script 返回 { type: 'EXTRACTED_CONTENT', data } 或 { type: 'EXTRACTION_ERROR', error }；
 * 下游 analyzeSite / assessContentSufficiency 需要的是 data 本身，不能误传整个包装对象
 * （曾因未解包，AI 收到空白网站信息、只能给泛泛分析）。
 * @param {{type:string, data?:Object, error?:string}|null|undefined} resp
 * @returns {Object} 提取到的页面数据（extractPageContent 的返回值）
 * @throws {Error} 响应为空 / 错误类型 / 缺少 data
 */
export function unwrapExtractionResponse(resp) {
  if (!resp) throw new Error('未能提取页面内容');
  if (resp.type === 'EXTRACTION_ERROR') {
    throw new Error('页面内容提取失败：' + (resp.error || '未知错误'));
  }
  if (!resp.data) throw new Error('未能提取页面内容（响应缺少 data）');
  return resp.data;
}
