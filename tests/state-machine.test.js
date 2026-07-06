import { describe, it, expect } from 'vitest';
import { createAnalysisStateMachine, QUESTION_KEYS } from '../src/lib/state-machine.js';

describe('createAnalysisStateMachine', () => {
  it('初始状态：三问均为 idle，整体状态 idle', () => {
    const sm = createAnalysisStateMachine();
    const state = sm.getState();
    expect(state.overall).toBe('idle');
    for (const key of QUESTION_KEYS) {
      expect(state.questions[key]).toBe('idle');
    }
  });

  it('startAnalysis 后三问变为 loading', () => {
    const sm = createAnalysisStateMachine();
    sm.startAnalysis();
    const state = sm.getState();
    expect(state.overall).toBe('loading');
    for (const key of QUESTION_KEYS) {
      expect(state.questions[key]).toBe('loading');
    }
  });

  it('单问完成（fulfilled）不影响其他两问', () => {
    const sm = createAnalysisStateMachine();
    sm.startAnalysis();
    sm.markFulfilled('positioning', '回答一');
    const state = sm.getState();
    expect(state.questions.positioning).toBe('fulfilled');
    expect(state.results.positioning).toBe('回答一');
    expect(state.questions.monetization).toBe('loading');
    expect(state.questions.traffic).toBe('loading');
    expect(state.overall).toBe('loading');
  });

  it('单问失败（rejected）不影响其他两问', () => {
    const sm = createAnalysisStateMachine();
    sm.startAnalysis();
    sm.markRejected('monetization', new Error('失败'));
    const state = sm.getState();
    expect(state.questions.monetization).toBe('rejected');
    expect(state.errors.monetization).toBeInstanceOf(Error);
    expect(state.questions.positioning).toBe('loading');
    expect(state.overall).toBe('loading');
  });

  it('三问全部 fulfilled 后整体状态为 done', () => {
    const sm = createAnalysisStateMachine();
    sm.startAnalysis();
    sm.markFulfilled('positioning', '一');
    sm.markFulfilled('monetization', '二');
    sm.markFulfilled('traffic', '三');
    const state = sm.getState();
    expect(state.overall).toBe('done');
  });

  it('含失败项时整体状态为 done-with-errors', () => {
    const sm = createAnalysisStateMachine();
    sm.startAnalysis();
    sm.markFulfilled('positioning', '一');
    sm.markRejected('monetization', new Error('失败'));
    sm.markFulfilled('traffic', '三');
    const state = sm.getState();
    expect(state.overall).toBe('done-with-errors');
  });

  it('reset 回到初始状态', () => {
    const sm = createAnalysisStateMachine();
    sm.startAnalysis();
    sm.markFulfilled('positioning', '一');
    sm.reset();
    const state = sm.getState();
    expect(state.overall).toBe('idle');
    expect(state.questions.positioning).toBe('idle');
    expect(state.results.positioning).toBeNull();
  });

  it('单问重试：将该问重置为 loading', () => {
    const sm = createAnalysisStateMachine();
    sm.startAnalysis();
    sm.markRejected('monetization', new Error('失败'));
    sm.retryQuestion('monetization');
    const state = sm.getState();
    expect(state.questions.monetization).toBe('loading');
    expect(state.errors.monetization).toBeNull();
    // 整体状态回到 loading
    expect(state.overall).toBe('loading');
  });

  it('状态变更触发订阅回调', () => {
    const sm = createAnalysisStateMachine();
    const calls = [];
    sm.subscribe((state) => calls.push(state.overall));
    sm.startAnalysis();
    sm.markFulfilled('positioning', '一');
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0]).toBe('loading');
  });

  it('在 idle 状态调用 markFulfilled 抛错（状态非法）', () => {
    const sm = createAnalysisStateMachine();
    expect(() => sm.markFulfilled('positioning', 'x')).toThrow();
  });
});
