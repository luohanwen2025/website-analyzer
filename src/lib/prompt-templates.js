// Prompt 模板构建（纯函数，便于测试）
// 对照需求文档 4.2 节：系统角色 + 网站信息 + 任务指令 + 数据来源声明 + Markdown 输出

export const QUESTION_KEYS = ['positioning', 'monetization', 'traffic'];

const SYSTEM_ROLE = `你是一位资深的互联网商业分析师，擅长从网站表面信息推断其定位、商业模式与流量策略。
请基于提供的网站信息进行分析，并以 Markdown 格式输出。
重要声明：竞争对手信息完全基于你的模型知识推断，可能存在时效性偏差，请在结果中标注"基于模型知识推断"。`;

const QUESTION_INSTRUCTIONS = {
  positioning: `请分析该网站的定位与差异化：
1. 网站概述：用 1-2 段话说明网站是干什么的、服务谁、解决什么问题
2. 主要竞争对手：列出 3 个核心竞争对手，并简述其特点
3. 差异化定位：以 Markdown 表格形式呈现本网站与 3 个竞品在定位上的差异`,
  monetization: `请分析该网站的核心卖点与商业模式：
1. 核心卖点：提炼 3-5 条核心卖点（USP）
2. 变现模式：分析该网站怎么赚钱（如广告、订阅、交易佣金、SaaS 等）
3. 定价策略：结合下方可见的定价信号，总结其定价结构`,
  traffic: `请分析该网站的流量来源与用户留存：
1. 流量来源推断：基于页面可见信息（SEO 关键词、社交分享按钮、广告位、内容策略等）推断主要流量来源
2. 获客方式：分析其获客手段
3. 留存策略：结合下方留存信号，分析其如何留住用户`,
};

/**
 * 构建系统 Prompt
 * @returns {string}
 */
export function buildSystemPrompt() {
  return SYSTEM_ROLE;
}

/**
 * 构建网站基本信息段
 * @param {Object} siteData
 * @returns {string}
 */
function buildSiteInfo(siteData) {
  return `【网站基本信息】
- URL: ${siteData.url || '(未知)'}
- 域名: ${siteData.domain || '(未知)'}
- 标题: ${siteData.title || '(无)'}
- 描述: ${siteData.description || '(无)'}
- 关键词: ${siteData.keywords || '(无)'}
- OG 标题: ${siteData.ogTitle || '(无)'}
- OG 类型: ${siteData.ogType || '(无)'}
- 主标题: ${(siteData.headings || []).join(' / ') || '(无)'}
- 正文摘要: ${siteData.bodyPreview || '(无)'}
- 正文长度: ${siteData.bodyLength || 0} 字符`;
}

/**
 * 构建定价信号段
 * @param {Object} pricing
 * @returns {string}
 */
function buildPricingSection(pricing) {
  if (!pricing) return '';
  return `【可见定价信号】
- 价格文本: ${(pricing.priceTexts || []).join(' | ') || '(未检测到)'}
- 定价关键词: ${(pricing.keywords || []).join(', ') || '(未检测到)'}`;
}

/**
 * 构建留存信号段
 * @param {Object} retention
 * @returns {string}
 */
function buildRetentionSection(retention) {
  if (!retention) return '';
  const social = (retention.socialShares || [])
    .map((s) => `${s.platform}(${s.count})`)
    .join(', ');
  return `【留存信号】
- 社交分享: ${social || '(未检测到)'}
- 订阅入口(newsletter): ${retention.hasNewsletterSignup ? '有' : '无'}
- 登录注册入口: ${retention.hasAuthEntry ? '有' : '无'}
- 推送通知: ${retention.hasPushNotification ? '有' : '无'}`;
}

/**
 * 构建单问 Prompt
 * @param {('positioning'|'monetization'|'traffic')} questionKey
 * @param {Object} siteData
 * @returns {string}
 */
export function buildQuestionPrompt(questionKey, siteData) {
  const instruction = QUESTION_INSTRUCTIONS[questionKey];
  if (!instruction) {
    throw new Error(`未知问题 key: ${questionKey}`);
  }

  const parts = [
    buildSiteInfo(siteData),
    '',
    questionKey === 'monetization' ? buildPricingSection(siteData.pricing) : '',
    questionKey === 'traffic' ? buildRetentionSection(siteData.retention) : '',
    '',
    '【任务】',
    instruction,
  ].filter((s) => s !== '');

  return parts.join('\n');
}

/**
 * 构建全部三问 Prompt
 * @param {Object} siteData
 * @returns {Object} { positioning, monetization, traffic }
 */
export function buildAllPrompts(siteData) {
  return {
    positioning: buildQuestionPrompt('positioning', siteData),
    monetization: buildQuestionPrompt('monetization', siteData),
    traffic: buildQuestionPrompt('traffic', siteData),
  };
}
