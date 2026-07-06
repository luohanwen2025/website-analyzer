// 内容充足性检测（纯函数）
// 判断提取的页面内容是否足够进行 AI 分析
// 需求 5.4：页面内容过少（如纯图片站）→ 提示"内容不足，结果可能不准"

const MIN_BODY_LENGTH = 100; // 正文最少字符数
const WARNING_THRESHOLD = 150; // 低于此值给出警告

/**
 * 评估内容是否充足
 * @param {Object} pageData extractPageContent 的返回值
 * @returns {{sufficient:boolean, reason:string, warning:string}}
 */
export function assessContentSufficiency(pageData) {
  if (!pageData) {
    return {
      sufficient: false,
      reason: '未提供页面内容',
      warning: '',
    };
  }

  const bodyLength =
    typeof pageData.bodyLength === 'number'
      ? pageData.bodyLength
      : (pageData.bodyPreview || '').length;

  if (bodyLength < MIN_BODY_LENGTH) {
    const isImageSite = pageData.ogType === 'image' || bodyLength === 0;
    const reason = isImageSite
      ? '页面文本内容过少（可能是纯图片站），无法有效分析'
      : `页面正文过短（${bodyLength} 字符），内容不足以分析`;
    return {
      sufficient: false,
      reason,
      warning: '内容不足，结果可能不准',
    };
  }

  // 充足但接近下限时给警告
  const warning =
    bodyLength < WARNING_THRESHOLD
      ? '内容较少，分析结果可能不准，请谨慎参考'
      : '';

  return {
    sufficient: true,
    reason: '',
    warning,
  };
}
