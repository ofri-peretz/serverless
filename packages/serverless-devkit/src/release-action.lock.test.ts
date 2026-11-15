/**
 * Lock: the release workflow's changesets/action matches the Changesets CLI major.
 *
 * changesets/action v2 refuses Changesets CLI v2 ("use Changesets action v1 instead").
 * A Dependabot bump to v2 failed every Release run from 2026-11-06 to 2026-11-15,
 * so nothing published. Action v1 pairs with CLI v2; action v2 with CLI v3.
 *
 * Proven by setting release.yml back to `changesets/action@v2`: this fails.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));

it('changesets/action major matches the Changesets CLI major', () => {
  const workflow = readFileSync(
    join(ROOT, '.github/workflows/release.yml'),
    'utf8',
  );
  const action = /changesets\/action@(?:v(\d+)|\S+ # v(\d+))/.exec(workflow);
  const actionMajor = Number(action?.[1] ?? action?.[2]);
  const cli = (
    JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      devDependencies: Record<string, string>;
    }
  ).devDependencies['@changesets/cli'];
  const cliMajor = Number(/\d+/.exec(cli)?.[0]);

  expect(actionMajor).toBe(cliMajor - 1);
});
