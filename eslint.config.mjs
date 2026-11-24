import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import reactA11y from 'eslint-plugin-react-a11y';
import reactFeatures from 'eslint-plugin-react-features';
// Interlace ecosystem — à-la-carte (each plugin's own `recommended`), NOT the
// @interlace/eslint-config meta-config.
// The security plugins are secure-coding, node-security, lambda-security and
// browser-security; the quality plugins are conventions, import-next,
// reliability, modularity, modernization, maintainability and operability.
// maintainability/operability/lambda-security were SKIPPED on 2026-06-20 due to
// dogfooding bugs (doubled namespace + :exit crash). Fixed and republished in
// 3.0.4/3.0.6/1.2.4 respectively (eslint repo release #203, 2026-06-21).
import { configs as secureCodingCfg } from 'eslint-plugin-secure-coding';
import { configs as nodeSecurityCfg } from 'eslint-plugin-node-security';
import { configs as lambdaSecurityCfg } from 'eslint-plugin-lambda-security';
import { configs as conventionsCfg } from 'eslint-plugin-conventions';
import { configs as importNextCfg } from 'eslint-plugin-import-next';
import { configs as reliabilityCfg } from 'eslint-plugin-reliability';
import { configs as modularityCfg } from 'eslint-plugin-modularity';
import { configs as modernizationCfg } from 'eslint-plugin-modernization';
import { configs as maintainabilityCfg } from 'eslint-plugin-maintainability';
import { configs as operabilityCfg } from 'eslint-plugin-operability';
// The docs site is the one surface that ships to a browser (added 2026-11-17).
import { configs as browserSecurityCfg } from 'eslint-plugin-browser-security';
// Test integrity (burgee packages/truepass): focused, unexplained-skip, fixed-sleep and retried tests.
import { configs as truepass } from 'truepass/eslint';

/**
 * @interlace ecosystem ESLint config — strict for published-package source,
 * relaxed for tests and tooling.
 *
 * Tiers:
 *   1. Repo-wide baseline   (TypeScript recommended + Prettier compat)
 *   2. TS-only rules        (unused vars, type imports)
 *   3. Published-package src (no `any`, no `console`, explicit return types
 *      for exported APIs, prefer-readonly, exhaustive switch, etc.)
 *   4. Test files           (allow `any`, allow non-null assertions, looser)
 *   5. Tooling              (config files, scripts: allow `any`, skip strict)
 */
export default [
  // ────────────────────────────────────────────────────────────────────────
  // 0. Ignore generated/vendor paths
  // ────────────────────────────────────────────────────────────────────────
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/.next/**',
      'apps/docs/.source/**',
      // Auto-generated docs baseline — owned by agents repo, do not lint here.
      // Edits to baseline files happen in the source-of-truth at
      // ofriperetz.dev/agents/apps/interlace-docs-baseline/. See
      // memory/project_docs_baseline.md for the sync model.
      'apps/docs/.interlace/**',
      // Out-of-source upstream clones (read-only reference)
      'oos/**',
      // oxlint JS-plugin shims — CJS tooling, legit `require()`.
      'tools/oxlint-plugins/**',
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // 1. Baseline — TypeScript recommended + Prettier compatibility
  // ────────────────────────────────────────────────────────────────────────
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 1b. Interlace dogfooding — à-la-carte recommended presets (see the import
  //     block for which plugins are wired vs skipped, and why). The react
  //     preset is omitted — react-features `recommended` uses categorized rule
  //     names flat-config can't resolve; tier 7 hand-wires it.
  // ────────────────────────────────────────────────────────────────────────
  secureCodingCfg.recommended,
  nodeSecurityCfg.recommended,
  lambdaSecurityCfg.recommended,
  conventionsCfg.recommended,
  importNextCfg.recommended,
  reliabilityCfg.recommended,
  modularityCfg.recommended,
  modernizationCfg.recommended,
  maintainabilityCfg.recommended,
  operabilityCfg.recommended,
  {
    ...browserSecurityCfg.recommended,
    files: ['apps/docs/**/*.{ts,tsx}'],
  },

  // ────────────────────────────────────────────────────────────────────────
  // 2. TypeScript-only rules across the repo
  // ────────────────────────────────────────────────────────────────────────
  {
    files: ['**/*.ts', '**/*.mts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-unused-vars': 'off',
      // Force `import type` for type-only imports — needed for build emit
      // (Vite's dts plugin trips when value imports are used for types only).
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      // Prefer `as const` over let bindings for literal-only data.
      '@typescript-eslint/prefer-as-const': 'error',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 3. Published-package source — strict
  // Applies to packages/*/src/** (excluding test files, handled in tier 4).
  // ────────────────────────────────────────────────────────────────────────
  {
    files: ['packages/*/src/**/*.ts'],
    ignores: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.spec.ts'],
    rules: {
      // No `any` in published code — we ship .d.ts files; users see these types
      '@typescript-eslint/no-explicit-any': 'error',
      // No console in published src — plugins should log via the framework's
      // CLI (`serverless.cli.log`) so users get consistent output formatting
      'no-console': 'error',
      // Stop accidental string concat that's nicer as template literal
      'prefer-template': 'error',
      // Ban `let` when a value is never reassigned
      'prefer-const': 'error',
      // Ban implicit boolean coercion of `null`/`undefined` in conditions
      // (subtle correctness wins, especially for endpoint config defaults)
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 4. Test files — relaxed
  // ────────────────────────────────────────────────────────────────────────
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 4b. Test integrity — truepass at error over every test file and runner
  //     config: a focused test, a skip with no reason, a fixed sleep, a retry.
  //     Findings that predate it sit in eslint-suppressions.json, a per-file
  //     count ESLint enforces: a new finding fails, a fixed one fails until
  //     `npx eslint . --prune-suppressions` drops it, so the counts only go down.
  //     `truepass diff` runs on pre-push (lefthook.yml). Locked by
  //     packages/serverless-devkit/src/truepass-adoption.lock.test.ts.
  // ────────────────────────────────────────────────────────────────────────
  {
    ...truepass.recommended,
    files: [
      '**/*.test.{ts,tsx,mts,cts,mjs,js}',
      '**/*.spec.{ts,tsx,mts,cts,mjs,js}',
      '**/vitest.config.{ts,mts,mjs,js}',
      '**/vitest.*.config.{ts,mts,mjs,js}',
      '**/playwright.config.ts',
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // 5. Plain JS / config / tooling — looser
  // ────────────────────────────────────────────────────────────────────────
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    rules: {
      'no-unused-vars': 'error',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 6. Cross-language conventions (unicorn)
  // ────────────────────────────────────────────────────────────────────────
  {
    files: ['**/*.ts', '**/*.mts', '**/*.js', '**/*.mjs', '**/*.cjs'],
    plugins: {
      unicorn: eslintPluginUnicorn,
    },
    rules: {
      // node:fs > fs — explicit Node import scheme
      'unicorn/prefer-node-protocol': 'error',
      // Catch the common monkey-patching footgun (this is what the community
      // serverless-api-gateway-caching plugin did with `String.prototype.replaceAll`).
      // Lives in ESLint core, not the unicorn plugin.
      'no-extend-native': 'error',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 7. React surfaces — accessibility + features (TSX only)
  //
  //    react-a11y:     WCAG 2.1 A/AA — Level A violations as errors,
  //                    AA/AAA as warnings. Spread the recommended preset
  //                    (it embeds its own plugins:{} map).
  //    react-features: Core React correctness + security rules
  //                    (jsx-key, jsx-no-target-blank, hooks-exhaustive-deps …).
  //                    The published recommended config uses categorized rule
  //                    names (react/jsx-key) that ESLint 9 flat-config cannot
  //                    resolve, so we register the plugin under "react-features"
  //                    and spell out the flat-name equivalents explicitly.
  // ────────────────────────────────────────────────────────────────────────
  {
    ...reactA11y.configs.recommended,
    files: ['**/*.tsx'],
  },
  {
    files: ['**/*.tsx'],
    plugins: {
      'react-features': reactFeatures,
    },
    rules: {
      // Core correctness
      'react-features/jsx-key': 'error',
      'react-features/no-children-prop': 'warn',
      'react-features/no-danger': 'warn',
      'react-features/no-string-refs': 'error',
      // Downgraded to warn: this codebase uses Framer Motion / animation libs
      // whose custom prop names (initial, animate, exit, whileHover …) are
      // flagged as unknown DOM properties without type-awareness context.
      'react-features/no-unknown-property': 'warn',
      'react-features/hooks-exhaustive-deps': 'warn',
      // Security
      'react-features/jsx-no-target-blank': 'error',
      'react-features/jsx-no-script-url': 'error',
      'react-features/jsx-no-duplicate-props': 'error',
      'react-features/no-danger-with-children': 'error',
      'react-features/no-deprecated': 'warn',
      // Performance
      'react-features/no-unnecessary-rerenders': 'warn',
      'react-features/react-render-optimization': 'warn',
    },
  },

  // ────────────────────────────────────────────────────────────────────────
  // 8. Interlace first-run baseline — non-blocking.
  //    Pre-existing findings stay at `warn` so PRs aren't blocked; ratchet each
  //    to `error` as the codebase is cleaned. See agents memory
  //    eslint-dogfooding-doctrine ("baseline-then-ratchet").
  // ────────────────────────────────────────────────────────────────────────
  {
    rules: {
      // Error-level interlace rules that fire on this codebase, kept at `warn`
      // for the first-run baseline (ratchet to error as cleaned):
      //  - network calls in build-time utils (~101 hits)
      'modularity/no-external-api-calls-in-utils': 'warn',
      //  - ESM extensionful-import resolver noise (~93 hits), not a real backlog
      'import-next/no-unresolved': 'warn',
      //  - a handful of real security/reliability finds — surface, don't block
      //    (no-ssrf: ratcheted to error 2026-11-17, 0 hits on node-security 6.0.4)
      'node-security/no-ssrf': 'error',
      'reliability/require-network-timeout': 'warn',
      // New from 2026-06-21 — maintainability/operability/lambda-security added
      // after their published-build bugs were fixed (3.0.4/3.0.6/1.2.4):
      //  - console.log IS CloudWatch logging in Lambda plugins — keep at warn
      'operability/no-console-log': 'warn',
      'operability/no-debug-code-in-production': 'warn',
      //  - maintainability backlog (~19 hits) — ratchet file-by-file
      'maintainability/cognitive-complexity': 'warn',
      'maintainability/identical-functions': 'warn',
      'maintainability/max-parameters': 'warn',
      //  - lambda-security: ratcheted to error 2026-11-17. Its 27 hits were the
      //    26 no-error-swallowing + 1 no-exposed-debug-endpoints on 1.2.5; the gate
      //    fix in ofri-peretz/eslint#1150 shipped since, and 3.0.2 reports 0 here.
      'lambda-security/no-error-swallowing': 'error',
      'lambda-security/no-exposed-debug-endpoints': 'error',
      // The rule reads only the nearest package.json. Test and build tooling is declared
      // once, in the root manifest, and hoisted; `@/` is the docs app's tsconfig path alias,
      // not a package (FP ofri-peretz/eslint#1551).
      'import-next/no-extraneous-dependencies': [
        'warn',
        {
          allowPatterns: ['^@/'],
          ignore: ['vitest', 'vite', 'vite-plugin-dts'],
        },
      ],
    },
  },
];
