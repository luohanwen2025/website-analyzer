// 三问并行调度（核心编排逻辑）
// 对照需求文档 2.2 节：三问并行，单问失败不影响其他两问，每问完成回调进度

import { buildAllPrompts, buildSystemPrompt, QUESTION_KEYS } from './prompt-templates.js';

/**
 * 并行执行三问分析
 * @param {Object} siteData 页面提取内容
 * @param {Object} deps { chat: (userPrompt, systemPrompt) => Promise<string> }
 * @param {Function} [onProgress] (update) => void，每问完成时回调
 * @returns {Promise<Object>} { positioning, monetization, traffic }，每项含 status 与 value/reason
 */
export async function analyzeSite(siteData, deps, onProgress) {
  if (!deps || typeof deps.chat !== 'function') {
    throw new Error('analyzeSite 缺少 chat 依赖');
  }

  const { chat } = deps;
  const prompts = buildAllPrompts(siteData);
  const systemPrompt = buildSystemPrompt();

  // 为每个问题构造 Promise，完成后立即回调进度
  const tasks = QUESTION_KEYS.map((key) => {
    const promise = chat(prompts[key], systemPrompt).then(
      (value) => {
        if (onProgress) onProgress({ key, status: 'fulfilled', value });
        return { status: 'fulfilled', value };
      },
      (reason) => {
        const err = reason instanceof Error ? reason : new Error(String(reason));
        if (onProgress) onProgress({ key, status: 'rejected', reason: err });
        return { status: 'rejected', reason: err };
      }
    );
    return [key, promise];
  });

  const entries = await Promise.all(
    tasks.map(async ([key, p]) => [key, await p])
  );

  return Object.fromEntries(entries);
}
