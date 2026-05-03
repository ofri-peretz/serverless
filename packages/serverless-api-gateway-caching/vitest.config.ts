import { defineConfig } from 'vitest/config';

/**
 * Coverage thresholds — fail the build if quality regresses.
 *
 * @interlace ecosystem DX standard for published packages:
 * - Functions: 100% (every exported and internal helper must be reached)
 * - Lines / Statements: ≥ 90%
 * - Branches: ≥ 85% (relaxed from 90% because v8's branch counter penalizes
 *   single-line ternaries used for env-default fallbacks)
 *
 * If you legitimately can't hit a threshold for a code path, prefer to add a
 * test rather than lower the bar. Lowering thresholds requires a comment
 * justifying the relaxation.
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
