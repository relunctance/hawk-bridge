import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/utils/**', 'src/store/**'],
      exclude: ['src/hooks/**'], // hook 测试依赖外部服务，走集成
    },
  },
});
