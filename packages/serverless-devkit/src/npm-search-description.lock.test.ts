/**
 * Lock: every published description opens with the words people type into npm search.
 *
 * npm search does no stemming and rewards the query's words being adjacent, so
 * "Per-function IAM roles for Serverless Framework" ranked >250 for "serverless iam"
 * while the exact phrase ranks. The opening (before " — ") must start "Serverless ".
 *
 * Proven by restoring the old "Per-function IAM roles for …" opening: this fails.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

const published = readdirSync(join(ROOT, 'packages'))
  .filter((dir) => existsSync(join(ROOT, 'packages', dir, 'package.json')))
  .map(
    (dir) =>
      JSON.parse(
        readFileSync(join(ROOT, 'packages', dir, 'package.json'), 'utf8'),
      ) as {
        name: string;
        private?: boolean;
        description?: string;
      },
  )
  .filter((pkg) => pkg.private !== true);

describe('published descriptions open with the search phrase', () => {
  it('finds the published packages', () => {
    expect(published.length).toBeGreaterThan(0);
  });

  it.each(published)('$name', ({ description }) => {
    const opening = (description ?? '').split(' — ')[0];
    expect(opening).toMatch(/^Serverless /);
  });
});
