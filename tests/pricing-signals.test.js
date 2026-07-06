import { describe, it, expect, beforeEach } from 'vitest';
import { extractPricingSignals } from '../src/lib/pricing-signals.js';

describe('extractPricingSignals', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('提取包含货币符号与价格数字的文本', () => {
    const div = document.createElement('div');
    div.textContent = '专业版 ¥99/月，包含全部功能';
    document.body.appendChild(div);
    const result = extractPricingSignals(document);
    expect(result.priceTexts).toContain('专业版 ¥99/月，包含全部功能');
  });

  it('提取美元价格文本', () => {
    const div = document.createElement('div');
    div.textContent = 'Pro plan $19.99/month';
    document.body.appendChild(div);
    const result = extractPricingSignals(document);
    expect(result.priceTexts.some((t) => t.includes('$19.99'))).toBe(true);
  });

  it('提取欧元价格文本', () => {
    const div = document.createElement('div');
    div.textContent = 'Abonnement €9,90/Monat';
    document.body.appendChild(div);
    const result = extractPricingSignals(document);
    expect(result.priceTexts.length).toBeGreaterThan(0);
  });

  it('识别定价相关关键词出现', () => {
    const div = document.createElement('div');
    div.innerHTML =
      '<p>免费试用 14 天</p><p>升级到 Premium 解锁更多</p><p>订阅会员专享</p>';
    document.body.appendChild(div);
    const result = extractPricingSignals(document);
    expect(result.hasPricingKeywords).toBe(true);
  });

  it('当页面无定价信息时返回空数组与 false', () => {
    const div = document.createElement('div');
    div.textContent = '这是一篇普通博客文章，没有任何商业内容。';
    document.body.appendChild(div);
    const result = extractPricingSignals(document);
    expect(result.priceTexts).toEqual([]);
    expect(result.hasPricingKeywords).toBe(false);
  });

  it('提取定价相关关键词列表（去重）', () => {
    const div = document.createElement('div');
    div.textContent = '订阅会员，订阅会员，免费试用，Premium 套餐';
    document.body.appendChild(div);
    const result = extractPricingSignals(document);
    expect(result.keywords).toContain('免费试用');
    expect(result.keywords).toContain('Premium');
    // 去重
    const memberCount = result.keywords.filter((k) => k === '会员').length;
    expect(memberCount).toBeLessThanOrEqual(1);
  });

  it('价格文本数量限制（避免噪声过多）', () => {
    for (let i = 0; i < 30; i++) {
      const div = document.createElement('div');
      div.textContent = `套餐 ${i} ¥${i * 10}/月`;
      document.body.appendChild(div);
    }
    const result = extractPricingSignals(document);
    expect(result.priceTexts.length).toBeLessThanOrEqual(10);
  });
});
