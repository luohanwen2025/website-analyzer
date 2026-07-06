import { describe, it, expect, beforeEach } from 'vitest';
import { extractRetentionSignals } from '../src/lib/retention-signals.js';

describe('extractRetentionSignals', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('检测社交分享按钮链接', () => {
    const a = document.createElement('a');
    a.href = 'https://twitter.com/share';
    a.textContent = '分享到 Twitter';
    document.body.appendChild(a);
    const result = extractRetentionSignals(document);
    expect(result.socialShares.length).toBeGreaterThan(0);
    expect(result.socialShares.some((s) => s.platform === 'twitter')).toBe(true);
  });

  it('检测微信/微博/LinkedIn/Facebook 等多平台', () => {
    const platforms = [
      ['weibo', 'https://service.weibo.com/share'],
      ['linkedin', 'https://www.linkedin.com/sharing'],
      ['facebook', 'https://www.facebook.com/sharer'],
      ['wechat', 'javascript:void(0)'],
    ];
    const container = document.createElement('div');
    container.innerHTML = `
      <a class="share-weibo" href="${platforms[0][1]}">微博</a>
      <a aria-label="LinkedIn" href="${platforms[1][1]}">in</a>
      <a title="Share on Facebook" href="${platforms[2][1]}">f</a>
      <button class="wechat-share">微信分享</button>
    `;
    document.body.appendChild(container);
    const result = extractRetentionSignals(document);
    const foundPlatforms = result.socialShares.map((s) => s.platform);
    expect(foundPlatforms).toEqual(expect.arrayContaining(['weibo', 'linkedin', 'facebook', 'wechat']));
  });

  it('检测订阅邮箱表单（newsletter）', () => {
    const form = document.createElement('form');
    form.innerHTML =
      '<input type="email" placeholder="输入邮箱订阅"><button type="submit">订阅</button>';
    document.body.appendChild(form);
    const result = extractRetentionSignals(document);
    expect(result.hasNewsletterSignup).toBe(true);
  });

  it('检测登录/注册入口', () => {
    const nav = document.createElement('nav');
    nav.innerHTML = '<a href="/login">登录</a><a href="/signup">注册</a>';
    document.body.appendChild(nav);
    const result = extractRetentionSignals(document);
    expect(result.hasAuthEntry).toBe(true);
  });

  it('检测推送通知权限请求（Notification API 痕迹）', () => {
    // 页面中含 "allow notifications" / "推送通知" 文案即视为信号
    const div = document.createElement('div');
    div.textContent = '点击允许推送通知，获取最新动态';
    document.body.appendChild(div);
    const result = extractRetentionSignals(document);
    expect(result.hasPushNotification).toBe(true);
  });

  it('无留存信号时返回空结果', () => {
    const div = document.createElement('div');
    div.textContent = '一个普通的内容页面，没有任何交互入口。';
    document.body.appendChild(div);
    const result = extractRetentionSignals(document);
    expect(result.socialShares).toEqual([]);
    expect(result.hasNewsletterSignup).toBe(false);
    expect(result.hasAuthEntry).toBe(false);
    expect(result.hasPushNotification).toBe(false);
  });

  it('社交分享去重并统计数量', () => {
    const div = document.createElement('div');
    div.innerHTML = `
      <a href="https://twitter.com/share">t1</a>
      <a href="https://twitter.com/share">t2</a>
      <a href="https://www.facebook.com/sharer">fb</a>
    `;
    document.body.appendChild(div);
    const result = extractRetentionSignals(document);
    const twitter = result.socialShares.find((s) => s.platform === 'twitter');
    expect(twitter.count).toBe(2);
  });
});
