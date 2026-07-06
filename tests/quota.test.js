import { describe, it, expect } from 'vitest';
import {
  todayKey,
  buildQuotaKey,
  checkQuota,
  QUOTA_LIMIT_PER_DAY,
} from '../src/lib/quota.js';

describe('配额纯函数 quota', () => {
  describe('todayKey', () => {
    it('返回 YYYY-MM-DD 格式', () => {
      const key = todayKey(new Date('2026-07-06T10:00:00+08:00'));
      expect(key).toBe('2026-07-06');
    });

    it('按 UTC+8 计算日期', () => {
      // UTC 时间 2026-07-06 00:30 = 北京时间 2026-07-06 08:30
      expect(todayKey(new Date('2026-07-06T00:30:00Z'))).toBe('2026-07-06');
      // UTC 时间 2026-07-06 23:30 = 北京时间 2026-07-07 07:30
      expect(todayKey(new Date('2026-07-06T23:30:00Z'))).toBe('2026-07-07');
    });

    it('不传参数时使用当前时间', () => {
      const key = todayKey();
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('支持注入自定义 Date 构造器（便于测试）', () => {
      const fixedNow = new Date('2026-12-25T15:00:00+08:00');
      const key = todayKey(fixedNow);
      expect(key).toBe('2026-12-25');
    });
  });

  describe('buildQuotaKey', () => {
    it('拼接 deviceId 与 date', () => {
      expect(buildQuotaKey('dev-abc', '2026-07-06')).toBe('quota:dev-abc:2026-07-06');
    });

    it('不同 deviceId 产生不同 key', () => {
      expect(buildQuotaKey('dev-a', '2026-07-06')).not.toBe(
        buildQuotaKey('dev-b', '2026-07-06')
      );
    });

    it('不同 date 产生不同 key', () => {
      expect(buildQuotaKey('dev-a', '2026-07-06')).not.toBe(
        buildQuotaKey('dev-a', '2026-07-07')
      );
    });

    it('空 deviceId 抛错', () => {
      expect(() => buildQuotaKey('', '2026-07-06')).toThrow();
    });
  });

  describe('checkQuota', () => {
    it('未使用次数时允许', () => {
      const r = checkQuota(0, 3);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(3);
    });

    it('接近上限但仍未超时允许', () => {
      const r = checkQuota(2, 3);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(1);
    });

    it('已达上限时拒绝', () => {
      const r = checkQuota(3, 3);
      expect(r.allowed).toBe(false);
      expect(r.remaining).toBe(0);
    });

    it('超过上限时拒绝且 remaining 为 0', () => {
      const r = checkQuota(5, 3);
      expect(r.allowed).toBe(false);
      expect(r.remaining).toBe(0);
    });

    it('limit 为 0 时永远拒绝', () => {
      const r = checkQuota(0, 0);
      expect(r.allowed).toBe(false);
      expect(r.remaining).toBe(0);
    });

    it('不传 limit 时使用默认值 QUOTA_LIMIT_PER_DAY', () => {
      expect(QUOTA_LIMIT_PER_DAY).toBeGreaterThan(0);
      const r = checkQuota(QUOTA_LIMIT_PER_DAY - 1);
      expect(r.allowed).toBe(true);
      const r2 = checkQuota(QUOTA_LIMIT_PER_DAY);
      expect(r2.allowed).toBe(false);
    });

    it('返回 used 字段反映已用次数', () => {
      const r = checkQuota(2, 3);
      expect(r.used).toBe(2);
    });
  });
});
