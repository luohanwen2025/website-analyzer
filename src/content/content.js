// Content Script —— 页面内容提取
// ⚠️ 本文件必须自包含、不得使用 ES module 静态 import/export：
//    MV3 content_scripts 不支持 type:module，静态 import 会让本脚本在注入瞬间抛
//    SyntaxError，导致 onMessage listener 永不注册（"Could not establish connection"）。
// 提取逻辑与 src/lib/extractor.js / pricing-signals.js / retention-signals.js 逐字一致，
// lib 版供单元测试、本内联版供注入——修改提取逻辑需同步两处（有 tests/content-script.test.js 守护）。

// ===== 定价/会员信号（同 pricing-signals.js）=====
const PRICE_REGEX = /[$¥￥€£]\s?\d+([.,]\d+)?|\d+([.,]\d+)?\s?(元|块|美元|欧元)/;
const PRICING_KEYWORDS = [
  '定价', '价格', '套餐', '订阅', '会员', '免费试用', '试用', 'Pro', 'Premium', 'Free',
  '付费', '升级', '开通', '月费', '年费', 'VIP', 'Plus', 'Enterprise', 'Starter',
];

function extractPricingSignals(doc) {
  // 防御：doc.body 为 null 时 createTreeWalker 会抛错
  if (!doc.body) {
    return { priceTexts: [], hasPricingKeywords: false, keywords: [] };
  }
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(tag)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const priceTexts = [];
  const keywordSet = new Set();
  let node;
  while ((node = walker.nextNode())) {
    const text = (node.textContent || '').trim();
    if (!text) continue;
    if (PRICE_REGEX.test(text) && priceTexts.length < 10) {
      priceTexts.push(text.slice(0, 200));
    }
    for (const kw of PRICING_KEYWORDS) {
      if (text.includes(kw)) keywordSet.add(kw);
    }
  }
  return {
    priceTexts,
    hasPricingKeywords: keywordSet.size > 0,
    keywords: Array.from(keywordSet),
  };
}

// ===== 留存信号（同 retention-signals.js）=====
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
const PUSH_KEYWORDS = ['推送通知', '推送', '允许通知', 'allow notifications', 'enable notifications', '订阅通知'];

function extractRetentionSignals(doc) {
  const socialMap = new Map();
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

  const bodyTextRaw = (doc.body && doc.body.textContent) || '';
  const hasEmailInput = !!doc.querySelector('input[type="email"], input[name*="email" i]');
  const hasSubscribeText = /订阅|subscribe|newsletter|邮件订阅/i.test(bodyTextRaw);
  const hasNewsletterSignup = hasEmailInput && hasSubscribeText;
  const hasAuthEntry = /登录|登陆|注册|sign\s?in|sign\s?up|log\s?in|register/i.test(bodyTextRaw);
  const bodyText = bodyTextRaw.toLowerCase();
  const hasPushNotification = PUSH_KEYWORDS.some((k) => bodyText.includes(k.toLowerCase()));

  return { socialShares, hasNewsletterSignup, hasAuthEntry, hasPushNotification };
}

// ===== 内容提取（同 extractor.js）=====
function extractPageContent(doc) {
  const getMeta = (selector) => {
    const el =
      doc.querySelector(`meta[name="${selector}"]`) ||
      doc.querySelector(`meta[property="${selector}"]`);
    return el ? (el.getAttribute('content') || '').trim() : '';
  };

  const headings = Array.from(doc.querySelectorAll('h1, h2'))
    .map((h) => (h.textContent || '').trim())
    .filter(Boolean)
    .slice(0, 10);

  const rawBody = (doc.body && doc.body.innerText) || '';
  const bodyText = rawBody
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 8000);

  const pricing = extractPricingSignals(doc);
  const retention = extractRetentionSignals(doc);

  return {
    url: location.href,
    domain: location.hostname,
    title: doc.title || '',
    description: getMeta('description') || getMeta('og:description'),
    keywords: getMeta('keywords'),
    ogTitle: getMeta('og:title'),
    ogType: getMeta('og:type'),
    headings,
    bodyLength: bodyText.length,
    bodyPreview: bodyText.slice(0, 500),
    pricing,
    retention,
  };
}

// ===== 监听 Background 的提取指令 =====
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'EXTRACT_CONTENT') {
    try {
      const data = extractPageContent(document);
      sendResponse({ type: 'EXTRACTED_CONTENT', data });
    } catch (e) {
      sendResponse({ type: 'EXTRACTION_ERROR', error: e.message });
    }
  }
  return true; // 保持消息通道开启（异步响应兼容）
});
