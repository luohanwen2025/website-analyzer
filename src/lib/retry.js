// 单问失败重试（带退避）
// 用于三问并行调度中单问的独立重试

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 带重试地执行异步函数
 * @param {Function} fn 无参异步函数
 * @param {Object} [options]
 * @param {number} [options.maxAttempts=3] 最大尝试次数（含首次）
 * @param {number} [options.backoffMs=0] 每次重试前的退避毫秒数
 * @returns {Promise<*>} fn 的返回值
 */
export async function withRetry(fn, options = {}) {
  const { maxAttempts = 3, backoffMs = 0 } = options;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt < maxAttempts && backoffMs > 0) {
        await sleep(backoffMs);
      }
    }
  }
  throw lastError;
}
