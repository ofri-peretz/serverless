/**
 * @interlace/serverless benchmark — API Gateway Caching
 *
 * Static-metrics comparison of @interlace/serverless-api-gateway-caching
 * against the community alternative. Output is saved as dated JSON to
 * `benchmark-results/api-gateway-caching/<YYYY-MM-DD>_v<version>/result.json`
 * (and refreshed `latest.json`) and printed as a human-readable table.
 *
 * Runtime measurements (deploy/invoke cycles) are out of scope here —
 * this runner is reproducible without AWS credentials.
 *
 * Usage:
 *   npm run bench
 *   npx tsx suites/api-gateway-caching/run.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchNpmPackument,
  fetchWeeklyDownloads,
  daysSinceLatestPublish,
  directDependencyCount,
  shipsTypes,
  latestVersion,
  totalVersionsPublished,
  versionsInLastYear,
  unpackedSizeKB,
  readLocalPackument,
  type Packument,
} from '../../lib/measure.ts';
import {
  DIMENSIONS,
  compositeScore,
  normalizeInverse,
  maintenanceScoreFromDaysSincePublish,
  type DimensionScores,
} from '../../lib/score.ts';

interface CompetitorConfig {
  name: string;
  package: string;
  githubRepo?: string;
  githubPath?: string;
  localSource?: string;
  isOurs?: boolean;
}

interface CompetitorMeasurements {
  source: 'npm' | 'local';
  version: string | null;
  daysSincePublish: number;
  directDeps: number;
  shipsTypes: boolean;
  totalVersions: number | null;
  versionsLastYear: number | null;
  unpackedKB: number | null;
  weeklyDownloads: number;
}

type CompetitorResult =
  | (CompetitorConfig & { skipped: true })
  | (CompetitorConfig & {
      skipped?: false;
      measurements: CompetitorMeasurements;
      dimensionScores?: DimensionScores;
      composite?: number;
    });

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMPETITORS_PATH = join(__dirname, 'competitors.json');
const RESULTS_DIR = resolve(
  __dirname,
  '..',
  '..',
  'benchmark-results',
  'api-gateway-caching',
);

const competitors = (
  JSON.parse(readFileSync(COMPETITORS_PATH, 'utf-8')) as {
    competitors: CompetitorConfig[];
  }
).competitors;

console.log('\n🏟️  Interlace Serverless Benchmark — API Gateway Caching\n');
console.log(`Date: ${new Date().toISOString().slice(0, 10)}`);
console.log(`Competitors: ${competitors.length}\n`);

const results: CompetitorResult[] = [];

for (const competitor of competitors) {
  console.log(`📦 ${competitor.name} (${competitor.package})`);

  let packument: Packument | null = null;
  let source: 'npm' | 'local' = 'npm';
  try {
    packument = await fetchNpmPackument(competitor.package);
  } catch {
    if (competitor.localSource) {
      const localDir = resolve(__dirname, competitor.localSource);
      packument = readLocalPackument(localDir);
      if (packument) {
        source = 'local';
        console.log(
          `   📁 Using local source (package not on npm yet): ${localDir}`,
        );
      }
    }
    if (!packument) {
      console.log(`   ⚠️  Not on npm and no local source. Skipping.\n`);
      results.push({ ...competitor, skipped: true });
      continue;
    }
  }

  const weeklyDownloads =
    source === 'npm' ? await fetchWeeklyDownloads(competitor.package) : 0;
  const measurements: CompetitorMeasurements = {
    source,
    version: latestVersion(packument),
    daysSincePublish: source === 'npm' ? daysSinceLatestPublish(packument) : 0,
    directDeps: directDependencyCount(packument),
    shipsTypes: shipsTypes(packument),
    totalVersions: source === 'npm' ? totalVersionsPublished(packument) : null,
    versionsLastYear: source === 'npm' ? versionsInLastYear(packument) : null,
    unpackedKB: unpackedSizeKB(packument),
    weeklyDownloads,
  };

  console.log(
    `   v${measurements.version} | ${measurements.directDeps} deps | ${measurements.unpackedKB ?? '?'}KB | ` +
      `${measurements.weeklyDownloads.toLocaleString()} dl/wk | ` +
      `${measurements.versionsLastYear} releases (12mo) | ` +
      `${measurements.daysSincePublish}d since last publish | ` +
      `types: ${measurements.shipsTypes ? '✓' : '✗'}\n`,
  );

  results.push({ ...competitor, measurements });
}

const validResults = results.filter(
  (
    r,
  ): r is Extract<CompetitorResult, { measurements: CompetitorMeasurements }> =>
    !r.skipped,
);

const bestSize = Math.min(
  ...validResults.map(
    (r) => r.measurements.unpackedKB ?? Number.POSITIVE_INFINITY,
  ),
);
const worstSize = Math.max(
  ...validResults.map((r) => r.measurements.unpackedKB ?? 0),
);

for (const r of validResults) {
  const m = r.measurements;
  r.dimensionScores = {
    typescriptCoverage: m.shipsTypes ? 1 : 0,
    bundleWeight: normalizeInverse(
      m.unpackedKB ?? worstSize,
      bestSize,
      worstSize,
    ),
    maintenanceSignal: maintenanceScoreFromDaysSincePublish(m.daysSincePublish),
  };
  r.composite = compositeScore(r.dimensionScores);
}

validResults.sort((a, b) => (b.composite ?? 0) - (a.composite ?? 0));

console.log(
  '==========================================================================================',
);
console.log('📋 ECOSYSTEM COMPARISON SUMMARY');
console.log(
  '==========================================================================================\n',
);
console.log(
  '| Rank | Plugin       | Version | Deps | Size (KB) | Releases/yr | Days Since | Types | Composite |',
);
console.log(
  '|------|--------------|---------|------|-----------|-------------|------------|-------|-----------|',
);
for (const [i, r] of validResults.entries()) {
  const m = r.measurements;
  console.log(
    `| ${(i + 1).toString().padEnd(4)} | ${r.name.padEnd(12)} | ` +
      `${(m.version ?? '?').padEnd(7)} | ${m.directDeps.toString().padEnd(4)} | ` +
      `${(m.unpackedKB ?? '?').toString().padEnd(9)} | ` +
      `${(m.versionsLastYear ?? '—').toString().padEnd(11)} | ` +
      `${(m.daysSincePublish ?? '—').toString().padEnd(10)} | ` +
      `${(m.shipsTypes ? '✓' : '✗').padEnd(5)} | ` +
      `${((r.composite ?? 0) * 100).toFixed(1)}%${' '.repeat(4)} |`,
  );
}
console.log('');

// ─── Build payload aligned with agents/interlace/evidence-framework.md schema ───

function pluginId(r: CompetitorConfig): string {
  return r.isOurs
    ? 'interlace'
    : (r.package ?? r.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

const METHODOLOGY_VERSION = 'v1.0';
const now = new Date();
const today = now.toISOString().slice(0, 10);
const runDir = join(RESULTS_DIR, `${today}_${METHODOLOGY_VERSION}`);
mkdirSync(runDir, { recursive: true });
const outputPath = join(runDir, 'result.json');
const latestPath = join(RESULTS_DIR, 'latest.json');

const installedVersions = Object.fromEntries(
  validResults.map((r) => [r.package, r.measurements.version ?? 'unknown']),
);

const plugins = Object.fromEntries(
  validResults.map((r) => [
    pluginId(r),
    {
      displayName: r.name,
      version: r.measurements.version,
      isOurs: Boolean(r.isOurs),
      package: r.package,
      measurements: r.measurements,
      dimensionScores: r.dimensionScores,
      composite: r.composite,
    },
  ]),
);

const ranked = validResults.map(pluginId);

const payload = {
  schemaVersion: 1,
  timestamp: now.toISOString(),
  benchmark: 'api-gateway-caching',
  benchmarkType: 'composite' as const,
  scoringMode: 'composite' as const,
  category: 'API Gateway Caching',
  environment: {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  },
  installedVersions,
  methodology: {
    approach: 'Static metrics from npm registry',
    description:
      'Each competitor is measured across 7 weighted dimensions sourced from its npm registry packument and (when available) local source. Dimensions requiring AWS deployment (lifecycleCorrectness, hookCount, cliSurface) are reported as null when not measurable here — they will be filled in by the cleanup-correctness suite once it lands.',
    dimensions: DIMENSIONS,
  },
  plugins,
  summary: {
    winner: ranked[0] ?? null,
    rankBy: 'composite' as const,
    ranked,
  },
  skipped: results.filter((r): r is CompetitorConfig & { skipped: true } =>
    Boolean(r.skipped),
  ),
};

writeFileSync(outputPath, JSON.stringify(payload, null, 2));
writeFileSync(latestPath, JSON.stringify(payload, null, 2));
console.log(`✅ Results saved to: ${outputPath}`);
console.log(`📌 latest.json updated for stable doc imports.\n`);
