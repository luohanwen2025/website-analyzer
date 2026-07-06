// M1/M2/M3 各模块边界补强测试（TDD：先看是否失败）
import { describe, it, expect, beforeEach } from 'vitest';
import { extractPageContent } from '../src/lib/extractor.js';
import { extractPricingSignals } from '../src/lib/pricing-signals.js';
import { extractRetentionSignals } from '../src/lib/retention-signals.js';
import { isAnalyzableUrl } from '../src/lib/url-filter.js';
import { analyzeCurrentPage } from '../src/lib/analyzer.js';
import { buildAllPrompts, buildQuestionPrompt } from '../src/lib/prompt-templates.js';
import { resolveRequestConfig } from '../src/lib/router.js';

// ============ extractor：doc.body 为 null ============
describe('extractor 边界: doc.body 为 null', () => {
  it('不崩溃且返回空正文相关字段', () => {
    // fakeDoc 的 createTreeWalker 模拟真实 DOM 行为：root 为 null 时抛错
    const fakeDoc = {
      title: '无 body 的文档',
      querySelector: () => null,
      querySelectorAll: () => [],
      body: null,
      createTreeWalker: (root) => {
        if (root === null) throw new Error('root cannot be null');
        return { nextNode: () => null };
      },
    };
    const result = extractPageContent(fakeDoc);
    expect(result.title).toBe('无 body 的文档');
    expect(result.bodyLength).toBe(0);
    expect(result.bodyPreview).toBe('');
    // pricing/retention 也应安全返回空结构
    expect(result.pricing.priceTexts).toEqual([]);
    expect(result.retention.socialShares).toEqual([]);
  });
});

// ============ pricing-signals: script/style 内价格不被提取 ============
describe('pricing-signals 边界: script/style 标签内文本不提取', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('script 标签内的价格文本不被提取', () => {
    const script = document.createElement('script');
    script.type = 'text/template'; // 非执行 type，避免 jsdom 求值
    script.textContent = 'const price = ¥99/月; // 这不是可见价格';
    document.body.appendChild(script);
    const result = extractPricingSignals(document);
    expect(result.priceTexts).toEqual([]);
  });

  it('style 标签内的价格文本不被提取', () => {
    const style = document.createElement('style');
    style.textContent = '.price::before { content: "¥99"; }';
    document.body.appendChild(style);
    const result = extractPricingSignals(document);
    expect(result.priceTexts).toEqual([]);
  });
});

// ============ retention-signals: doc.body 为 null ============
describe('retention-signals 边界: doc.body 为 null', () => {
  it('不崩溃且返回空信号', () => {
    const fakeDoc = {
      querySelectorAll: () => [],
      querySelector: () => null,
      body: null,
    };
    const result = extractRetentionSignals(fakeDoc);
    expect(result.socialShares).toEqual([]);
    expect(result.hasNewsletterSignup).toBe(false);
    expect(result.hasAuthEntry).toBe(false);
    expect(result.hasPushNotification).toBe(false);
  });
});

// ============ url-filter: null/undefined ============
describe('url-filter 边界: null/undefined 输入', () => {
  it('null 返回 false', () => {
    expect(isAnalyzableUrl(null)).toBe(false);
  });
  it('undefined 返回 false', () => {
    expect(isAnalyzableUrl(undefined)).toBe(false);
  });
});

// ============ analyzer: 空字符串 URL ============
describe('analyzer 边界: 空字符串 URL', () => {
  it('空字符串返回 EXTRACTION_ERROR', () => {
    const result = analyzeCurrentPage('', document);
    expect(result.type).toBe('EXTRACTION_ERROR');
  });
});

// ============ prompt-templates: siteData 字段缺失 ============
describe('prompt-templates 边界: siteData 字段缺失', () => {
  it('缺少 pricing 字段时不崩溃（monetization 问题）', () => {
    const partialData = {
      url: 'https://x.com',
      domain: 'x.com',
      title: 't',
      description: '',
      keywords: '',
      ogTitle: '',
      ogType: '',
      headings: [],
      bodyLength: 0,
      bodyPreview: '',
      // 缺 pricing 和 retention
    };
    expect(() => buildQuestionPrompt('monetization', partialData)).not.toThrow();
  });

  it('缺少 retention 字段时不崩溃（traffic 问题）', () => {
    const partialData = {
      url: 'https://x.com',
      domain: 'x.com',
      title: 't',
    };
    expect(() => buildQuestionPrompt('traffic', partialData)).not.toThrow();
  });

  it('buildAllPromps 对最小 siteData 不崩溃', () => {
    const result = buildAllPrompts({ url: 'https://x.com', domain: 'x.com' });
    expect(Object.keys(result)).toHaveLength(3);
  });
});

// ============ router: 缺 apiKey/deviceId ============
describe('router 边界: 缺少必要字段', () => {
  const env = { proxyBase: 'https://proxy.example.com/api/ai' };

  it('self 模式缺 apiKey 抛错', () => {
    expect(() =>
      resolveRequestConfig({ mode: 'self', providerId: 'qwen' }, env)
    ).toThrow(/apiKey/);
  });

  it('free 模式缺 deviceId 抛错', () => {
    expect(() =>
      resolveRequestConfig({ mode: 'free', providerId: 'qwen' }, env)
    ).toThrow(/deviceId/);
  });
});
