# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概要

AI 网站分析助手 —— 一个 Manifest V3 的 Chrome 扩展。用户在任意网页点击插件，并行调用 AI 回答「三问」（网站定位 / 商业模式 / 流量留存），结果以 Markdown 渲染。支持两种调用模式：**免费体验**（走 Cloudflare Worker 中转，托管共享 Key + 设备配额）与 **自有 Key**（直连服务商）。需求与里程碑见 [需求说明书.md](需求说明书.md)（M1–M7 已完成）。

## 常用命令

```bash
npm test                 # 跑全部测试（vitest run，285 个用例）
npm run test:watch       # watch 模式
npx vitest run tests/quota.test.js              # 跑单个测试文件
npx vitest run -t "对内部页返回"                  # 按用例名过滤
npx vitest run tests/quota.test.js tests/proxy-handler.test.js  # 多文件
```

中转服务（Cloudflare Worker，需先 `npm i -g wrangler && wrangler login`）：

```bash
wrangler dev             # 本地调试，http://localhost:8787
wrangler deploy          # 部署
wrangler secret put AI_QWEN_KEY   # 注入上游共享 Key（不要写进 wrangler.toml）
wrangler kv:namespace create QUOTA  # 创建配额 KV，id 填回 wrangler.toml
```

加载扩展调试：Chrome → `chrome://extensions` → 开发者模式 → 加载未打包扩展 → 选**项目根目录**（不是 src/）。

## 架构（big picture）

### 1. 没有构建步骤 —— 源码即产物

`manifest.json` 直接指向 `src/` 下的文件，service-worker 声明 `"type": "module"`，ES `import` 在浏览器里原生工作。**不要假设有打包/transpile**：只能用浏览器与 Web Worker 原生支持的语法，不能引入 TS/JSX 或需要打包的 npm 运行时依赖。`package.json` 的 devDependencies 仅有 vitest + jsdom，全部用于测试，不参与产物。需求文档提到 Vite，但项目实际未采用。

**⚠️ content script 例外（重要）**：MV3 的 `content_scripts` **不支持** `"type": "module"`，所以 [content.js](src/content/content.js) **不能用静态 `import`/`export`**——否则注入瞬间抛 SyntaxError、`onMessage` listener 永不注册（表现为 "Could not establish connection. Receiving end does not exist."）。content.js 已内联 `extractor`/`pricing-signals`/`retention-signals` 三件套、自包含；lib 原文件保留供单元测试。**改提取逻辑要同步 lib 与 content.js 两处**，由 [tests/content-script.test.js](tests/content-script.test.js) 守护"content.js 无静态 import"。

### 2. 纯函数 + 依赖注入是核心约定

`src/lib/` 下几乎所有模块都是**纯函数**，Chrome API（`chrome.storage.local`、`chrome.tabs`、`fetch`、`document`）从不直接调用，而是通过参数注入。三个「胶水层」负责把真实 API 接入纯函数：

- [src/background/service-worker.js](src/background/service-worker.js) — 扩展后台，注入 `chrome.tabs` / `chrome.storage` / `chrome.runtime`
- [src/popup/popup.js](src/popup/popup.js)、[src/options/options.js](src/options/options.js) — UI 层，注入 DOM
- [proxy/worker.js](proxy/worker.js) — Cloudflare Worker 入口，注入 KV namespace 与 env secret

**新增可复用逻辑时**：抽成纯函数放进 `src/lib/`，副作用（读 storage、发消息、请求网络、操作 DOM）留在胶水层。这是项目能维持 285 个测试、TDD 流程的前提。

### 3. 三问并行的数据契约（跨 5 个文件）

`QUESTION_KEYS = ['positioning', 'monetization', 'traffic']` 在 [prompt-templates.js](src/lib/prompt-templates.js) 导出，但 [popup.js](src/popup/popup.js) 和 service-worker 里也各自持有同名常量——改 key 要同步多处。数据流：

```
popup ──START_ANALYSIS_V2──► service-worker
sw   ──EXTRACT_CONTENT──────► content script ──► extractPageContent(doc)
sw   并行 chat() 三问（analyzer-orchestrator.js，单问失败不影响其他）
sw   ──QUESTION_PROGRESS──► popup（每问完成即推，含 {key,status,value|reason}）
sw   ──ANALYSIS_DONE───────► popup（overall: done | done-with-errors | error）
```

- 消息类型：`START_ANALYSIS_V2`、`RETRY_QUESTION`、`RETRY_ALL_FAILED`（三者均由 popup 携带 `tabId` 一并发送——service-worker 上下文里 `chrome.tabs.query({currentWindow:true})` 在窗口失焦时会返回空，tab 必须由 popup 传入）、`GET_RESULTS`、`QUESTION_PROGRESS`、`ANALYSIS_DONE`（`overall: error` 时 popup 会把仍处 loading 的面板复位并显示 `error` 字段）、`CONTENT_WARNING`。
- orchestrator 返回 `{ [key]: { status: 'fulfilled'|'rejected', value?|reason? } }`。

### 4. 双路径路由

[router.js](src/lib/router.js) `resolveRequestConfig` 根据配置 `mode` 解析最终请求参数：

- `free` → endpoint 指向 `${PROXY_BASE}/<providerId>`，注入 `X-Device-Id` 头，apiKey 占位为 `'proxy-managed'`
- `self` → endpoint 指向服务商直连地址，用用户 apiKey

[ai-client.js](src/lib/ai-client.js) 只认 `provider.endpoint` + `provider.buildHeaders(apiKey)`，对中转/直连无感。中转的衔接发生在 service-worker 的 `buildChatFn`：`free` 模式下用 `{...provider, endpoint, buildHeaders}` 重写 provider，把 `X-Device-Id` 拼进 headers。ai-client 含 `AbortController` 超时（默认 30s，可注入 `signal` 合并外部 abort）。

### 5. 中转服务与扩展共用 lib

[proxy/worker.js](proxy/worker.js) 是 Worker 入口（仅绑定 env），业务逻辑全部 import 自 `src/lib/` 的 [proxy-handler.js](src/lib/proxy-handler.js)（编排）、[proxy-forwarder.js](src/lib/proxy-forwarder.js)（路径解析 / 上游请求构造 / 响应构造纯函数）、[quota.js](src/lib/quota.js) + [quota-checker.js](src/lib/quota-checker.js)（配额）。**改中转逻辑就改 `src/lib/proxy-*.js` 并补测试**，不要在 worker.js 里写业务。配额 key 格式：`quota:<deviceId>:<YYYY-MM-DD UTC+8>`（UTC+8 写死以保证全球部署一致）。转发时仅白名单 OpenAI 兼容字段（`model/messages/temperature/max_tokens/stream/top_p`），剥离 deviceId 等。

### 6. 错误分类驱动 UX

[error-classifier.js](src/lib/error-classifier.js) `classifyError` 把原始错误（按 message 正则 + `err.name`）映射为 `kind`（`network|timeout|auth|rate_limit|quota_exhausted|server|bad_request|parse|unknown`），每个 kind 带 `retryable` 与中文 `userMessage`。service-worker 在三问 `rejected` 时调用它，把 `errorKind/errorUserMessage/retryable` 附到 `QUESTION_PROGRESS` 推送给 popup。**新增错误场景时**：先加 error-classifier 的 pattern 与测试，再考虑上层处理。[retry.js](src/lib/retry.js) 提供带退避重试（service-worker 默认 `maxAttempts:2, backoffMs:800`，只重试 `network/timeout/server` 这类——不可重试错误由 classifyError 的 retryable 语义体现，retry 本身不分类）。

### 7. 服务商抽象

[providers.js](src/config/providers.js) 定义服务商表，每项含 `endpoint / defaultModel / requestFormat / buildHeaders(apiKey)`。MVP 仅真正实现 `openai` 兼容格式（通义千问/DeepSeek/OpenAI/智谱），`anthropic`/`gemini` 有配置但 ai-client 尚未按 `requestFormat` 分支处理。新增服务商：在 providers.js 加项 +（如非 openai 格式）在 ai-client.js 增 `requestFormat` 分支。

## 关键配置点

| 位置 | 内容 | 备注 |
|------|------|------|
| [config-loader.js](src/lib/config-loader.js) `PROXY_BASE` | 中转服务地址 | 当前是**占位** `https://wa-proxy.example.workers.dev/...`，部署后必须替换 |
| [providers.js](src/config/providers.js) | 服务商 endpoint/模型 | |
| `wrangler.toml` `QUOTA_LIMIT` | 每设备每日完整分析上限（默认 3 = 9 次 AI 调用） | |
| `wrangler secret` | 共享上游 Key（`AI_QWEN_KEY` 等） | **绝不**写进 wrangler.toml 或代码，本地用 `.dev.vars`（已 gitignore） |
| `chrome.storage.local` | 用户配置 `{mode,providerId,model,apiKey}` + `deviceId` | 自有 Key 仅存本地，不上传中转 |

## 测试约定

- vitest + jsdom，配置见 [vitest.config.js](vitest.config.js)，扫描 `tests/**/*.test.js`。
- 测试一个 lib 纯函数时，构造入参对象即可；测试需要 Chrome/Web API 的逻辑时，从外层注入 mock（如 `createConfigStorage(mockStorage)`、`createAiClient({fetchImpl})`、`handleProxyRequest(request,{quotaChecker,resolveUpstream,fetchImpl})`）——不要在测试里依赖真实 `chrome.*`。
- 用例名与断言用中文，与现有风格一致。
