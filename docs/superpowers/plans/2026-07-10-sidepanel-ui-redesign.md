# Side Panel UI 重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将插件从 popup 迁移到 Side Panel，实现点图标直接分析、面板不因外部点击关闭、AITDK 风格左侧标签栏布局。

**Architecture:** 移除 popup，改用 `chrome.sidePanel`。点工具栏图标 toggle 开/关面板（`setPanelBehavior({openPanelOnActionClick:true})`，window 级）。面板常驻右侧、加载即自动发起三问分析；左侧标签栏（图标+文字+状态）+ 右侧内容区。放弃 per-tab 可见性（Chrome 未修 bug #987），改用「数据按 tab 隔离」弥补（切到 B 显示 B 分析/空态，回 A 显示 A 结果）。复用现有消息流（`START_ANALYSIS_V2`/`QUESTION_PROGRESS`/`ANALYSIS_DONE`/`RETRY_QUESTION`/`GET_RESULTS`）与 lib（`markdown-renderer`/`copy-builder`）。

**Tech Stack:** Chrome Extension MV3、`chrome.sidePanel` API（Chrome 114+）、原生 JS/HTML/CSS（无构建）。

## Global Constraints

- **无构建步骤**：原生 JS + ES modules。service-worker 声明 `type:module`；sidepanel 页面是扩展页面，`<script type="module">` 可用，sidepanel.js 用静态 `import` 引 lib（与 popup.js 同模式）。
- **Chrome 114+**（`chrome.sidePanel` 可用）。
- **复用现有消息类型**（均带 `tabId`）：`START_ANALYSIS_V2`、`RETRY_QUESTION`、`GET_RESULTS`、`QUESTION_PROGRESS`、`ANALYSIS_DONE`。service-worker 的 `runAnalysis`/`buildChatFn`/`unwrapExtractionResponse` 不动。
- **UI 胶水层无单测**：sidepanel.js/html/css 沿用 popup.js 模式（无单测），每个 task 含「真实浏览器验证」步骤作为测试。现有 289 个测试不受影响（lib/消息流不变）。
- **commit 前手动 `npm test`**：pre-commit hook 已临时禁用，改由手动跑 `npm test` 守护（确认 289 绿再 commit）。
- **加载扩展调试**：`chrome://extensions` → 开发者模式 → 该扩展「刷新」→ 改动生效。改 content/manifest 后需刷新扩展；改 sidepanel 后在面板内右键「重新加载」或刷新扩展。

## File Structure

| 文件 | 责任 | 动作 |
|------|------|------|
| `manifest.json` | 声明 sidePanel 权限 + side_panel 路径；移除 default_popup | 改 |
| `src/background/service-worker.js` | 顶层 `setPanelBehavior({openPanelOnActionClick:true})` 配置点图标 toggle 开关面板 | 改 |
| `src/sidepanel/sidepanel.html` | header + 左标签栏 + 右内容区结构 | 新建 |
| `src/sidepanel/sidepanel.css` | 左右分栏 + 标签状态 + Markdown 样式 | 新建 |
| `src/sidepanel/sidepanel.js` | 自动分析/进度/标签切换/重试/复制/设置 | 新建 |
| `src/popup/{popup.html,popup.css,popup.js}` | 旧 popup（不再使用） | 删 |

---

## Task 1: Side Panel 基础设施（manifest + toggle + 占位页）

**目标**：点工具栏图标能 toggle 开关一个空的 Side Panel，点面板外不关闭。

**Files:**
- Modify: `manifest.json`
- Modify: `src/background/service-worker.js`（顶部 import 之后加一段）
- Create: `src/sidepanel/sidepanel.html`（最小占位，Task 2 替换）

**Interfaces:**
- Produces: `manifest.json` 声明 `side_panel.default_path = "src/sidepanel/sidepanel.html"`、`permissions` 含 `"sidePanel"`、`action` 无 `default_popup`；service-worker 顶层 `setPanelBehavior({openPanelOnActionClick:true})`，点图标 toggle 开关面板。

- [ ] **Step 1: 改 `manifest.json`**

替换整个文件为：

```json
{
  "manifest_version": 3,
  "name": "AI 网站分析助手",
  "version": "0.5.0",
  "description": "一键调用 AI 分析网站定位、商业模式与流量策略",
  "permissions": ["activeTab", "scripting", "storage", "sidePanel"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "src/background/service-worker.js",
    "type": "module"
  },
  "action": {
    "default_title": "AI 网站分析助手"
  },
  "side_panel": {
    "default_path": "src/sidepanel/sidepanel.html"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/content.js"],
      "run_at": "document_idle"
    }
  ],
  "options_ui": {
    "page": "src/options/options.html",
    "open_in_tab": true
  }
}
```

要点：`permissions` 加 `"sidePanel"`；`action` 删掉 `default_popup`（这样点图标走 toggle，不弹 popup）；新增 `side_panel` 段。

- [ ] **Step 2: service-worker 配置 setPanelBehavior（点图标 toggle 开关面板）**

在 `src/background/service-worker.js` 所有 import 语句之后、`let currentResults` 之前插入：

```js
// Side Panel：点工具栏图标 toggle 开/关面板（window 级）。
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e) =>
  console.error('设置 Side Panel 行为失败', e)
);
```

> **为什么不用 per-tab（切 tab 自动隐藏面板）**：Chrome sidePanel 的 per-tab 可见性是**未修 bug**（[GoogleChrome/chrome-extensions-samples#987](https://github.com/GoogleChrome/chrome-extensions-samples/issues/987)）——`open({tabId})` 仍是全局显示（切 tab 不隐藏），而全局 `setOptions({enabled:false})` 又让 `open` 报 `No active side panel for tabId`。四版实测（setPanelBehavior → open({tabId}) → +全局 enabled:false → 调顺序）均失败，故放弃 per-tab，改 window 级 toggle。
> - 行为：面板常驻右侧（切 tab 不消失，但只占窄条、不挡网页主体）；点图标开/关；浏览器 × 关闭。
> - 满足原始优化 2：点面板外不关、切 tab 能正常用网页、点图标/× 可关。
> - 「切 B 看不到面板」做不到（Chrome 限制）；改用**数据按 tab 隔离**（Task 3）弥补：切到 B 面板显示 B 的分析/空态，回 A 显示 A 结果。

- [ ] **Step 3: 建最小占位 `src/sidepanel/sidepanel.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>AI 网站分析助手</title>
</head>
<body>
  <p>Side Panel 占位（Task 2 替换）</p>
</body>
</html>
```

- [ ] **Step 4: 真实浏览器验证**

1. `chrome://extensions` → 该扩展「刷新」
2. 打开任意普通网页（如 https://example.com）
3. 点工具栏插件图标 → 浏览器右侧应滑出 Side Panel，显示「Side Panel 占位…」
4. 点 Side Panel **以外的网页区域** → 面板**不关闭**（核心验证点）
5. 再次点工具栏图标 → 面板关闭（toggle）
6. 切换到别的标签页 → 面板仍在

预期全部成立。若面板不开，检查 `chrome://extensions` 该扩展有无报错、Chrome 版本 ≥114。

- [ ] **Step 5: 守护 + commit**

```bash
npm test    # 预期 289 passed（本次改动不涉及测试覆盖的代码）
git add manifest.json src/background/service-worker.js src/sidepanel/sidepanel.html
git commit -m "feat: 迁移到 Side Panel——manifest 配置 + toggle 行为（占位页）"
```

---

## Task 2: 静态布局（AITDK 风格 header + 左标签栏 + 右内容区）

**目标**：Side Panel 显示完整静态布局，三标签 + 右内容区，无 JS 交互。

**Files:**
- Replace: `src/sidepanel/sidepanel.html`（完整结构）
- Create: `src/sidepanel/sidepanel.css`

**Interfaces:**
- Produces: DOM 结构含 `.tab[data-key]`（positioning/monetization/traffic）、`.tab-status[data-status]`、`#contentTitle`、`#contentBody`、`#copyAllBtn`、`#settingsBtn`、`#siteInfo`——供 Task 3 的 JS 挂接。

- [ ] **Step 1: 写完整 `src/sidepanel/sidepanel.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>AI 网站分析助手</title>
  <link rel="stylesheet" href="sidepanel.css" />
</head>
<body>
  <header class="header">
    <div class="title">
      <span class="logo">🤖</span>
      <span class="name">AI 网站分析助手</span>
    </div>
    <div class="actions">
      <button id="copyAllBtn" class="icon-btn" title="复制全部" disabled>📋</button>
      <button id="settingsBtn" class="icon-btn" title="设置">⚙️</button>
    </div>
  </header>
  <div id="siteInfo" class="site-info"></div>

  <main class="main">
    <nav class="tabs">
      <button class="tab active" data-key="positioning">
        <span class="tab-status" data-status="positioning"></span>
        <span class="tab-label">产品定位</span>
      </button>
      <button class="tab" data-key="monetization">
        <span class="tab-status" data-status="monetization"></span>
        <span class="tab-label">核心卖点</span>
      </button>
      <button class="tab" data-key="traffic">
        <span class="tab-status" data-status="traffic"></span>
        <span class="tab-label">流量来源</span>
      </button>
    </nav>
    <section class="content">
      <h2 id="contentTitle" class="content-title"></h2>
      <div id="contentBody" class="content-body"></div>
    </section>
  </main>

  <script type="module" src="sidepanel.js"></script>
</body>
</html>
```

- [ ] **Step 2: 写 `src/sidepanel/sidepanel.css`**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  color: #1f2329;
  background: #f7f8fa;
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #fff;
  border-bottom: 1px solid #e5e6eb;
}
.title { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.logo { font-size: 18px; }
.actions { display: flex; gap: 4px; }
.icon-btn {
  border: none; background: transparent; cursor: pointer;
  font-size: 16px; padding: 4px 6px; border-radius: 4px;
}
.icon-btn:hover { background: #f2f3f5; }
.icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.site-info {
  padding: 6px 12px; color: #86909c; font-size: 12px;
  background: #fff; border-bottom: 1px solid #e5e6eb;
}
.main { flex: 1; display: flex; overflow: hidden; }
.tabs {
  width: 132px; flex-shrink: 0;
  background: #fff; border-right: 1px solid #e5e6eb;
  padding: 8px 0; overflow-y: auto;
}
.tab {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 10px 12px;
  border: none; background: transparent; cursor: pointer;
  text-align: left; font-size: 13px; color: #4e5969;
  border-left: 3px solid transparent;
}
.tab:hover { background: #f7f8fa; }
.tab.active {
  background: #e8f3ff; color: #165dff;
  border-left-color: #165dff; font-weight: 600;
}
.tab-status {
  display: inline-block; width: 16px; text-align: center; font-size: 14px;
}
.tab-status.loading::before { content: "⟳"; color: #86909c; }
.tab-status.fulfilled::before { content: "✓"; color: #00b42a; }
.tab-status.rejected::before { content: "✗"; color: #f53f3f; }
.content {
  flex: 1; padding: 16px; overflow-y: auto; background: #f7f8fa;
}
.content-title { font-size: 15px; margin-bottom: 12px; color: #1f2329; }
.content-body { line-height: 1.7; }
.content-body .loading-text { color: #86909c; }
.content-body .error-text { color: #f53f3f; }
.content-body .retry-btn {
  margin-top: 8px; padding: 4px 12px;
  border: 1px solid #165dff; background: #fff; color: #165dff;
  border-radius: 4px; cursor: pointer; font-size: 12px;
}
/* Markdown 渲染样式 */
.content-body h1, .content-body h2, .content-body h3 { margin: 12px 0 6px; }
.content-body p { margin: 6px 0; }
.content-body ul, .content-body ol { margin: 6px 0 6px 20px; }
.content-body table { border-collapse: collapse; margin: 8px 0; width: 100%; }
.content-body th, .content-body td {
  border: 1px solid #e5e6eb; padding: 6px 8px; text-align: left; font-size: 13px;
}
.content-body th { background: #f2f3f5; }
.content-body code { background: #f2f3f5; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
```

- [ ] **Step 3: 真实浏览器验证**

1. `chrome://extensions` → 该扩展「刷新」
2. 点工具栏图标开 Side Panel
3. 预期：顶部 header（🤖 AI 网站分析助手 + 📋⚙️）；下方域名行（空）；左侧三标签（产品定位高亮、核心卖点、流量来源）；右侧空内容区。左右分栏正确、可读。

- [ ] **Step 4: 守护 + commit**

```bash
npm test
git add src/sidepanel/sidepanel.html src/sidepanel/sidepanel.css
git commit -m "feat: Side Panel 静态布局（header + 左标签栏 + 右内容区）"
```

---

## Task 3: Side Panel 交互（自动分析 + 进度 + 标签切换 + 重试 + 复制 + 设置）

**目标**：点图标开面板即自动分析；三问进度实时更新标签状态与右侧内容；标签可切换；失败可重试；可复制全部、进设置。

**Files:**
- Create: `src/sidepanel/sidepanel.js`（Task 2 的 html 已引 `<script type="module" src="sidepanel.js">`）

**Interfaces:**
- Consumes: 现有消息类型与 lib。`chrome.runtime.sendMessage({type:'START_ANALYSIS_V2',tabId})` 触发分析；接收 `{type:'QUESTION_PROGRESS', update:{key,status,value?,reason?}}` 与 `{type:'ANALYSIS_DONE', overall, error?}`；`{type:'GET_RESULTS'}` 回 `{results}`；`buildCopyText(results,{url})`、`renderMarkdown(md)` 来自 lib。
- Produces: 完整可用的 Side Panel（三问分析全流程）。

- [ ] **Step 1: 写 `src/sidepanel/sidepanel.js`**

```js
// Side Panel 交互（复用现有消息流 + lib，与 popup.js 同属 UI 胶水层）
import { renderMarkdown } from '../lib/markdown-renderer.js';
import { buildCopyText } from '../lib/copy-builder.js';

const QUESTION_KEYS = ['positioning', 'monetization', 'traffic'];
const LABELS = { positioning: '产品定位', monetization: '核心卖点', traffic: '流量来源' };

// 状态
const results = {}; // { [key]: { status: 'loading'|'fulfilled'|'rejected', value?, reason? } }
let activeKey = 'positioning';
let currentUrl = '';
let currentTabId = null;

// DOM
const tabs = document.querySelectorAll('.tab');
const siteInfo = document.getElementById('siteInfo');
const contentTitle = document.getElementById('contentTitle');
const contentBody = document.getElementById('contentBody');
const copyAllBtn = document.getElementById('copyAllBtn');
const settingsBtn = document.getElementById('settingsBtn');

/** 初始化：记录 tabId + 域名，随即自动发起分析（优化①） */
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  currentTabId = tab.id;
  try {
    const url = new URL(tab.url);
    currentUrl = url.href;
    siteInfo.textContent = url.hostname;
  } catch {
    siteInfo.textContent = '当前页面不可分析';
  }
  startAnalysis();
}

/** 发起（或重置）三问分析 */
function startAnalysis() {
  for (const key of QUESTION_KEYS) {
    results[key] = { status: 'loading' };
    setTabStatus(key, 'loading');
  }
  renderActiveContent();
  updateCopyBtn();
  chrome.runtime.sendMessage({ type: 'START_ANALYSIS_V2', tabId: currentTabId });
}

/** 设置某标签的状态图标 class */
function setTabStatus(key, status) {
  const el = document.querySelector(`.tab-status[data-status="${key}"]`);
  if (el) el.className = 'tab-status ' + status;
}

/** 渲染当前激活标签的右侧内容 */
function renderActiveContent() {
  contentTitle.textContent = LABELS[activeKey];
  const r = results[activeKey] || { status: 'loading' };
  contentBody.innerHTML = '';
  if (r.status === 'loading') {
    contentBody.innerHTML = '<p class="loading-text">正在分析…</p>';
  } else if (r.status === 'fulfilled') {
    contentBody.innerHTML = renderMarkdown(r.value || '');
  } else if (r.status === 'rejected') {
    const err = r.reason instanceof Error ? r.reason.message : String(r.reason || '分析失败');
    contentBody.innerHTML =
      `<p class="error-text">分析失败：${escapeHtml(err)}</p>` +
      `<button class="retry-btn" data-retry="${activeKey}">重试此问</button>`;
  }
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 复制按钮可用性：至少一问完成才可复制 */
function updateCopyBtn() {
  copyAllBtn.disabled = !Object.values(results).some((r) => r && r.status === 'fulfilled');
}

// 标签点击切换
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    activeKey = tab.dataset.key;
    renderActiveContent();
  });
});

// 重试（事件委托，按钮在错误态动态生成）
document.addEventListener('click', (e) => {
  const retryKey = e.target.dataset.retry;
  if (!retryKey) return;
  chrome.runtime.sendMessage({ type: 'RETRY_QUESTION', key: retryKey, tabId: currentTabId });
  results[retryKey] = { status: 'loading' };
  setTabStatus(retryKey, 'loading');
  if (retryKey === activeKey) renderActiveContent();
});

// 复制全部
copyAllBtn.addEventListener('click', async () => {
  const resp = await chrome.runtime.sendMessage({ type: 'GET_RESULTS' });
  if (resp && resp.results) {
    const text = buildCopyText(resp.results, { url: currentUrl });
    await navigator.clipboard.writeText(text);
    copyAllBtn.textContent = '✓';
    setTimeout(() => (copyAllBtn.textContent = '📋'), 1500);
  }
});

// 设置
settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

// 接收 background 推送
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'QUESTION_PROGRESS') {
    const { key, status, value, reason } = msg.update;
    results[key] = { status, value, reason };
    setTabStatus(key, status);
    if (key === activeKey) renderActiveContent();
    updateCopyBtn();
  } else if (msg.type === 'ANALYSIS_DONE') {
    updateCopyBtn();
    // 整体失败（如提取/标签阶段错误）：把仍 loading 的标签置为失败并显示原因
    if (msg.overall === 'error') {
      for (const key of QUESTION_KEYS) {
        if (!results[key] || results[key].status === 'loading') {
          results[key] = { status: 'rejected', reason: new Error(msg.error || '分析失败') };
          setTabStatus(key, 'rejected');
        }
      }
      if (results[activeKey] && results[activeKey].status === 'rejected') renderActiveContent();
    }
  }
});

init();
```

- [ ] **Step 2: 真实浏览器验证（全流程）**

前置：设置页配好自有 Key（智谱 glm-4-flash 或其他有效模型）。

1. `chrome://extensions` → 该扩展「刷新」
2. 打开一个内容丰富的网页（如 https://www.youtube.com），**刷新该页**（让 content script 注入）
3. 点工具栏图标 → Side Panel 开 → **应立即显示三标签为 ⟳、右侧「正在分析…」**（优化①验证）
4. 等待 → 每问完成其标签变 ✓，右侧（若该标签激活）显示 Markdown 结果
5. 点「核心卖点」标签 → 右侧切到该问结果
6. **切到别的浏览器标签页 / 点网页** → Side Panel 不关、结果保留（优化②验证）
7. 点 📋 → 粘贴到别处验证含三问文本；点 ⚙️ → 设置页打开
8. （可选）若某问失败：标签 ✗，点进去显示错误 + 「重试此问」，点重试重新 loading

预期全部成立。

- [ ] **Step 3: 守护 + commit**

```bash
npm test
git add src/sidepanel/sidepanel.js
git commit -m "feat: Side Panel 交互——自动分析/进度/标签切换/重试/复制/设置"
```

---

## Task 4: 移除旧 popup

**目标**：删除不再使用的 popup 文件，确认 manifest 已无 default_popup（Task 1 已删）、扩展不再加载 popup。

**Files:**
- Delete: `src/popup/popup.html`, `src/popup/popup.css`, `src/popup/popup.js`

- [ ] **Step 1: 删除 popup 目录**

```bash
git rm src/popup/popup.html src/popup/popup.css src/popup/popup.js
```

- [ ] **Step 2: 真实浏览器验证**

1. `chrome://extensions` → 该扩展「刷新」，**无报错**
2. 点工具栏图标 → 开 Side Panel（不再是 popup 小窗）
3. 确认 `manifest.json` 内无 `default_popup` 字段（Task 1 已移除）

- [ ] **Step 3: 守护 + commit**

```bash
npm test
git add -A
git commit -m "chore: 移除旧 popup（已迁移到 Side Panel）"
```

---

## Self-Review 结论

- **Spec 覆盖**：优化①（Task 3 `init`→`startAnalysis` 自动发起）；优化②（Task 1 sidePanel toggle + Task 3 面板常驻验证）；优化③（Task 2 左标签栏 + Task 3 切换）。关闭按钮限制（spec 第 6 节）——通过 toggle + 浏览器 × 实现，已在 spec 确认。
- **占位符**：无。
- **类型/命名一致**：`QUESTION_KEYS`/`LABELS`/`activeKey`/`results`/`setTabStatus`/`renderActiveContent` 全程一致；DOM 的 `data-key`/`data-status`/id 与 JS 选择器一致。
- **复用确认**：消息类型、`renderMarkdown`、`buildCopyText` 均为现有导出，未改动 service-worker 核心逻辑。
