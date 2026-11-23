/**
 * Guidance placement: CLAUDE.md, AGENTS.md, skills and subagents, linted by
 * eslint-plugin-conventions' `guidance` preset on @eslint/markdown.
 *
 * It is its own config because the JS presets in eslint.config.mjs carry no
 * `files` and would run their rules on Markdown. `npm run lint:guidance` runs
 * it, and `ci:lint` runs that. Every rule is at error; findings that predate
 * it live in .guidance-suppressions.json, which may only shrink
 * (`npm run lint:guidance -- --prune-suppressions` after a fix).
 */
import markdown from '@eslint/markdown';
import { configs as conventions } from 'eslint-plugin-conventions';

const { guidance } = conventions;

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.turbo/**',
    ],
  },
  { plugins: { markdown } },
  {
    ...guidance,
    rules: Object.fromEntries(
      Object.keys(guidance.rules).map((rule) => [rule, 'error']),
    ),
  },
];
