import { describe, it, expect } from 'vitest';
import { classifyError } from '../src/lib/error-classifier.js';

describe('错误分类器 error-classifier', () => {
  it('网络错误归类为 network，可重试', () => {
    const r = classifyError(new Error('network 请求失败：连接断开'));
    expect(r.kind).toBe('network');
    expect(r.retryable).toBe(true);
    expect(r.userMessage).toBeTruthy();
  });

  it('fetch 直接抛出的 TypeError 归类为 network', () => {
    const r = classifyError(new TypeError('Failed to fetch'));
    expect(r.kind).toBe('network');
    expect(r.retryable).toBe(true);
  });

  it('超时错误归类为 timeout，可重试', () => {
    const r = classifyError(new Error('请求超时（30000ms）'));
    expect(r.kind).toBe('timeout');
    expect(r.retryable).toBe(true);
  });

  it('AbortError 归类为 timeout，可重试', () => {
    const e = new Error('The operation was aborted');
    e.name = 'AbortError';
    const r = classifyError(e);
    expect(r.kind).toBe('timeout');
    expect(r.retryable).toBe(true);
  });

  it('401 错误归类为 auth，不可重试', () => {
    const r = classifyError(new Error('AI 请求失败 401：invalid api key'));
    expect(r.kind).toBe('auth');
    expect(r.retryable).toBe(false);
    expect(r.userMessage).toMatch(/Key|密钥|授权/);
  });

  it('403 错误归类为 auth，不可重试', () => {
    const r = classifyError(new Error('AI 请求失败 403：forbidden'));
    expect(r.kind).toBe('auth');
    expect(r.retryable).toBe(false);
  });

  it('429 错误归类为 rate_limit，不可重试', () => {
    const r = classifyError(new Error('AI 请求失败 429：too many requests'));
    expect(r.kind).toBe('rate_limit');
    expect(r.retryable).toBe(false);
  });

  it('配额用尽（中转 429）归类为 quota_exhausted', () => {
    const r = classifyError(new Error('AI 请求失败 429：今日免费体验配额已用完'));
    expect(r.kind).toBe('quota_exhausted');
    expect(r.retryable).toBe(false);
    expect(r.userMessage).toMatch(/配额|额度|次数/);
  });

  it('500 错误归类为 server，可重试', () => {
    const r = classifyError(new Error('AI 请求失败 500：internal error'));
    expect(r.kind).toBe('server');
    expect(r.retryable).toBe(true);
  });

  it('502 错误归类为 server，可重试', () => {
    const r = classifyError(new Error('AI 请求失败 502：bad gateway'));
    expect(r.kind).toBe('server');
    expect(r.retryable).toBe(true);
  });

  it('503 错误归类为 server，可重试', () => {
    const r = classifyError(new Error('AI 请求失败 503：service unavailable'));
    expect(r.kind).toBe('server');
    expect(r.retryable).toBe(true);
  });

  it('响应解析失败归类为 parse，不可重试', () => {
    const r = classifyError(new Error('AI 响应解析失败：缺少 choices'));
    expect(r.kind).toBe('parse');
    expect(r.retryable).toBe(false);
  });

  it('未知错误归类为 unknown', () => {
    const r = classifyError(new Error('什么鬼错误'));
    expect(r.kind).toBe('unknown');
    expect(r.retryable).toBe(false);
  });

  it('字符串错误也能分类', () => {
    const r = classifyError('network 请求失败：连接断开');
    expect(r.kind).toBe('network');
  });

  it('null/undefined 归类为 unknown', () => {
    expect(classifyError(null).kind).toBe('unknown');
    expect(classifyError(undefined).kind).toBe('unknown');
  });

  it('返回原始 error 引用，便于上层重新抛出', () => {
    const e = new Error('AI 请求失败 500');
    const r = classifyError(e);
    expect(r.originalError).toBe(e);
  });

  it('401 错误的 userMessage 引导重新配置 Key', () => {
    const r = classifyError(new Error('AI 请求失败 401'));
    expect(r.userMessage).toMatch(/设置|Key|密钥/);
  });

  it('quota_exhausted 的 userMessage 引导切换自有 Key', () => {
    const r = classifyError(new Error('AI 请求失败 429：配额已用完'));
    expect(r.userMessage).toMatch(/自有\s*Key|切换|设置/);
  });

  it('400 错误归类为 bad_request，不可重试', () => {
    const r = classifyError(new Error('AI 请求失败 400：bad request'));
    expect(r.kind).toBe('bad_request');
    expect(r.retryable).toBe(false);
  });
});
