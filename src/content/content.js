// Content Script —— 页面内容提取
// 复用 lib/extractor.js（已测试），本文件仅做 Chrome API 胶水
import { extractPageContent } from '../lib/extractor.js';

// 监听来自 Background 的提取指令
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'EXTRACT_CONTENT') {
    try {
      const data = extractPageContent(document);
      sendResponse({ type: 'EXTRACTED_CONTENT', data });
    } catch (e) {
      sendResponse({ type: 'EXTRACTION_ERROR', error: e.message });
    }
  }
  return true; // 异步响应
});
