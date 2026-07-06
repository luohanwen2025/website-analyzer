import { describe, it, expect } from 'vitest';
import { buildCopyText, buildSingleCopyText } from '../src/lib/copy-builder.js';

const results = {
  positioning: { status: 'fulfilled', value: '# 定位分析\n这是一个网站。' },
  monetization: { status: 'fulfilled', value: '# 商业模式\n卖订阅。' },
  traffic: { status: 'rejected', reason: new Error('流量分析失败') },
};

describe('buildSingleCopyText', () => {
  it('拼接单个问题的标题与内容', () => {
    const text = buildSingleCopyText('positioning', results.positioning);
    expect(text).toContain('定位与差异化');
    expect(text).toContain('# 定位分析');
  });

  it('失败问题返回错误信息', () => {
    const text = buildSingleCopyText('traffic', results.traffic);
    expect(text).toContain('流量来源与用户留存');
    expect(text).toContain('分析失败');
    expect(text).toContain('流量分析失败');
  });
});

describe('buildCopyText', () => {
  it('拼接所有三问，含分隔与标题', () => {
    const text = buildCopyText(results);
    expect(text).toContain('定位与差异化');
    expect(text).toContain('核心卖点与商业模式');
    expect(text).toContain('流量来源与用户留存');
    expect(text).toContain('# 定位分析');
    expect(text).toContain('# 商业模式');
  });

  it('包含网站 URL（当提供时）', () => {
    const text = buildCopyText(results, { url: 'https://www.example.com' });
    expect(text).toContain('https://www.example.com');
  });

  it('失败问题以错误信息替代内容', () => {
    const text = buildCopyText(results);
    expect(text).toContain('分析失败');
    expect(text).toContain('流量分析失败');
  });

  it('全部成功时不含失败标记', () => {
    const allOk = {
      positioning: { status: 'fulfilled', value: 'A' },
      monetization: { status: 'fulfilled', value: 'B' },
      traffic: { status: 'fulfilled', value: 'C' },
    };
    const text = buildCopyText(allOk);
    expect(text).not.toContain('分析失败');
  });
});
