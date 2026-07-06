import { describe, it, expect } from 'vitest';
import { assessContentSufficiency } from '../src/lib/content-sufficiency.js';

describe('内容充足性检测 content-sufficiency', () => {
  it('正文为空时 insufficient', () => {
    const r = assessContentSufficiency({
      title: '某站',
      description: '',
      bodyPreview: '',
      bodyLength: 0,
      headings: [],
    });
    expect(r.sufficient).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it('正文过短（< 100 字符）时 insufficient', () => {
    const r = assessContentSufficiency({
      title: '某站',
      description: '',
      bodyPreview: '短内容',
      bodyLength: 5,
      headings: [],
    });
    expect(r.sufficient).toBe(false);
    expect(r.reason).toMatch(/过短|不足|太少/);
  });

  it('正文 >= 100 字符且非空时 sufficient', () => {
    const r = assessContentSufficiency({
      title: '某站',
      description: 'xxx',
      bodyPreview: 'a'.repeat(150),
      bodyLength: 150,
      headings: ['标题'],
    });
    expect(r.sufficient).toBe(true);
  });

  it('正文长度刚好 100 字符时 sufficient（边界）', () => {
    const r = assessContentSufficiency({
      bodyPreview: 'a'.repeat(100),
      bodyLength: 100,
    });
    expect(r.sufficient).toBe(true);
  });

  it('正文长度 99 字符时 insufficient（边界）', () => {
    const r = assessContentSufficiency({
      bodyPreview: 'a'.repeat(99),
      bodyLength: 99,
    });
    expect(r.sufficient).toBe(false);
  });

  it('有描述但无正文时仍 insufficient（描述不足以分析）', () => {
    const r = assessContentSufficiency({
      title: '某站',
      description: '这是一个网站',
      bodyPreview: '',
      bodyLength: 0,
    });
    expect(r.sufficient).toBe(false);
  });

  it('有标题+描述+充足正文时 sufficient 且 reason 为空', () => {
    const r = assessContentSufficiency({
      title: '某站',
      description: '描述',
      bodyPreview: 'a'.repeat(200),
      bodyLength: 200,
      headings: ['h1'],
    });
    expect(r.sufficient).toBe(true);
    expect(r.reason).toBe('');
  });

  it('纯图片站（bodyLength=0 但有 og:image）时 insufficient 并提示', () => {
    const r = assessContentSufficiency({
      title: '图片站',
      bodyPreview: '',
      bodyLength: 0,
      ogType: 'image',
    });
    expect(r.sufficient).toBe(false);
    expect(r.reason).toMatch(/图片|内容|文本/);
  });

  it('bodyLength 缺失时按 bodyPreview 长度判断', () => {
    const r = assessContentSufficiency({
      bodyPreview: 'a'.repeat(150),
      // bodyLength 缺失
    });
    expect(r.sufficient).toBe(true);
  });

  it('返回 warning 字段（即使 sufficient 也可能含建议）', () => {
    const r = assessContentSufficiency({
      bodyPreview: 'a'.repeat(150),
      bodyLength: 150,
    });
    expect(typeof r.warning).toBe('string');
  });

  it('内容接近下限时 warning 提示结果可能不准', () => {
    const r = assessContentSufficiency({
      bodyPreview: 'a'.repeat(110),
      bodyLength: 110,
    });
    expect(r.sufficient).toBe(true);
    expect(r.warning).toMatch(/可能不准|建议|谨慎/);
  });

  it('null 输入返回 insufficient', () => {
    const r = assessContentSufficiency(null);
    expect(r.sufficient).toBe(false);
  });

  it('undefined 输入返回 insufficient', () => {
    const r = assessContentSufficiency(undefined);
    expect(r.sufficient).toBe(false);
  });
});
