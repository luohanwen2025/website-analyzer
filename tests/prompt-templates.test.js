import { describe, it, expect } from 'vitest';
import {
  buildSystemPrompt,
  buildQuestionPrompt,
  buildAllPrompts,
  QUESTION_KEYS,
} from '../src/lib/prompt-templates.js';

describe('buildSystemPrompt', () => {
  it('设定资深互联网商业分析师角色', () => {
    const p = buildSystemPrompt();
    expect(p).toContain('商业分析师');
    expect(p).toContain('资深');
  });

  it('要求 Markdown 输出', () => {
    const p = buildSystemPrompt();
    expect(p).toContain('Markdown');
  });

  it('声明竞品信息基于模型知识推断', () => {
    const p = buildSystemPrompt();
    expect(p).toContain('模型知识');
    expect(p).toMatch(/推断|推断性/);
  });
});

describe('buildQuestionPrompt', () => {
  const siteData = {
    url: 'https://www.example.com',
    domain: 'www.example.com',
    title: '示例站点',
    description: '一个示例网站',
    keywords: '示例, 测试',
    ogTitle: 'OG 标题',
    ogType: 'website',
    headings: ['主标题', '副标题'],
    bodyLength: 500,
    bodyPreview: '这是一段正文内容',
    pricing: { priceTexts: ['¥99/月'], hasPricingKeywords: true, keywords: ['订阅', '会员'] },
    retention: {
      socialShares: [{ platform: 'twitter', count: 1 }],
      hasNewsletterSignup: true,
      hasAuthEntry: true,
      hasPushNotification: false,
    },
  };

  it('问题一包含网站基本信息', () => {
    const p = buildQuestionPrompt('positioning', siteData);
    expect(p).toContain('https://www.example.com');
    expect(p).toContain('示例站点');
    expect(p).toContain('一个示例网站');
  });

  it('问题一包含差异化定位任务', () => {
    const p = buildQuestionPrompt('positioning', siteData);
    expect(p).toContain('干什么');
    expect(p).toContain('竞争对手');
    expect(p).toContain('差异化');
  });

  it('问题二包含商业模式任务', () => {
    const p = buildQuestionPrompt('monetization', siteData);
    expect(p).toContain('卖点');
    expect(p).toContain('赚钱');
  });

  it('问题二附带定价信号', () => {
    const p = buildQuestionPrompt('monetization', siteData);
    expect(p).toContain('¥99/月');
    expect(p).toContain('订阅');
  });

  it('问题三包含流量与留存任务', () => {
    const p = buildQuestionPrompt('traffic', siteData);
    expect(p).toContain('流量');
    expect(p).toContain('留住');
  });

  it('问题三附带留存信号', () => {
    const p = buildQuestionPrompt('traffic', siteData);
    expect(p).toContain('twitter');
    expect(p).toContain('newsletter');
  });

  it('未知问题 key 抛错', () => {
    expect(() => buildQuestionPrompt('unknown', siteData)).toThrow();
  });
});

describe('buildAllPrompts', () => {
  const siteData = {
    url: 'https://www.example.com',
    domain: 'www.example.com',
    title: '示例站点',
    description: '',
    keywords: '',
    ogTitle: '',
    ogType: '',
    headings: [],
    bodyLength: 0,
    bodyPreview: '',
    pricing: { priceTexts: [], hasPricingKeywords: false, keywords: [] },
    retention: { socialShares: [], hasNewsletterSignup: false, hasAuthEntry: false, hasPushNotification: false },
  };

  it('返回三个问题的 prompt', () => {
    const result = buildAllPrompts(siteData);
    expect(Object.keys(result).sort()).toEqual(
      ['monetization', 'positioning', 'traffic'].sort()
    );
  });

  it('每个 prompt 非空字符串', () => {
    const result = buildAllPrompts(siteData);
    for (const key of QUESTION_KEYS) {
      expect(typeof result[key]).toBe('string');
      expect(result[key].length).toBeGreaterThan(50);
    }
  });
});
