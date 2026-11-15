/**
 * Lock: every published package in this repo points npm at its own folder here.
 *
 * npm's "Repository" link, provenance checks and tools that open a package's
 * source all read `repository.url` + `repository.directory`. A copied manifest
 * that keeps another package's directory sends readers to the wrong code.
 *
 * Proven by changing one package's `repository.directory`: this fails.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..', '..', '..');
const REPO = 'https://github.com/ofri-peretz/serverless';

const published = readdirSync(join(ROOT, 'packages'))
  .filter((dir) => existsSync(join(ROOT, 'packages', dir, 'package.json')))
  .map((dir) => ({
    dir,
    pkg: JSON.parse(
      readFileSync(join(ROOT, 'packages', dir, 'package.json'), 'utf8'),
    ) as {
      name: string;
      private?: boolean;
      repository?: unknown;
      bugs?: { url?: string };
      homepage?: string;
    },
  }))
  .filter(({ pkg }) => pkg.private !== true);

describe('published packages point npm at their own folder', () => {
  it('finds the published packages', () => {
    expect(published.length).toBeGreaterThan(0);
  });

  it.each(published)('$pkg.name', ({ dir, pkg }) => {
    expect(pkg.repository).toEqual({
      type: 'git',
      url: `git+${REPO}.git`,
      directory: `packages/${dir}`,
    });
    expect(pkg.bugs?.url).toBe(`${REPO}/issues`);
    expect(pkg.homepage).toMatch(/^https:\/\//);
  });
});
