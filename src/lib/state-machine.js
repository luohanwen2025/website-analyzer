// 分析状态机（纯逻辑，便于测试与 UI 绑定）
// 管理三问的独立状态与整体聚合状态

import { QUESTION_KEYS } from './prompt-templates.js';

/**
 * 创建分析状态机
 * @returns {Object}
 */
export function createAnalysisStateMachine() {
  let state = createInitialState();
  const subscribers = new Set();

  function createInitialState() {
    return {
      overall: 'idle', // idle | loading | done | done-with-errors
      questions: Object.fromEntries(QUESTION_KEYS.map((k) => [k, 'idle'])),
      results: Object.fromEntries(QUESTION_KEYS.map((k) => [k, null])),
      errors: Object.fromEntries(QUESTION_KEYS.map((k) => [k, null])),
    };
  }

  function setState(next) {
    state = next;
    notify();
  }

  function notify() {
    for (const fn of subscribers) {
      try {
        fn(state);
      } catch {
        // 订阅者异常不应影响状态机
      }
    }
  }

  function recomputeOverall() {
    const statuses = QUESTION_KEYS.map((k) => state.questions[k]);
    const allDone = statuses.every((s) => s === 'fulfilled' || s === 'rejected');
    if (!allDone) {
      state.overall = 'loading';
      return;
    }
    const hasRejected = statuses.some((s) => s === 'rejected');
    state.overall = hasRejected ? 'done-with-errors' : 'done';
  }

  return {
    getState() {
      return state;
    },

    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },

    startAnalysis() {
      const next = createInitialState();
      next.overall = 'loading';
      for (const k of QUESTION_KEYS) next.questions[k] = 'loading';
      setState(next);
    },

    markFulfilled(key, value) {
      if (state.questions[key] !== 'loading') {
        throw new Error(`非法状态转换：${key} 当前为 ${state.questions[key]}`);
      }
      const next = {
        ...state,
        questions: { ...state.questions, [key]: 'fulfilled' },
        results: { ...state.results, [key]: value },
        errors: { ...state.errors, [key]: null },
      };
      state = next;
      recomputeOverall();
      notify();
    },

    markRejected(key, err) {
      if (state.questions[key] !== 'loading') {
        throw new Error(`非法状态转换：${key} 当前为 ${state.questions[key]}`);
      }
      const next = {
        ...state,
        questions: { ...state.questions, [key]: 'rejected' },
        errors: { ...state.errors, [key]: err },
      };
      state = next;
      recomputeOverall();
      notify();
    },

    retryQuestion(key) {
      const next = {
        ...state,
        questions: { ...state.questions, [key]: 'loading' },
        errors: { ...state.errors, [key]: null },
      };
      state = next;
      state.overall = 'loading';
      notify();
    },

    reset() {
      setState(createInitialState());
    },
  };
}

export { QUESTION_KEYS };
