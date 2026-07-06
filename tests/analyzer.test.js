import { describe, it, expect, beforeEach } from 'vitest';
import { analyzeCurrentPage } from '../src/lib/analyzer.js';

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
