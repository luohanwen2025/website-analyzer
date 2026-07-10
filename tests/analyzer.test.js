import { describe, it, expect, beforeEach } from 'vitest';
import { analyzeCurrentPage, unwrapExtractionResponse } from '../src/lib/analyzer.js';

describe('analyzeCurrentPage', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '';
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('对内部页返回 EXTRACTION_ERROR 而不尝试提取', () => {
    const result = analyzeCurrentPage('chrome://extensions/', document);
    expect(result.type).toBe('EXTRACTION_ERROR');
    expect(result.error).toContain('无法分析');
  });

  it('对 about:blank 返回错误', () => {
    const result = analyzeCurrentPage('about:blank', document);
    expect(result.type).toBe('EXTRACTION_ERROR');
  });

  it('对可分析页返回 EXTRACTED_CONTENT 并附带提取数据', () => {
    document.title = '测试站点';
    const meta = document.createElement('meta');
    meta.name = 'description';
    meta.content = '测试描述';
    document.head.appendChild(meta);

    const result = analyzeCurrentPage('https://www.example.com', document);
    expect(result.type).toBe('EXTRACTED_CONTENT');
    expect(result.data.title).toBe('测试站点');
    expect(result.data.description).toBe('测试描述');
  });

  it('提取数据包含 url 字段', () => {
    const result = analyzeCurrentPage('https://www.example.com', document);
    expect(result.data).toHaveProperty('url');
  });
});

describe('unwrapExtractionResponse', () => {
  // 回归保护：content script 返回 { type, data } 包装，service-worker 必须解包取 data
  // 再传给 analyzeSite/assessContentSufficiency。曾因未解包，AI 收到空网站信息、只给泛泛分析。

  it('正常解包 EXTRACTED_CONTENT 响应，返回 data', () => {
    const resp = { type: 'EXTRACTED_CONTENT', data: { url: 'https://x.com', title: 'X' } };
    expect(unwrapExtractionResponse(resp)).toEqual({ url: 'https://x.com', title: 'X' });
  });

  it('对空响应抛错', () => {
    expect(() => unwrapExtractionResponse(null)).toThrow('未能提取');
    expect(() => unwrapExtractionResponse(undefined)).toThrow('未能提取');
  });

  it('对 EXTRACTION_ERROR 响应抛错并附带上游原因', () => {
    expect(() =>
      unwrapExtractionResponse({ type: 'EXTRACTION_ERROR', error: '提取爆了' })
    ).toThrow('提取爆了');
  });

  it('对缺少 data 的成功响应抛错', () => {
    expect(() => unwrapExtractionResponse({ type: 'EXTRACTED_CONTENT' })).toThrow(
      '缺少 data'
    );
  });
});
