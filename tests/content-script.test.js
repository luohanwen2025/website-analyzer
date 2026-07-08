// 回归保护：content script 必须可被 MV3 注入
// 背景：content.js 曾用 ES module 静态 import，但 MV3 content_scripts 不支持 type:module，
//   导致注入瞬间 SyntaxError、onMessage listener 永不注册、分析流程卡死
//   （"Could not establish connection. Receiving end does not exist."）。
//   单元测试只覆盖 lib 纯函数，覆盖不到"真实注入"——本测试做静态源码检查守住这条线。

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// vitest 在项目根（vitest.config.js 所在目录）运行，process.cwd() 即仓库根
const contentSrc = readFileSync(
  resolve(process.cwd(), 'src/content/content.js'),
  'utf8'
);

describe('content script 可注入性（MV3 约束）', () => {
  it('content.js 不得包含 ES module 静态 import（行首）', () => {
    // 匹配位于行首（允许缩进）的静态 import 语句
    expect(contentSrc).not.toMatch(/^\s*import\s/m);
  });

  it('content.js 不得包含 ES module 静态 export（行首）', () => {
    // content script 非 module，export 同样非法
    expect(contentSrc).not.toMatch(/^\s*export\s/m);
  });
});
