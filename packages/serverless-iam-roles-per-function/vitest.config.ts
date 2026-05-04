import { defineConfig } from 'vitest/config';

/**
 * Coverage thresholds — same @interlace ecosystem standard as the caching plugin.
 * Functions: 100%. Lines/Statements: ≥ 90%. Branches: ≥ 85%.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/framework.ts'],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 100,
        branches: 85,
      },
    },
  },
});
