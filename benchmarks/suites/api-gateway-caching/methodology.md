# API Gateway Caching — Benchmark Methodology

> Reproducible competitive comparison of `@interlace/serverless-api-gateway-caching` against the community alternative. Output schema follows [agents/interlace/evidence-framework.md](https://github.com/ofri-peretz/agents/blob/main/interlace/evidence-framework.md).

## Scoring mode

`composite` — weighted-average across 7 dimensions. Composite suits this benchmark because plugin "quality" is multi-dimensional (correctness, types, maintenance, bundle, docs) — no single F1-style metric captures it. The 0-1 normalized form makes the table at-a-glance scannable without losing per-dimension nuance.

## Dimensions and weights

| Dimension                 | Weight |                     Source | Why it matters                                                                                                        |
| ------------------------- | ------ | -------------------------: | --------------------------------------------------------------------------------------------------------------------- |
| **Lifecycle Correctness** | 25%    | Local source / live deploy | Does `sls remove` clean up cache clusters? This is the highest-stakes claim — orphaned resources mean ghost AWS bills |
| **CLI Surface**           | 15%    |               Local source | Number of working `sls <plugin> <cmd>` subcommands users get for free                                                 |
| **TypeScript Coverage**   | 15%    |               npm registry | Ships `.d.ts`? Has strict types? Catches misconfigs at edit time                                                      |
| **Maintenance Signal**    | 15%    |               npm registry | Days since last publish + releases in last 12 months. Stale plugins are landmines                                     |
| **Bundle Weight**         | 10%    |               npm registry | Unpacked tarball size + transitive dep count. Lower = less attack surface, faster installs                            |
| **Hook Coverage**         | 10%    |               Local source | Number of Serverless Framework lifecycle hooks the plugin listens to. More hooks = more correctness opportunities     |
| **Documentation Quality** | 10%    |                README scan | Does the README cover Installation, Usage, TypeScript, Lifecycle?                                                     |

Weights sum to 100%. The split is intentional:

- **High weight on Lifecycle Correctness (25%)** because this is _the_ differentiating claim for this category. Plugins that don't clean up are the source of every "ghost billing" horror story.
- **Equal weight (15%) on TypeScript and Maintenance** because both directly impact whether a plugin is _adoptable_ in 2026, regardless of features.
- **Lowest weights (10%) on Bundle Weight and Hook Coverage and Docs** because they're refinements — important, but secondary to the headline claims.

## Score normalization

Scores are normalized to `[0, 1]` per dimension before weighting:

| Dimension             | Normalization                                                           |
| --------------------- | ----------------------------------------------------------------------- |
| Lifecycle Correctness | Binary: 0 (no cleanup hooks) or 1 (cleanup verified)                    |
| CLI Surface           | `count / 5` capped at 1.0 (5+ commands = full credit)                   |
| TypeScript Coverage   | Binary: 0 (no `.d.ts`) or 1 (`.d.ts` shipped)                           |
| Maintenance Signal    | `1.0` for ≤90 days since publish; linear decline to `0.0` at 365 days   |
| Bundle Weight         | Inverse linear: best (smallest) competitor scores 1.0, worst scores 0.0 |
| Hook Coverage         | `count / 8` capped at 1.0                                               |
| Documentation Quality | `(sections present) / 4`                                                |

The composite = `Σ(score × weight)` for all dimensions where score is non-null. Dimensions with null scores are excluded from both numerator and denominator (so partial measurements still produce a valid composite).

## Competitor selection

The comparison set is fixed per category. Adding a competitor requires:

1. Edit [`competitors.json`](competitors.json)
2. Document why this competitor matters (e.g., dominant npm downloads, official AWS plugin, etc.)
3. Re-run the benchmark; commit the new dated JSON

Competitors are NOT removed from the comparison set unless they're abandoned (no publishes in 24 months) — once you're in, you stay, so users see the historical trajectory.

## Sources of measurement

| Source                   | What we measure                                               | Caveats                                                                                  |
| ------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| npm registry packument   | Version, deps, types, last publish, total versions            | Reflects published state — a plugin's GitHub repo may have improvements not yet released |
| npm downloads API        | Weekly downloads                                              | Used for context (popularity ≠ quality) — does NOT enter the composite score             |
| Local source tree        | Hook coverage, CLI commands, lifecycle hooks listened to      | Requires the competitor's repo checked out next to ours; otherwise null                  |
| Live AWS deploy (future) | Lifecycle correctness verified via real deploy + remove cycle | Costs $; runs only manually or in weekly cron                                            |

## What this benchmark does NOT measure

- **Performance under load** (cache hit rates, latency) — out of scope; would need a separate `performance` benchmark
- **AWS cost efficiency** — depends on workload; not directly comparable across plugins
- **Compatibility with Serverless v4** — both we and competitor support v3+; explicit v4 testing is a future concern
- **Ergonomics** — subjective, not benchmarkable. Documented in qualitative comparison docs separately

## Reproducibility

```bash
cd serverless/packages/benchmarks
npm run bench
```

The runner is **dependency-free** (Node 20+ built-ins only). No AWS credentials needed. Network calls are limited to the public npm registry. Results land at `results/api-gateway-caching/YYYY-MM-DD.json` and `results/api-gateway-caching/latest.json` (latest is what docs import).

If a run produces different numbers on different days, the most likely causes (in order) are:

1. A competitor published a new version (check `installedVersions`)
2. npm registry returned different `dist.unpackedSize` (uncommon)
3. The `Days Since Publish` field is calendar-driven; will tick by 1 each day for stale plugins
