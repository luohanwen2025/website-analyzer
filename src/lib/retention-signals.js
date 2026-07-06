// 留存信号提取（启发式）
// 检测社交分享按钮、订阅入口、登录注册、推送通知，为 AI 提供留存策略分析输入

// 社交平台识别规则：URL 或可见文本含平台标识
const SOCIAL_PATTERNS = [
  { platform: 'twitter', re: /twitter\.com|x\.com|tweet/i },
  { platform: 'facebook', re: /facebook\.com|fb\.com/i },
  { platform: 'linkedin', re: /linkedin\.com/i },
  { platform: 'weibo', re: /weibo\.com|微博/i },
  { platform: 'wechat', re: /wechat|weixin|微信/i },
  { platform: 'qq', re: /qq\.com|qq空间/i },
  { platform: 'telegram', re: /t\.me|telegram/i },
  { platform: 'reddit', re: /reddit\.com/i },
  { platform: 'pinterest', re: /pinterest\./i },
];

// 推送通知文案关键词
const PUSH_KEYWORDS = ['推送通知', '推送', '允许通知', 'allow notifications', 'enable notifications', '订阅通知'];

/**
 * 从 document 提取留存信号
 * @param {Document} doc
 * @returns {Object}
 */
export function extractRetentionSignals(doc) {
  const socialMap = new Map(); // platform -> count

  // 扫描 a/button 元素的 href 与文本
  const candidates = doc.querySelectorAll('a, button');
  candidates.forEach((el) => {
    const href = el.getAttribute('href') || '';
    const text = (el.textContent || '').trim();
    const ariaLabel = el.getAttribute('aria-label') || '';
    const title = el.getAttribute('title') || '';
    const signal = `${href} ${text} ${ariaLabel} ${title}`;

    for (const p of SOCIAL_PATTERNS) {
      if (p.re.test(signal)) {
        socialMap.set(p.platform, (socialMap.get(p.platform) || 0) + 1);
      }
    }
  });

  const socialShares = Array.from(socialMap.entries()).map(([platform, count]) => ({
    platform,
    count,
  }));

  // 页面文本（jsdom 对 innerText 支持有限，用 textContent）
  const bodyTextRaw = (doc.body && doc.body.textContent) || '';

  // 订阅邮箱表单：含 type=email 的输入
  const hasEmailInput = !!doc.querySelector('input[type="email"], input[name*="email" i]');
  const hasSubscribeText = /订阅|subscribe|newsletter|邮件订阅/i.test(bodyTextRaw);
  const hasNewsletterSignup = hasEmailInput && hasSubscribeText;

  // 登录/注册入口
  const hasAuthEntry = /登录|登陆|注册|sign\s?in|sign\s?up|log\s?in|register/i.test(bodyTextRaw);

  // 推送通知文案
  const bodyText = bodyTextRaw.toLowerCase();
  const hasPushNotification = PUSH_KEYWORDS.some((k) =>
    bodyText.includes(k.toLowerCase())
  );

  return {
    socialShares,
    hasNewsletterSignup,
    hasAuthEntry,
    hasPushNotification,
  };
}
