import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // happy-dom：轻量 DOM，替代 jsdom。Windows 下 jsdom×29 实例化间歇性耗尽内存/句柄，
    // 导致全量 "No test suite found"（fileParallelism + node 内存 flag 均未根治）。
    // happy-dom 实例化快/省内存，可并发，根治。
    environment: 'happy-dom',
    include: ['tests/**/*.test.js'],
  },
});
