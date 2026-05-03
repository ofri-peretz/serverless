import { defineConfig } from 'vitest/config';

/**
 * Coverage thresholds — fail the build if quality regresses.
 *
 * Devkit ships type definitions and identity-style runtime helpers
 * (`defineConfig`, `defineFunction`, compat helpers). Every exported function
 * MUST have a unit test; lines/statements stay at 100% because the surface
 * is small and there's no excuse for un-tested code paths.
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
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 100,
      },
    },
  },
});
