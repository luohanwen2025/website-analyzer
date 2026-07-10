# Side Panel UI 重构设计

> 日期：2026-07-10
> 状态：待用户审阅
> 关联需求：使用流程优化（点图标直接分析）、面板不因外部点击关闭、参考 AITDK 重做布局

## 1. 背景与目标

当前插件用 popup（点图标弹出小窗），存在三个体验问题：

1. 点图标后还要再点「开始分析」按钮才分析，多一步操作。
2. 分析等待中，点 popup 外部任何位置都会立即关闭 popup、丢失分析；用户只能干等，不能同时用网页或切标签。
3. 三问结果竖排折叠面板，窄 popup 里拥挤；布局不美观。

目标：迁移到 Side Panel，一并解决三点，并按 AITDK 风格做「左侧标签栏 + 右侧内容」布局。

## 2. 架构决策：popup → Side Panel

**硬约束**：Chrome popup 一旦点到外部即关闭，是浏览器底层行为，JavaScript 无法阻止。优化②要求「点外部不关闭」，popup 物理上做不到。

**决策**：迁移到 `chrome.sidePanel`（Chrome 114+，2026 年全量可用）。Side Panel 是独立侧边面板，不抢焦点、不因外部点击关闭，用户可同时操作网页、切换标签。

替代方案（已否决）：
- 独立弹出窗口（`chrome.windows`）：浮动会遮挡、需自行管理窗口，体验差。
- 维持 popup：无法满足优化②。

## 3. 三优化如何落地

| 需求 | Side Panel 实现 |
|------|------|
| ①点图标直接分析 | 点图标 → 面板打开 → 面板加载即自动 `sendMessage(START_ANALYSIS_V2)`，默认显示「分析中」 |
| ②点外部不关闭 | Side Panel 本身不因外部点击关闭；切标签、用网页面板常驻；再点图标 toggle 关闭 |
| ③AITDK 布局 | 面板内「左侧标签栏 + 右侧内容」，三标签对应三问 |

## 4. UI 布局

```
┌────────────────────────────────┐
│ 🤖 AI 网站分析助手    ⚙️ 📋    │  ← header：标题 + 域名 + 设置/复制
│ youtube.com                    │
├────────────┬───────────────────┤
│ ● ✓ 产品定位│  产品定位         │  ← 左：标签栏（图标+文字+状态）
│   ⟳ 核心卖点│  YouTube 是全球性 │  ← 右：选中标签的内容
│   ⟳ 流量来源│  视频分享平台…    │
│             │  竞争对手：表格…  │
└────────────┴───────────────────┘
```

- **header**：插件名 + 当前域名 + ⚙️设置（`openOptionsPage`）+ 📋复制全部（复用 `copy-builder`）。
- **左标签栏**：三项（产品定位 / 核心卖点 / 流量来源），各带状态图标 ⟳分析中 / ✓完成 / ✗失败，当前选中项高亮（●）。
- **右内容区**：选中标签的分析结果（复用 `markdown-renderer`）；分析中显示 spinner；失败显示错误 +「重试此问」。

标签风格已确认：**图标 + 文字 + 状态**（最贴 AITDK，一眼看到哪问完成）。

## 5. 交互流程

1. 点工具栏图标 → Side Panel 打开（toggle，再点关闭）。
2. 面板加载 → `sidepanel.js` 获取当前 tabId（`chrome.tabs.query({active,currentWindow})`，side panel 上下文 currentWindow 可靠）→ `sendMessage(START_ANALYSIS_V2, {tabId})`。
3. 三问默认 loading，停在「产品定位」标签。
4. service-worker 推 `QUESTION_PROGRESS`（每问完成）→ 对应标签图标更新（✓/✗），若该标签当前选中则右侧同步刷新。
5. 用户点标签 → 右侧切到该问内容（已完成显示结果，未完成显示 loading）。
6. 单问失败 → 标签 ✗ → 点进去显示错误 +「重试此问」（`RETRY_QUESTION`，带 tabId）。
7. 📋复制全部 → `GET_RESULTS` + `buildCopyText`（复用）。
8. ⚙️设置 → `openOptionsPage`。
9. 关闭：再点图标 toggle，或浏览器面板 ×。

## 6. 权衡与限制

- **无编程关闭按钮**：`chrome.sidePanel` 无 `close` API。关闭靠 toggle（再点图标）或浏览器面板 ×。已与用户确认接受。
- **每次开面板重新分析**：side panel 关闭后 JS 上下文销毁，再开会重新发起分析。简单但免费体验模式会消耗配额（每日 3 次）。符合用户「点图标直接分析」的直觉。未来可优化：开面板先 `GET_RESULTS` 复用近期结果（需处理 service worker 休眠致 `currentResults` 丢失）。本次不做（YAGNI）。
- **service worker 休眠**：MV3 service worker 会休眠，`currentResults`（内存变量）可能丢失。「复制全部」在 sw 重启后取不到旧结果——可接受（用户通常分析完即复制）。

## 7. 文件改动

| 文件 | 改动 |
|------|------|
| `manifest.json` | 加 `sidePanel` 权限 + `side_panel.default_path`；移除 `action.default_popup` |
| `src/sidepanel/sidepanel.html` | 新建：header + 左标签栏 + 右内容区结构 |
| `src/sidepanel/sidepanel.css` | 新建：左右分栏、标签状态、内容区样式（AITDK 风格） |
| `src/sidepanel/sidepanel.js` | 新建：加载自动分析、监听进度、标签切换、重试、复制、设置（复用现有消息类型 + lib） |
| `src/background/service-worker.js` | `onInstalled` 里 `setPanelBehavior({openPanelOnActionClick:true})`；其余消息处理不变 |
| `src/popup/` | 移除（不再使用） |

## 8. 不改的部分

- **消息流**：`START_ANALYSIS_V2` / `RETRY_QUESTION` / `RETRY_ALL_FAILED` / `GET_RESULTS` / `QUESTION_PROGRESS` / `ANALYSIS_DONE` / `CONTENT_WARNING` 全部复用。
- **lib 纯函数**：analyzer / analyzer-orchestrator / ai-client / prompt-templates / markdown-renderer / copy-builder 等不动。
- **service-worker 核心逻辑**：`runAnalysis`、`buildChatFn`、`unwrapExtractionResponse` 等不动。

## 9. 测试考虑

- `sidepanel.js` 是 UI 胶水层，单测覆盖有限（同 popup 现状）。
- 可加：service-worker 的 `setPanelBehavior` 配置测试（mock `chrome.sidePanel`）。
- 回归：现有 289 个测试不受影响（lib / 消息流不变）。
- 主要靠真实浏览器验证：点图标→面板开→自动分析→切标签看结果→切网页面板不关→再点图标关。
