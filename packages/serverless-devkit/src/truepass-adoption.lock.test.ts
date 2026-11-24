/**
 * Lock: this repo runs truepass (burgee packages/truepass) on its own tests.
 *
 * Three pieces: the four `truepass.recommended` rules at error over every test
 * file and runner config, ESLint's suppressions file holding truepass findings
 * only (a ratchet that cannot hide another rule), and `truepass diff` as a
 * pre-push step. Each assertion below goes red if one of them is unwired.
 *
 * Proven by deleting the `...truepass.recommended` block, then the lefthook
 * `truepass-diff` step: each fails here.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

type Suppressions = Record<string, Record<string, { count: number }>>;

describe('truepass is adopted', () => {
  it('is a root devDependency at 1.x or later', () => {
    const pkg = JSON.parse(read('package.json')) as {
      devDependencies: Record<string, string>;
    };
    expect(pkg.devDependencies['truepass']).toMatch(/^\^?[1-9]\d*\./);
  });

  it('the lint config turns on truepass.recommended over test files', () => {
    const config = read('eslint.config.mjs');
    expect(config).toContain(
      "import { configs as truepass } from 'truepass/eslint';",
    );
    expect(config).toMatch(
      /\.\.\.truepass\.recommended,\s*\n\s*files: \[\s*\n\s*'\*\*\/\*\.test\.\{ts,tsx,mts,cts,mjs,js\}',/,
    );
  });

  it('CI lints the whole repo with that config', () => {
    const scripts = (
      JSON.parse(read('package.json')) as { scripts: Record<string, string> }
    ).scripts;
    expect(scripts['ci:lint']).toMatch(/^eslint \. /);
  });

  it('the suppressions file holds truepass findings only, so it cannot hide another rule', () => {
    const file = 'eslint-suppressions.json';
    const suppressions: Suppressions = existsSync(join(ROOT, file))
      ? (JSON.parse(read(file)) as Suppressions)
      : {};
    const rules = Object.values(suppressions).flatMap((byRule) =>
      Object.keys(byRule),
    );
    expect(rules.filter((rule) => !rule.startsWith('truepass/'))).toEqual([]);
  });

  it('pre-push runs truepass diff against origin/main', () => {
    expect(read('lefthook.yml')).toMatch(
      /^pre-push:\n {2}commands:\n(?: {4}.*\n)* {4}truepass-diff:\n(?: {6}.*\n)* {6}run: npx truepass diff --base origin\/main$/m,
    );
  });
});
