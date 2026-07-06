import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../src/lib/markdown-renderer.js';

describe('renderMarkdown', () => {
  it('渲染一级标题', () => {
    const html = renderMarkdown('# 标题');
    expect(html).toContain('<h1>标题</h1>');
  });

  it('渲染二级与三级标题', () => {
    const html = renderMarkdown('## 二级\n### 三级');
    expect(html).toContain('<h2>二级</h2>');
    expect(html).toContain('<h3>三级</h3>');
  });

  it('渲染无序列表', () => {
    const html = renderMarkdown('- 项一\n- 项二');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>项一</li>');
    expect(html).not.toContain('项两');
    expect(html).toContain('<li>项二</li>');
  });

  it('渲染有序列表', () => {
    const html = renderMarkdown('1. 第一\n2. 第二');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>第一</li>');
    expect(html).toContain('<li>第二</li>');
  });

  it('渲染加粗文本', () => {
    const html = renderMarkdown('这是 **加粗** 文本');
    expect(html).toContain('<strong>加粗</strong>');
  });

  it('渲染表格', () => {
    const md = '| 网站 | 定位 |\n| --- | --- |\n| A | 电商 |\n| B | SaaS |';
    const html = renderMarkdown(md);
    expect(html).toContain('<table>');
    expect(html).toContain('<th>网站</th>');
    expect(html).toContain('<td>电商</td>');
    expect(html).toContain('<td>SaaS</td>');
  });

  it('渲染行内代码', () => {
    const html = renderMarkdown('使用 `npm` 安装');
    expect(html).toContain('<code>npm</code>');
  });

  it('渲染段落', () => {
    const html = renderMarkdown('这是一段普通文本。');
    expect(html).toContain('<p>这是一段普通文本。</p>');
  });

  it('转义 HTML 危险字符防 XSS', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('空字符串返回空字符串', () => {
    expect(renderMarkdown('')).toBe('');
  });

  it('多行混合内容正确渲染', () => {
    const md = '# 标题\n\n列表项：\n\n- 项一\n- 项二\n\n**结尾**';
    const html = renderMarkdown(md);
    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<li>项一</li>');
    expect(html).toContain('<strong>结尾</strong>');
  });
});
