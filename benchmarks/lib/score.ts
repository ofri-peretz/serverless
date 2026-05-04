/**
 * Scoring helpers for serverless plugin benchmarks.
 *
 * Each scoring dimension maps a per-competitor measurement to a normalized
 * score in [0, 1]. The composite score is a weighted average.
 *
 * Weights are intentionally documented here so the model is auditable —
 * anyone reading the published benchmark can see how each dimension is
 * weighed in the final ranking.
 */

export interface DimensionMetadata {
  weight: number;
  label: string;
  source?: string;
}

export const DIMENSIONS: Record<string, DimensionMetadata> = {
  lifecycleCorrectness: {
    weight: 0.25,
    label: 'Lifecycle Correctness',
    source: 'local source / live deploy',
  },
  cliSurface: { weight: 0.15, label: 'CLI Surface', source: 'local source' },
  typescriptCoverage: {
    weight: 0.15,
    label: 'TypeScript Coverage',
    source: 'npm registry',
  },
  bundleWeight: { weight: 0.1, label: 'Bundle Weight', source: 'npm registry' },
  hookCount: { weight: 0.1, label: 'Hook Coverage', source: 'local source' },
  maintenanceSignal: {
    weight: 0.15,
    label: 'Maintenance Signal',
    source: 'npm registry',
  },
  documentationQuality: {
    weight: 0.1,
    label: 'Documentation Quality',
    source: 'README scan',
  },
};

export type DimensionScores = Partial<
  Record<keyof typeof DIMENSIONS, number | null>
>;

export function compositeScore(perDimensionScores: DimensionScores): number {
  let total = 0;
  let weightSum = 0;
  for (const [key, score] of Object.entries(perDimensionScores)) {
    const dim = DIMENSIONS[key];
    if (!dim) continue;
    if (typeof score !== 'number' || Number.isNaN(score)) continue;
    total += score * dim.weight;
    weightSum += dim.weight;
  }
  return weightSum > 0 ? total / weightSum : 0;
}

/**
 * Normalize a raw count to [0, 1] using a simple ceiling cap.
 * Anything ≥ ceiling = 1.0; below scales linearly.
 */
export function normalizeCount(count: number, ceiling: number): number {
  if (ceiling <= 0) return 0;
  return Math.max(0, Math.min(1, count / ceiling));
}

/**
 * Inverse-normalize: lower is better (e.g. bundle size, dep count).
 * Best (lowest) seen value scores 1.0; worst scores 0.
 */
export function normalizeInverse(
  value: number,
  bestValue: number,
  worstValue: number,
): number {
  if (worstValue === bestValue) return 1;
  const range = worstValue - bestValue;
  const offset = value - bestValue;
  return Math.max(0, Math.min(1, 1 - offset / range));
}

/**
 * Days-since-last-publish to a maintenance score:
 *   0-90 days   → 1.0 (actively maintained)
 *   90-365 days → linear decline
 *   365+ days   → 0.0 (stale)
 */
export function maintenanceScoreFromDaysSincePublish(days: number): number {
  if (days <= 90) return 1;
  if (days >= 365) return 0;
  return 1 - (days - 90) / (365 - 90);
}

/**
 * Hook coverage score. Lifecycle + custom-command hooks counted together —
 * both reflect how deeply the plugin participates in the framework's
 * lifecycle.
 *
 * Ceiling = 8 (matches Interlace's full hook+command surface as of v1.0.0).
 * Anything ≥ 8 scores 1.0; below scales linearly.
 */
export function hookCountScore(count: number): number {
  return normalizeCount(count, 8);
}

/**
 * CLI surface score. Counts custom subcommands the plugin registers
 * (e.g. `sls caching flush` → 1 subcommand).
 *
 * Ceiling = 4 (matches Interlace's full CLI surface as of v1.0.0).
 */
export function cliSurfaceScore(count: number): number {
  return normalizeCount(count, 4);
}

/**
 * Documentation quality score. Combines:
 *   - presence of an Installation section (0.2)
 *   - presence of a Usage / Example section (0.2)
 *   - mentions TypeScript (0.2)
 *   - mentions lifecycle / cleanup / teardown (0.2)
 *   - normalized README length (≥200 lines = 1.0; below scales) (0.2)
 *
 * Capped at 1.0. Section presence is checked against `## ...install`,
 * `## ...usage`, etc. — see `readmeQuality()` in measure.ts.
 */
export interface ReadmeQualityInput {
  lines: number;
  hasInstallation: boolean;
  hasUsage: boolean;
  hasTypeScript: boolean;
  hasLifecycle: boolean;
}

export function documentationQualityScore(q: ReadmeQualityInput): number {
  const sections =
    (q.hasInstallation ? 0.2 : 0) +
    (q.hasUsage ? 0.2 : 0) +
    (q.hasTypeScript ? 0.2 : 0) +
    (q.hasLifecycle ? 0.2 : 0);
  const length = Math.min(q.lines / 200, 1) * 0.2;
  return Math.min(1, sections + length);
}

/**
 * Lifecycle Correctness combines two signals:
 *
 *   1. **Live E2E pass** (50%) — does the plugin's `sls remove` cleanup
 *      pass on real AWS? Sourced from the latest run under
 *      `packages/serverless-api-gateway-caching/scripts/e2e{,-community}/runs/`.
 *      Both plugins pass this today (CloudFormation handles cluster teardown
 *      in the full-stack-removal scenario for both).
 *
 *   2. **Structural ghost-billing prevention** (50%) — does the plugin
 *      register a `*:remove:*` hook and ship a safe-offboarding command?
 *      Backs the harder ghost-billing scenario (uninstall while keeping
 *      service) that CloudFormation can't help with — see
 *      `docs/ghost-billing-reproduction.md`. Static check from local
 *      source; does not require AWS.
 *
 * Promoting (2) from a structural proxy to a live measurement is tracked
 * as the `cleanup-uninstall-path` suite in
 * [evidence-plan.md](https://github.com/ofri-peretz/agents/blob/main/interlace/serverless/evidence-plan.md).
 */
export interface LifecycleCorrectnessInput {
  /** Did the latest live E2E run pass on real AWS? `null` if no run on file. */
  e2ePassed: boolean | null;
  /** Does the plugin source declare a `*:remove:*` lifecycle hook? */
  hasRemovePhaseHook: boolean;
  /** Does the plugin source declare a safe-offboarding CLI command? */
  hasSafeOffboardingCommand: boolean;
}

export function lifecycleCorrectnessScore(
  input: LifecycleCorrectnessInput,
): number | null {
  if (input.e2ePassed === null) return null;
  const e2eHalf = input.e2ePassed ? 0.5 : 0;
  const structuralHalf =
    (input.hasRemovePhaseHook ? 0.25 : 0) +
    (input.hasSafeOffboardingCommand ? 0.25 : 0);
  return Math.min(1, e2eHalf + structuralHalf);
}
