/**
 * Lock: every published plugin ships a CommonJS entry.
 *
 * The Serverless Framework loads plugins with `require`, so a package whose
 * `require` condition is missing, or whose build stops emitting `cjs`, installs
 * cleanly and then fails to load in every consumer's `serverless.yml`. AGENTS.md
 * used to carry this as "output stays CommonJS"; this test holds it now.
 *
 * Proven by deleting one package's `exports["."].require`: this fails.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

const published = readdirSync(join(ROOT, 'packages'))
  .filter((dir) => existsSync(join(ROOT, 'packages', dir, 'package.json')))
  .map((dir) => ({
    dir,
    pkg: JSON.parse(
      readFileSync(join(ROOT, 'packages', dir, 'package.json'), 'utf8'),
    ) as {
      name: string;
      private?: boolean;
      main?: string;
      exports?: Record<string, { require?: string }>;
    },
  }))
  .filter(({ pkg }) => pkg.private !== true);

describe('every published plugin can be required', () => {
  it('finds the published packages', () => {
    expect(published.length).toBeGreaterThan(0);
  });

  it.each(published)('$pkg.name', ({ dir, pkg }) => {
    expect(pkg.main, 'main must be the .cjs build').toMatch(/\.cjs$/);
    expect(
      pkg.exports?.['.']?.require,
      'exports["."].require must be the .cjs build',
    ).toMatch(/\.cjs$/);
    const vite = readFileSync(
      join(ROOT, 'packages', dir, 'vite.config.ts'),
      'utf8',
    );
    expect(vite, 'vite must build the cjs format').toMatch(/['"]cjs['"]/);
  });
});
