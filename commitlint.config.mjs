// @ts-check
/**
 * Commit messages: `<type>(<scope>): <subject>` — scope is required.
 *
 * ┌─ Types (alphabetical, same as @commitlint/config-conventional) ─────────────┐
 * │ build · chore · ci · docs · feat · fix · perf · refactor · revert ·      │
 * │ style · test                                                                │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Scopes — workspaces ────────────────────────────────────────────────────────┐
 * │ (dynamically populated from packages/ as plugins are added)                  │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Scopes — cross-cutting ─────────────────────────────────────────────────────┐
 * │ ci · deps · docs · monorepo · release                                        │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * Examples:
 *   feat(serverless-plugin-security): add cold-start guard rule
 *   fix(monorepo): resolve TypeScript path resolution
 *   docs(docs): update plugin authoring guide
 *   chore(monorepo): initial scaffold
 */

import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Same as `@commitlint/config-conventional` `type-enum`. */
const COMMIT_TYPES = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
];

/**
 * Dynamically discover workspace package names from packages/ directory.
 * This avoids hardcoding scopes and keeps them in sync with actual packages.
 */
function getPackageScopes() {
  const packagesDir = join(import.meta.dirname, 'packages');
  if (!existsSync(packagesDir)) return [];

  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name);
}

/** Workspace scopes (from packages/*). */
const WORKSPACE_SCOPES = getPackageScopes();

/** Cross-cutting scopes. */
const META_SCOPES = ['ci', 'deps', 'docs', 'monorepo', 'release'];

const ALLOWED = new Set([...WORKSPACE_SCOPES, ...META_SCOPES]);

const ALLOWED_SCOPES_SORTED = Array.from(ALLOWED).sort().join(', ');

/**
 * @param {{ scope?: string | null }} parsed
 * @returns {[boolean, string]}
 */
function scopeWorkspace(parsed) {
  const scope = parsed.scope;
  if (scope === null || scope === undefined || scope === '') {
    return [
      false,
      'add a scope, e.g. feat(serverless-plugin-security): … or chore(monorepo): … — see commitlint.config.mjs',
    ];
  }

  const parts = scope
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return [false, 'scope is empty after parsing'];
  }

  for (const p of parts) {
    if (!ALLOWED.has(p)) {
      return [false, `unknown scope "${p}". Allowed: ${ALLOWED_SCOPES_SORTED}`];
    }
  }

  return [true, ''];
}

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'scope-workspace': scopeWorkspace,
      },
    },
  ],
  rules: {
    'scope-empty': [0],
    'scope-workspace': [2, 'always'],
    'type-enum': [2, 'always', [...COMMIT_TYPES]],
    'header-max-length': [2, 'always', 120],
  },
};
