// 服务商下拉选项构造器
// 将 providers.js 中的服务商配置转换为 <select> 可直接使用的 {value,label,model} 列表
// 支持注入自定义 providers 字典以便测试与复用

import { getProvider, listProviderIds, DEFAULT_PROVIDER_ID } from '../config/providers.js';

/**
 * 构造服务商下拉选项
 * @param {Object} [providers] 可选，注入的 providers 字典；不传则使用 providers.js 默认配置
 * @param {{defaultId?: string}} [options] 可选，defaultId 指定排在第一位的 provider id
 * @returns {{value:string,label:string,model:string}[]}
 */
export function buildProviderOptions(providers, options = {}) {
  let sourceDict;
  if (providers) {
    sourceDict = providers;
  } else {
    sourceDict = {};
    for (const id of listProviderIds()) {
      sourceDict[id] = getProvider(id);
    }
  }

  const defaultId = options.defaultId || DEFAULT_PROVIDER_ID;
  const entries = Object.entries(sourceDict);

  // 默认服务商排在第一位，其他保持原顺序
  entries.sort(([a], [b]) => {
    if (a === defaultId) return -1;
    if (b === defaultId) return 1;
    return 0;
  });

  return entries.map(([id, p]) => ({
    value: p.id || id,
    label: p.name,
    model: p.defaultModel,
  }));
}
