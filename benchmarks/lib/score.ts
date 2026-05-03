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
