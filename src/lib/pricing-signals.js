// 定价/会员信号提取（启发式）
// 检测页面可见的定价文本与定价关键词，为 AI 提供商业模式分析的输入

// 货币符号 + 数字 价格模式：¥99、$19.99、€9,90、￥100
const PRICE_REGEX = /[$¥￥€£]\s?\d+([.,]\d+)?|\d+([.,]\d+)?\s?(元|块|美元|欧元)/;
// 定价相关关键词
const PRICING_KEYWORDS = [
  '定价',
  '价格',
  '套餐',
  '订阅',
  '会员',
  '免费试用',
  '试用',
  'Pro',
  'Premium',
  'Free',
  '付费',
  '升级',
  '开通',
  '月费',
  '年费',
  'VIP',
  'Plus',
  'Enterprise',
  'Starter',
];

/**
 * 从 document 提取定价/会员信号
 * @param {Document} doc
 * @returns {{ priceTexts: string[], hasPricingKeywords: boolean, keywords: string[] }}
 */
export function extractPricingSignals(doc) {
  // 防御：doc.body 为 null 时 createTreeWalker 会抛错
  if (!doc.body) {
    return { priceTexts: [], hasPricingKeywords: false, keywords: [] };
  }
  // 收集所有可见文本节点（限定主要容器，避免脚本/样式）
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

    // 价格文本检测
    if (PRICE_REGEX.test(text) && priceTexts.length < 10) {
      priceTexts.push(text.slice(0, 200));
    }

    // 关键词检测
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
