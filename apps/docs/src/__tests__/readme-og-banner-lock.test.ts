import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Regression lock: every published package README's brand banner must point at
 * an OG image that actually exists in apps/docs/public/images/.
 *
 * The README URL and the generated PNG filename are produced independently (the
 * README footer is hand-maintained inside the INTERLACE:BRAND_FOOTER markers,
 * the PNG comes from apps/docs/scripts/og-packages.mjs), so a slug rename in
 * either one silently 404s on npm — where the README is baked at publish time
 * and can only be fixed by republishing the package.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const PACKAGES_DIR = path.join(REPO_ROOT, 'packages');
const IMAGES_DIR = path.join(REPO_ROOT, 'apps/docs/public/images');

/** Literal, not composed from a constant — keeps secure-coding/detect-non-literal-regexp quiet. */
const BANNER_RE =
  /https:\/\/serverless\.interlace\.tools\/images\/(og-[a-z0-9-]+\.png)/g;

type Manifest = { name: string; private?: boolean };

/** Published packages only — private workspaces never reach an npm README. */
function publishedPackages() {
  const out: { root: string; pkg: Manifest }[] = [];

  for (const entry of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    // `entry.name` comes from readdirSync of a fixed in-repo path, never an archive entry.
    // eslint-disable-next-line node-security/no-zip-slip -- false positive: not archive input
    const root = path.join(PACKAGES_DIR, entry.name);
    const manifestPath = path.join(root, 'package.json');
    if (!existsSync(manifestPath)) continue;

    const pkg = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
    if (pkg.private === true) continue;

    out.push({ root, pkg });
  }

  return out;
}

describe('published README OG banners', () => {
  const published = publishedPackages();

  it('finds the published packages (guards against a broken glob)', () => {
    expect(published.length).toBeGreaterThan(0);
  });

  it.each(published)(
    '$pkg.name banner image exists on disk',
    ({ root, pkg }) => {
      const readmePath = path.join(root, 'README.md');
      expect(existsSync(readmePath), `${pkg.name} has no README.md`).toBe(true);

      const readme = readFileSync(readmePath, 'utf8');
      const files = [...readme.matchAll(BANNER_RE)].map((m) => m[1]);

      // Every published package carries exactly one banner. A package with zero
      // is the regression this lock exists to catch.
      expect(files, `${pkg.name} README has no OG banner`).toHaveLength(1);
      expect(
        existsSync(path.join(IMAGES_DIR, files[0])),
        `${pkg.name} banner references ${files[0]}, which is not in apps/docs/public/images/`,
      ).toBe(true);
    },
  );
});
