import { describe, it, expect } from 'vitest';
import { isAnalyzableUrl } from '../src/lib/url-filter.js';

describe('isAnalyzableUrl', () => {
  it('对普通 http 网页返回 true', () => {
    expect(isAnalyzableUrl('http://www.example.com')).toBe(true);
  });

  it('对普通 https 网页返回 true', () => {
    expect(isAnalyzableUrl('https://www.taobao.com/page')).toBe(true);
  });

  it('对 chrome:// 内部页返回 false', () => {
    expect(isAnalyzableUrl('chrome://extensions/')).toBe(false);
  });

  it('对 chrome-extension:// 内部页返回 false', () => {
    expect(isAnalyzableUrl('chrome-extension://abc/popup.html')).toBe(false);
  });

  it('对 edge:// 内部页返回 false', () => {
    expect(isAnalyzableUrl('edge://settings/')).toBe(false);
  });

  it('对 about: 内部页返回 false', () => {
    expect(isAnalyzableUrl('about:blank')).toBe(false);
  });

  it('对 devtools:// 内部页返回 false', () => {
    expect(isAnalyzableUrl('devtools://devtools/bundled/inspector.html')).toBe(false);
  });

  it('对空字符串返回 false', () => {
    expect(isAnalyzableUrl('')).toBe(false);
  });

  it('协议大小写不敏感', () => {
    expect(isAnalyzableUrl('CHROME://extensions/')).toBe(false);
  });
});
