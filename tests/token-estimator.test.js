import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  truncateToTokens,
  DEFAULT_TOKEN_LIMIT,
} from '../src/lib/token-estimator.js';

describe('Token 估算器 token-estimator', () => {
  describe('estimateTokens', () => {
    it('空字符串返回 0', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('纯 ASCII 英文按约 4 字符/token 估算', () => {
      // "hello world" = 11 字符 ≈ 3 token
      const tokens = estimateTokens('hello world');
      expect(tokens).toBeGreaterThan(2);
      expect(tokens).toBeLessThan(5);
    });

    it('中文按约 1.5 字符/token 估算（中文密度高）', () => {
      // 10 个中文字 ≈ 7 token
      const tokens = estimateTokens('这是一个测试用的中文文本');
      expect(tokens).toBeGreaterThan(5);
      expect(tokens).toBeLessThan(12);
    });

    it('中英混合文本返回正数', () => {
      const tokens = estimateTokens('Hello 世界 this is 测试');
      expect(tokens).toBeGreaterThan(3);
    });

    it('长文本随长度单调递增', () => {
      const short = estimateTokens('短文本');
      const long = estimateTokens('这是一段非常非常非常长的文本'.repeat(10));
      expect(long).toBeGreaterThan(short);
    });

    it('null/undefined 输入返回 0', () => {
      expect(estimateTokens(null)).toBe(0);
      expect(estimateTokens(undefined)).toBe(0);
    });

    it('非字符串输入转字符串后估算', () => {
      expect(estimateTokens(123)).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_TOKEN_LIMIT', () => {
    it('默认上限为 8000（需求 5.1）', () => {
      expect(DEFAULT_TOKEN_LIMIT).toBe(8000);
    });
  });

  describe('truncateToTokens', () => {
    it('短文本不截断，原样返回', () => {
      const text = '短文本';
      expect(truncateToTokens(text, 100)).toBe(text);
    });

    it('超长文本截断到指定 token 上限内', () => {
      const long = 'a'.repeat(1000); // 约 250 token
      const truncated = truncateToTokens(long, 50);
      expect(estimateTokens(truncated)).toBeLessThanOrEqual(50);
    });

    it('截断后追加省略号标记', () => {
      const long = 'a'.repeat(1000);
      const truncated = truncateToTokens(long, 50);
      expect(truncated).toMatch(/…$/);
    });

    it('未截断时不追加省略号', () => {
      expect(truncateToTokens('短文本', 100)).not.toMatch(/…$/);
    });

    it('空字符串返回空字符串', () => {
      expect(truncateToTokens('', 100)).toBe('');
    });

    it('limit 为 0 返回空字符串', () => {
      expect(truncateToTokens('some text', 0)).toBe('');
    });

    it('不传 limit 时使用 DEFAULT_TOKEN_LIMIT', () => {
      const long = 'a'.repeat(100000); // 远超 8000 token
      const truncated = truncateToTokens(long);
      expect(estimateTokens(truncated)).toBeLessThanOrEqual(DEFAULT_TOKEN_LIMIT);
    });

    it('中文文本截断后 token 数在上限内', () => {
      const long = '这是中文内容'.repeat(1000);
      const truncated = truncateToTokens(long, 100);
      expect(estimateTokens(truncated)).toBeLessThanOrEqual(100);
    });

    it('返回值包含 truncated 标记（是否发生了截断）', () => {
      const short = truncateToTokens('短', 100);
      expect(short).not.toMatch(/…$/);
      const long = truncateToTokens('a'.repeat(1000), 50);
      expect(long).toMatch(/…$/);
    });
  });
});
