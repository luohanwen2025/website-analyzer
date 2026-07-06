import { describe, it, expect, vi } from 'vitest';
import { analyzeSite } from '../src/lib/analyzer-orchestrator.js';
import { QUESTION_KEYS } from '../src/lib/prompt-templates.js';

const siteData = {
  url: 'https://www.example.com',
  domain: 'www.example.com',
  title: '示例站点',
  description: '示例',
  keywords: '',
  ogTitle: '',
  ogType: '',
  headings: [],
  bodyLength: 100,
  bodyPreview: '正文',
  pricing: { priceTexts: [], hasPricingKeywords: false, keywords: [] },
  retention: {
    socialShares: [],
    hasNewsletterSignup: false,
    hasAuthEntry: false,
    hasPushNotification: false,
  },
};

describe('analyzeSite', () => {
  it('并行调用三个问题并返回全部成功结果', async () => {
    const chatFn = vi.fn(async (prompt) => `回答:${prompt.slice(0, 5)}`);
    const onProgress = vi.fn();
    const result = await analyzeSite(siteData, { chat: chatFn }, onProgress);

    expect(Object.keys(result).sort()).toEqual(QUESTION_KEYS.slice().sort());
    for (const key of QUESTION_KEYS) {
      expect(result[key].status).toBe('fulfilled');
      expect(result[key].value).toMatch(/^回答:/);
    }
    expect(chatFn).toHaveBeenCalledTimes(3);
  });

  it('三问并行发起（不串行）', async () => {
    const callTimes = [];
    const chatFn = vi.fn(async () => {
      callTimes.push(Date.now());
      await new Promise((r) => setTimeout(r, 20));
      return 'ok';
    });
    await analyzeSite(siteData, { chat: chatFn });
    // 三次调用应几乎同时发起（间隔远小于 20ms）
    const spread = Math.max(...callTimes) - Math.min(...callTimes);
    expect(spread).toBeLessThan(15);
  });

  it('单问失败不影响其他两问', async () => {
    const chatFn = vi.fn(async (prompt) => {
      if (prompt.includes('赚钱')) throw new Error('该问失败');
      return '成功回答';
    });
    const result = await analyzeSite(siteData, { chat: chatFn });

    expect(result.monetization.status).toBe('rejected');
    expect(result.monetization.reason).toBeInstanceOf(Error);
    expect(result.positioning.status).toBe('fulfilled');
    expect(result.traffic.status).toBe('fulfilled');
  });

  it('onProgress 在每问完成时被调用（共 3 次）', async () => {
    const chatFn = vi.fn(async () => 'ok');
    const onProgress = vi.fn();
    await analyzeSite(siteData, { chat: chatFn }, onProgress);
    expect(onProgress).toHaveBeenCalledTimes(3);
  });

  it('onProgress 回调携带问题 key、状态与值/错误', async () => {
    const chatFn = vi.fn(async (p) => {
      if (p.includes('流量')) throw new Error('流量分析失败');
      return '结果';
    });
    const calls = [];
    const onProgress = (update) => calls.push(update);
    await analyzeSite(siteData, { chat: chatFn }, onProgress);

    const trafficUpdate = calls.find((c) => c.key === 'traffic');
    expect(trafficUpdate.status).toBe('rejected');
    expect(trafficUpdate.reason).toBeInstanceOf(Error);

    const positioningUpdate = calls.find((c) => c.key === 'positioning');
    expect(positioningUpdate.status).toBe('fulfilled');
    expect(positioningUpdate.value).toBe('结果');
  });

  it('chat 必填，缺失时抛错', async () => {
    await expect(analyzeSite(siteData, {})).rejects.toThrow();
  });
});
