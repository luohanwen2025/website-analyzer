import { describe, it, expect, beforeEach } from 'vitest';
import { extractPageContent } from '../src/lib/extractor.js';

describe('extractPageContent', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '';
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('提取页面标题', () => {
    document.title = '示例站点 - 首页';
    const result = extractPageContent(document);
    expect(result.title).toBe('示例站点 - 首页');
  });

  it('提取 meta description', () => {
    const meta = document.createElement('meta');
    meta.name = 'description';
    meta.content = '这是一个示例网站';
    document.head.appendChild(meta);
    const result = extractPageContent(document);
    expect(result.description).toBe('这是一个示例网站');
  });

  it('当无 meta description 时回退到 og:description', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('property', 'og:description');
    meta.content = 'OG 描述';
    document.head.appendChild(meta);
    const result = extractPageContent(document);
    expect(result.description).toBe('OG 描述');
  });

  it('提取 meta keywords', () => {
    const meta = document.createElement('meta');
    meta.name = 'keywords';
    meta.content = '电商, 购物, 优惠';
    document.head.appendChild(meta);
    const result = extractPageContent(document);
    expect(result.keywords).toBe('电商, 购物, 优惠');
  });

  it('提取 og:title 与 og:type', () => {
    const ogTitle = document.createElement('meta');
    ogTitle.setAttribute('property', 'og:title');
    ogTitle.content = 'OG 标题';
    document.head.appendChild(ogTitle);
    const ogType = document.createElement('meta');
    ogType.setAttribute('property', 'og:type');
    ogType.content = 'website';
    document.head.appendChild(ogType);
    const result = extractPageContent(document);
    expect(result.ogTitle).toBe('OG 标题');
    expect(result.ogType).toBe('website');
  });

  it('提取 h1/h2 主标题并去重过滤空值', () => {
    const h1 = document.createElement('h1');
    h1.textContent = '主标题';
    const h2 = document.createElement('h2');
    h2.textContent = '副标题';
    const h2Empty = document.createElement('h2');
    h2Empty.textContent = '   ';
    document.body.append(h1, h2, h2Empty);
    const result = extractPageContent(document);
    expect(result.headings).toEqual(['主标题', '副标题']);
  });

  it('限制 headings 最多 10 个', () => {
    for (let i = 0; i < 15; i++) {
      const h = document.createElement('h2');
      h.textContent = '标题' + i;
      document.body.appendChild(h);
    }
    const result = extractPageContent(document);
    expect(result.headings).toHaveLength(10);
    expect(result.headings[0]).toBe('标题0');
  });

  it('正文被截断到不超过 8000 字符', () => {
    const longText = 'a'.repeat(20000);
    const div = document.createElement('div');
    div.textContent = longText;
    document.body.appendChild(div);
    const result = extractPageContent(document);
    expect(result.bodyLength).toBeLessThanOrEqual(8000);
  });

  it('压缩正文中的连续空行', () => {
    const div = document.createElement('div');
    div.textContent = '段落一\n\n\n\n\n段落二';
    document.body.appendChild(div);
    const result = extractPageContent(document);
    expect(result.bodyPreview).not.toMatch(/\n{3,}/);
  });

  it('返回 url 与 domain（基于 location）', () => {
    const result = extractPageContent(document);
    // jsdom 默认 location 为 about:blank，hostname 为空串
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('domain');
  });

  // M2 新增：定价信号与留存信号集成
  it('结果包含 pricing 字段', () => {
    const result = extractPageContent(document);
    expect(result).toHaveProperty('pricing');
    expect(result.pricing).toHaveProperty('priceTexts');
    expect(result.pricing).toHaveProperty('hasPricingKeywords');
    expect(result.pricing).toHaveProperty('keywords');
  });

  it('结果包含 retention 字段', () => {
    const result = extractPageContent(document);
    expect(result).toHaveProperty('retention');
    expect(result.retention).toHaveProperty('socialShares');
    expect(result.retention).toHaveProperty('hasNewsletterSignup');
    expect(result.retention).toHaveProperty('hasAuthEntry');
    expect(result.retention).toHaveProperty('hasPushNotification');
  });

  it('当页面含定价信息时 pricing 字段反映出来', () => {
    const div = document.createElement('div');
    div.textContent = '专业版 ¥99/月，订阅会员专享';
    document.body.appendChild(div);
    const result = extractPageContent(document);
    expect(result.pricing.hasPricingKeywords).toBe(true);
    expect(result.pricing.priceTexts.length).toBeGreaterThan(0);
  });

  it('当页面含社交分享时 retention 字段反映出来', () => {
    const a = document.createElement('a');
    a.href = 'https://twitter.com/share';
    a.textContent = '分享';
    document.body.appendChild(a);
    const result = extractPageContent(document);
    expect(result.retention.socialShares.length).toBeGreaterThan(0);
  });
});
