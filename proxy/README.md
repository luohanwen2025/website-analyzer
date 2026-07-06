# 免费体验中转服务（Cloudflare Worker）

负责托管共享 AI Key + 设备配额限制，供插件「免费体验」模式调用。

## 架构

```
插件 → POST /api/ai/:providerId  (Header: X-Device-Id)
        │
        ▼
   Cloudflare Worker
        │
        ├─ 1. 解析 providerId 与 X-Device-Id
        ├─ 2. 配额检查+递增（KV: quota:<deviceId>:<YYYY-MM-DD>）
        ├─ 3. 注入共享 API Key（从 env secret 读取）
        ├─ 4. 转发到上游 OpenAI 兼容 endpoint
        └─ 5. 透传响应（附加 CORS 头）
        │
        ▼
   AI 服务商（通义千问/DeepSeek/智谱/OpenAI）
```

## 模块

| 文件 | 职责 |
|------|------|
| [worker.js](./worker.js) | Worker 入口，绑定 env（KV + secrets），委托给 handleProxyRequest |
| [../src/lib/proxy-handler.js](../src/lib/proxy-handler.js) | 请求处理核心（可测，依赖注入） |
| [../src/lib/proxy-forwarder.js](../src/lib/proxy-forwarder.js) | 路径解析/请求构造/响应构造纯函数 |
| [../src/lib/quota.js](../src/lib/quota.js) | 配额纯函数（日期 key、配额判定） |
| [../src/lib/quota-checker.js](../src/lib/quota-checker.js) | 配额检查器（注入 KV storage） |

测试：`npx vitest run tests/quota.test.js tests/quota-checker.test.js tests/proxy-forwarder.test.js tests/proxy-handler.test.js`

## 部署步骤

### 1. 安装 wrangler

```bash
npm install -g wrangler
wrangler login
```

### 2. 创建 KV namespace

```bash
wrangler kv:namespace create QUOTA
```

把返回的 `id` 填入 [wrangler.toml](../wrangler.toml) 的 `[[kv_namespaces]]` 段并取消注释。

### 3. 配置 AI 服务商 API Key（secret）

> ⚠️ 不要把 Key 写进 wrangler.toml 提交到 git。用 secret 注入：

```bash
wrangler secret put AI_QWEN_KEY      # 通义千问
wrangler secret put AI_DEEPSEEK_KEY  # DeepSeek
# 其他按需配置：AI_ZHIPU_KEY / AI_OPENAI_KEY
```

本地开发用 `.dev.vars` 文件（已被 .gitignore 排除）：

```
AI_QWEN_KEY=sk-xxx
AI_DEEPSEEK_KEY=sk-yyy
```

### 4. 部署

```bash
wrangler deploy
```

部署后得到地址：`https://website-analyzer-proxy.<你的账号>.workers.dev`

### 5. 更新插件侧 PROXY_BASE

编辑 [src/lib/config-loader.js](../src/lib/config-loader.js)，把 `PROXY_BASE` 改为部署地址：

```js
export const PROXY_BASE = 'https://website-analyzer-proxy.<你的账号>.workers.dev/api/ai';
```

### 6. 本地开发调试

```bash
wrangler dev
```

本地地址默认 `http://localhost:8787`，可手动 curl 测试：

```bash
curl -X POST http://localhost:8787/api/ai/qwen \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: dev-test-001" \
  -d '{"model":"qwen-plus","messages":[{"role":"user","content":"你好"}]}'
```

## 配额策略

- 每设备每日默认 3 次完整分析（即 9 次 AI 调用，因一次分析并发三问）
- 按 `deviceId + YYYY-MM-DD(UTC+8)` 分段计数
- KV 中存字符串数字，TTL 24 小时自动清理
- 配置项 `QUOTA_LIMIT`（环境变量）可调整上限
- 接近上限时插件侧 Popup 应提示剩余次数（M7 实现）

## 安全

- 用户自有 API Key 仅存本地 chrome.storage，**不上传中转服务**
- 中转服务仅转发 OpenAI 兼容字段，剥离 deviceId 等无关字段
- 共享 Key 通过 Cloudflare secret 注入，不进代码仓库
- 所有流量走 HTTPS
