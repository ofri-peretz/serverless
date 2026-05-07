/**
 * Per-dimension measurement helpers. Each function takes a fetched npm
 * package payload (or a local source tree) and returns a raw measurement.
 *
 * Stays free of AWS-cred-requiring concerns — all measurements are static
 * (npm registry data + tarball inspection + local source grep).
 */

import { execSync } from 'node:child_process';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** A simplified shape of an npm packument. We only type the fields we read. */
export interface Packument {
  'dist-tags'?: Record<string, string>;
  versions?: Record<string, PackumentManifest>;
  time?: Record<string, string>;
  _local?: boolean;
}

export interface PackumentManifest {
  version?: string;
  dependencies?: Record<string, string>;
  types?: string;
  typings?: string;
  exports?: Record<string, { types?: string } | string>;
  dist?: { unpackedSize?: number };
}

export async function fetchNpmPackument(
  packageName: string,
): Promise<Packument> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName).replace('%40', '@')}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`npm registry returned ${res.status} for ${packageName}`);
  }
  return res.json() as Promise<Packument>;
}

export async function fetchWeeklyDownloads(
  packageName: string,
): Promise<number> {
  const url = `https://api.npmjs.org/downloads/point/last-week/${packageName}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return 0;
    const data = (await res.json()) as { downloads?: number };
    return data.downloads ?? 0;
  } catch {
    return 0;
  }
}

export function daysSinceLatestPublish(packument: Packument): number {
  const latest = packument['dist-tags']?.latest;
  if (!latest) return Number.POSITIVE_INFINITY;
  const time = packument.time?.[latest];
  if (!time) return Number.POSITIVE_INFINITY;
  const publishedAt = new Date(time).getTime();
  return Math.floor((Date.now() - publishedAt) / (1000 * 60 * 60 * 24));
}

export function directDependencyCount(packument: Packument): number {
  const latest = packument['dist-tags']?.latest;
  if (!latest) return 0;
  const manifest = packument.versions?.[latest];
  if (!manifest) return 0;
  return Object.keys(manifest.dependencies ?? {}).length;
}

/**
 * Read a local package's package.json and synthesize a packument-shaped
 * object so the same measurement helpers work for unpublished packages.
 */
export function readLocalPackument(localSourceDir: string): Packument | null {
  let manifest: PackumentManifest & { version?: string };
  try {
    const manifestPath = join(localSourceDir, 'package.json');
    manifest = JSON.parse(
      readFileSync(manifestPath, 'utf-8'),
    ) as PackumentManifest;
  } catch {
    return null;
  }

  const version = manifest.version ?? '0.0.0';
  const today = new Date().toISOString();

  // Best-effort tarball size estimate from dist/
  let unpackedSize = 0;
  try {
    const distPath = join(localSourceDir, 'dist');
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        const st = statSync(p);
        if (st.isFile()) unpackedSize += st.size;
        else if (st.isDirectory()) walk(p);
      }
    };
    walk(distPath);
  } catch {
    // dist/ may not exist if the package isn't built — leave size at 0
  }

  return {
    'dist-tags': { latest: version },
    versions: {
      [version]: { ...manifest, dist: { unpackedSize } },
    },
    time: { [version]: today, modified: today },
    _local: true,
  };
}

export function shipsTypes(packument: Packument): boolean {
  const latest = packument['dist-tags']?.latest;
  if (!latest) return false;
  const manifest = packument.versions?.[latest];
  if (!manifest) return false;
  const exportRoot = manifest.exports?.['.'];
  const exportTypes =
    typeof exportRoot === 'object' && exportRoot !== null
      ? exportRoot.types
      : undefined;
  return Boolean(manifest.types ?? manifest.typings ?? exportTypes);
}

export function latestVersion(packument: Packument): string | null {
  return packument['dist-tags']?.latest ?? null;
}

export function totalVersionsPublished(packument: Packument): number {
  return Object.keys(packument.versions ?? {}).length;
}

export function versionsInLastYear(packument: Packument): number {
  const yearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  let count = 0;
  for (const [version, time] of Object.entries(packument.time ?? {})) {
    if (version === 'created' || version === 'modified') continue;
    if (new Date(time).getTime() >= yearAgo) count++;
  }
  return count;
}

export function unpackedSizeKB(packument: Packument): number | null {
  const latest = packument['dist-tags']?.latest;
  if (!latest) return null;
  const manifest = packument.versions?.[latest];
  const size = manifest?.dist?.unpackedSize;
  if (typeof size !== 'number') return null;
  return Math.round(size / 1024);
}

/**
 * Count Serverless Framework lifecycle hooks listened to in a local source
 * tree. Greps for `'foo:bar:baz':` patterns inside src/.
 */
export function countHooksInLocalSource(sourceDir: string): number {
  try {
    const grep = execSync(
      `grep -rEoh "['\\"][a-z]+:[a-z:]+['\\"]\\s*:" "${sourceDir}/src" 2>/dev/null | sort -u | wc -l`,
      { encoding: 'utf-8' },
    );
    return Number.parseInt(grep.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Count custom Serverless Framework subcommands declared in a local source
 * tree. Counts occurrences of `lifecycleEvents:` — every subcommand declares
 * exactly one. This avoids brittle multi-line regex parsing of the nested
 * `commands: { foo: { commands: { ... } } }` structure.
 *
 * For the community plugin (no custom commands) → 0.
 * For the Interlace plugin (`flush`, `status`, `disable`, `preview`) → 4.
 */
export function countCliCommands(sourceDir: string): number {
  try {
    const out = execSync(
      `grep -rEoh "lifecycleEvents\\s*:" "${sourceDir}/src" 2>/dev/null | wc -l`,
      { encoding: 'utf-8' },
    );
    return Number.parseInt(out.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

export interface ReadmeQuality {
  lines: number;
  hasInstallation: boolean;
  hasUsage: boolean;
  hasTypeScript: boolean;
  hasLifecycle: boolean;
}

export function readmeQuality(readmePath: string): ReadmeQuality | null {
  try {
    const content = readFileSync(readmePath, 'utf-8');
    return {
      lines: content.split('\n').length,
      hasInstallation: /## .*?install/i.test(content),
      hasUsage: /## .*?usage/i.test(content) || /## .*?example/i.test(content),
      hasTypeScript: /typescript/i.test(content),
      hasLifecycle: /lifecycle|cleanup|teardown|remove/i.test(content),
    };
  } catch {
    return null;
  }
}

/**
 * Read the latest E2E run JSON from a runs directory and report whether the
 * run passed end-to-end. Used to score the live half of the
 * `lifecycleCorrectness` dimension.
 *
 * Run JSON shape (current schemaVersion):
 *   { status: 'passed' | 'failed' | ..., verdict?: { cleanRemoval?: boolean }, ... }
 *
 * Returns `null` when the directory is missing or empty — caller should
 * surface that as `lifecycleCorrectness: null` (excluded from composite),
 * not as a `0`.
 */
export function readLatestE2eVerdict(
  runsDir: string,
): { passed: boolean; runFile: string } | null {
  let entries: string[];
  try {
    entries = readdirSync(runsDir).filter((f) => f.endsWith('.json'));
  } catch {
    return null;
  }
  if (entries.length === 0) return null;

  // Filenames are ISO-prefixed (e.g. `2026-05-04T00-15-49-…json`), so a plain
  // string sort is chronological.
  entries.sort();
  const latest = entries.at(-1);
  if (!latest) return null;

  try {
    const content = readFileSync(join(runsDir, latest), 'utf-8');
    const data = JSON.parse(content) as {
      status?: string;
      verdict?: { cleanRemoval?: boolean };
    };
    const passed =
      data.status === 'passed' || data.verdict?.cleanRemoval === true;
    return { passed, runFile: latest };
  } catch {
    return null;
  }
}

/**
 * Detect whether a plugin source tree registers a Serverless Framework
 * `*:remove:*` lifecycle hook (e.g. `before:remove:remove`). This is the
 * structural prerequisite for defense-in-depth cleanup before stack
 * deletion — without it, a plugin can't run cleanup logic during
 * `sls remove`.
 */
export function hasRemovePhaseHook(sourceDir: string): boolean {
  try {
    const out = execSync(
      `grep -rEoh "['\\"][a-z]+:remove:[a-z]+['\\"]" "${sourceDir}/src" 2>/dev/null | wc -l`,
      { encoding: 'utf-8' },
    );
    return Number.parseInt(out.trim(), 10) > 0;
  } catch {
    return false;
  }
}

/**
 * Detect whether a plugin source tree declares a safe-offboarding CLI
 * command — i.e. one named `disable`, `cleanup`, `teardown`, `offboard`,
 * or `remove`. Heuristic match on the command-key form
 * `<name>: { ... lifecycleEvents: ['<name>'] }` inside `this.commands`.
 *
 * For the Interlace plugin (`disable:` exists) → true.
 * For the community plugin (no commands) → false.
 */
export function hasSafeOffboardingCommand(sourceDir: string): boolean {
  try {
    const out = execSync(
      `grep -rEoh "(disable|cleanup|teardown|offboard|remove)\\s*:\\s*\\{" "${sourceDir}/src" 2>/dev/null | wc -l`,
      { encoding: 'utf-8' },
    );
    return Number.parseInt(out.trim(), 10) > 0;
  } catch {
    return false;
  }
}
