// 配额纯函数（中转服务侧使用）
// 设备每日配额：按 deviceId + 日期(YYYY-MM-DD, UTC+8) 计数
// 默认每设备每日 3 次完整分析（见需求文档 5.5 节）

// 默认每日配额：3 次完整分析
export const QUOTA_LIMIT_PER_DAY = 3;

/**
 * 将 Date 转为 UTC+8 时区的 YYYY-MM-DD 字符串
 * 不依赖宿主时区，保证全球部署的 Worker 行为一致
 * @param {Date} [date] 不传则用当前时间
 * @returns {string} YYYY-MM-DD
 */
export function todayKey(date = new Date()) {
  // 转 UTC+8 毫秒
  const utc8Ms = date.getTime() + 8 * 60 * 60 * 1000;
  const d = new Date(utc8Ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 构造 KV 存储用的配额 key
 * @param {string} deviceId
 * @param {string} dateKey YYYY-MM-DD
 * @returns {string}
 */
export function buildQuotaKey(deviceId, dateKey) {
  if (!deviceId) throw new Error('deviceId 不能为空');
  return `quota:${deviceId}:${dateKey}`;
}

/**
 * 根据已用次数与上限判定是否允许调用
 * @param {number} used 已使用次数
 * @param {number} [limit=QUOTA_LIMIT_PER_DAY] 每日上限
 * @returns {{allowed:boolean, remaining:number, used:number}}
 */
export function checkQuota(used, limit = QUOTA_LIMIT_PER_DAY) {
  const usedNum = Number(used) || 0;
  const limitNum = Number(limit) || 0;
  const allowed = usedNum < limitNum;
  const remaining = allowed ? limitNum - usedNum : 0;
  return { allowed, remaining, used: usedNum };
}
