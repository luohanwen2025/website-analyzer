// 配额检查器（中转服务侧使用）
// 依赖注入 KV storage（兼容 Cloudflare KV 接口：get/put）
// 与 Cloudflare Worker 运行时解耦，便于在 Node.js + vitest 中测试

import {
  todayKey,
  buildQuotaKey,
  checkQuota,
  QUOTA_LIMIT_PER_DAY,
} from './quota.js';

// 配额 key 在 KV 中的 TTL：1 天（秒）
// 即使跨日，KV 也自动清理；正常运行靠日期分段
const QUOTA_TTL_SECONDS = 24 * 60 * 60;

/**
 * 创建配额检查器
 * @param {Object} kvstorage 满足 Cloudflare KV 接口 {get, put}
 * @param {{limit?: number}} [options]
 */
export function createQuotaChecker(kvstorage, options = {}) {
  const limit = options.limit != null ? options.limit : QUOTA_LIMIT_PER_DAY;

  /** 读取当前已用次数（KV 中存字符串数字） */
  async function readUsed(key) {
    const raw = await kvstorage.get(key);
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : 0;
  }

  /** 写入已用次数（带 TTL，避免 KV 无限增长） */
  async function writeUsed(key, used) {
    await kvstorage.put(key, String(used), {
      expirationTtl: QUOTA_TTL_SECONDS,
    });
  }

  return {
    /**
     * 检查当前配额（不递增）
     * @param {string} deviceId
     * @param {string|null} [dateKey] YYYY-MM-DD，null 时用 todayKey(now)
     * @param {{now?: Date}} [ctx]
     */
    async check(deviceId, dateKey, ctx = {}) {
      const date = dateKey || todayKey(ctx.now || new Date());
      const key = buildQuotaKey(deviceId, date);
      const used = await readUsed(key);
      return { ...checkQuota(used, limit), used };
    },

    /**
     * 递增配额计数（无论是否允许，调用方需先 check）
     * @param {string} deviceId
     * @param {string|null} [dateKey]
     * @param {{now?: Date}} [ctx]
     */
    async increment(deviceId, dateKey, ctx = {}) {
      const date = dateKey || todayKey(ctx.now || new Date());
      const key = buildQuotaKey(deviceId, date);
      const used = await readUsed(key);
      await writeUsed(key, used + 1);
      return { used: used + 1 };
    },

    /**
     * 检查并递增（原子性由调用方在 Worker 中保证，这里仅做读-改-写）
     * - 已达上限：不递增，返回 allowed=false
     * - 未达上限：递增 1，返回新状态
     * @param {string} deviceId
     * @param {string|null} [dateKey]
     * @param {{now?: Date}} [ctx]
     */
    async checkAndIncrement(deviceId, dateKey, ctx = {}) {
      const date = dateKey || todayKey(ctx.now || new Date());
      const key = buildQuotaKey(deviceId, date);
      const used = await readUsed(key);
      const decision = checkQuota(used, limit);
      if (!decision.allowed) {
        return { ...decision, used };
      }
      const nextUsed = used + 1;
      await writeUsed(key, nextUsed);
      return {
        allowed: true,
        used: nextUsed,
        remaining: limit - nextUsed,
      };
    },
  };
}
