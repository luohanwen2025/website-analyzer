// 设置页表单纯函数
// 把 UI 表单状态规范化为 config 对象；切换服务商时同步默认模型
// 与 DOM 解耦，便于测试

/**
 * 将表单原始状态规范化为 config 对象
 * - 免费模式下 apiKey 强制清空（避免泄露/误用）
 * - 各字段 trim
 * @param {{mode:string, providerId:string, apiKey:string, model:string}} form
 * @returns {{mode:string, providerId:string, apiKey:string, model:string}}
 */
export function buildConfigFromForm(form) {
  const mode = String(form.mode || '').trim();
  const providerId = String(form.providerId || '').trim();
  const model = String(form.model || '').trim();
  const apiKey = mode === 'free'
    ? ''
    : String(form.apiKey || '').trim();
  return { mode, providerId, apiKey, model };
}

/**
 * 切换服务商时决定新的 model 值
 * - 新旧相同或新服务商不存在 → 保留 currentModel
 * - 当前 model 为空或等于旧服务商默认模型 → 切换到新服务商默认模型
 * - 当前 model 是用户自定义 → 保留用户输入
 * @param {{newProviderId:string, oldProviderId:string, currentModel:string, providerOptions:{value:string,model:string}[]}} args
 * @returns {string}
 */
export function resolveModelOnProviderChange({
  newProviderId,
  oldProviderId,
  currentModel,
  providerOptions,
}) {
  if (newProviderId === oldProviderId) return currentModel;

  const newProvider = providerOptions.find((o) => o.value === newProviderId);
  if (!newProvider) return currentModel;

  const oldProvider = providerOptions.find((o) => o.value === oldProviderId);
  const isOldDefault = oldProvider && currentModel === oldProvider.model;

  if (!currentModel || isOldDefault) {
    return newProvider.model;
  }
  return currentModel;
}
