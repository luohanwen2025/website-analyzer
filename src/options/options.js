// 设置页交互逻辑（Chrome API 胶水层）
// 业务逻辑全部委托给纯函数：buildProviderOptions / buildConfigFromForm / resolveModelOnProviderChange
// 存储通过 createConfigStorage 注入 chrome.storage.local

import { createConfigStorage } from '../lib/config-storage.js';
import { buildProviderOptions } from '../lib/provider-options.js';
import { buildConfigFromForm, resolveModelOnProviderChange } from '../lib/options-form.js';

const configStorage = createConfigStorage(chrome.storage.local);
const providerOptions = buildProviderOptions();

// DOM 引用
const modeRadios = document.querySelectorAll('input[name="mode"]');
const providerSelect = document.getElementById('providerSelect');
const modelInput = document.getElementById('modelInput');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiKeyField = document.getElementById('apiKeyField');
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const statusEl = document.getElementById('status');

let lastLoadedProviderId = '';

/** 填充服务商下拉 */
function renderProviderOptions() {
  providerSelect.innerHTML = '';
  for (const opt of providerOptions) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = `${opt.label}（默认：${opt.model}）`;
    providerSelect.appendChild(option);
  }
}

/** 读取当前选中的模式 */
function getSelectedMode() {
  const checked = Array.from(modeRadios).find((r) => r.checked);
  return checked ? checked.value : 'free';
}

/** 根据模式显隐 API Key 字段 */
function updateApiKeyVisibility() {
  const mode = getSelectedMode();
  if (mode === 'self') {
    apiKeyField.classList.remove('hidden');
  } else {
    apiKeyField.classList.add('hidden');
  }
}

/** 用配置填充表单 */
function applyConfigToForm(config) {
  // 模式
  const mode = config.mode || 'free';
  modeRadios.forEach((r) => {
    r.checked = r.value === mode;
  });

  // 服务商
  const providerId = config.providerId || 'qwen';
  const exists = Array.from(providerSelect.options).some(
    (o) => o.value === providerId
  );
  providerSelect.value = exists ? providerId : providerOptions[0].value;
  lastLoadedProviderId = providerSelect.value;

  // 模型
  modelInput.value = config.model || '';

  // API Key
  apiKeyInput.value = config.apiKey || '';

  updateApiKeyVisibility();
}

/** 显示状态提示 */
function showStatus(message, type = 'success') {
  statusEl.textContent = message;
  statusEl.className = 'status ' + type;
}

/** 初始化 */
async function init() {
  renderProviderOptions();
  try {
    const config = await configStorage.load();
    applyConfigToForm(config);
  } catch (e) {
    showStatus('加载配置失败：' + e.message, 'error');
  }
}

// 事件：模式切换
modeRadios.forEach((radio) => {
  radio.addEventListener('change', updateApiKeyVisibility);
});

// 事件：服务商切换 → 同步默认模型
providerSelect.addEventListener('change', () => {
  const next = resolveModelOnProviderChange({
    newProviderId: providerSelect.value,
    oldProviderId: lastLoadedProviderId,
    currentModel: modelInput.value.trim(),
    providerOptions,
  });
  modelInput.value = next;
  lastLoadedProviderId = providerSelect.value;
});

// 事件：保存
saveBtn.addEventListener('click', async () => {
  const form = {
    mode: getSelectedMode(),
    providerId: providerSelect.value,
    apiKey: apiKeyInput.value,
    model: modelInput.value,
  };
  const config = buildConfigFromForm(form);
  try {
    await configStorage.save(config);
    showStatus('已保存', 'success');
  } catch (e) {
    showStatus('保存失败：' + e.message, 'error');
  }
});

// 事件：恢复默认
resetBtn.addEventListener('click', async () => {
  try {
    await configStorage.reset();
    const config = await configStorage.load();
    applyConfigToForm(config);
    showStatus('已恢复默认配置', 'success');
  } catch (e) {
    showStatus('重置失败：' + e.message, 'error');
  }
});

init();
