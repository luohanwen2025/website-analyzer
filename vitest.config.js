import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    // Windows 下 29 个 jsdom 并行实例化会耗尽资源，导致全量 npm test 报
    // "No test suite found"（每文件环境加载失败、describe 未注册）。串行稳定（289/289，~107s）。
    fileParallelism: false,
  },
});
