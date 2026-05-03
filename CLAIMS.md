# Claims Registry — `@interlace/serverless`

> Every marketing claim in this repo's docs and home page is mapped here to its evidence file. Format mandated by the [Interlace Evidence Framework](../agents/interlace/evidence-framework.md).
>
> If a claim doesn't have a row, it can't ship in the docs. If "Last verified" is older than 90 days, the claim is **stale** and gets a "verification pending" banner in docs until refreshed.

## Verified claims

These appear today in `apps/docs/src/app/(home)/page.tsx` and are backed by the API Gateway Caching benchmark.

### Static-evidence claims (npm registry + composite score)

| Claim (as it appears in docs/marketing)                           | Suite                                           | Latest result                                                              | Last verified |
| ----------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- | ------------- |
| "TypeScript-native — full IntelliSense for every config option"   | api-gateway-caching (TypeScript Coverage = 1.0) | [latest.json](packages/benchmarks/results/api-gateway-caching/latest.json) | 2026-05-03    |
| "Zero runtime dependencies"                                       | api-gateway-caching (direct deps = 0)           | [latest.json](packages/benchmarks/results/api-gateway-caching/latest.json) | 2026-05-03    |
| "Actively maintained" (implicit in maintenance score)             | api-gateway-caching (Maintenance Signal = 1.0)  | [latest.json](packages/benchmarks/results/api-gateway-caching/latest.json) | 2026-05-03    |
| "Composite score 75% vs community 25%" — overall quality position | api-gateway-caching (composite ranking)         | [latest.json](packages/benchmarks/results/api-gateway-caching/latest.json) | 2026-05-03    |

### Live-evidence claims (E2E — verified each release)

These are backed by [`scripts/e2e/run.ts`](packages/serverless-api-gateway-caching/scripts/e2e/run.ts) which deploys real AWS resources, exercises the claim, then tears down. Run via `npm run e2e` from the plugin directory before tagging a release.

Per-run telemetry (deploy time, cluster-create timing, full status history, failures + fixes) is auto-captured to [`scripts/e2e/runs/`](packages/serverless-api-gateway-caching/scripts/e2e/runs/). Synthesized patterns + AWS timing calibration in [`scripts/e2e/LEARNINGS.md`](packages/serverless-api-gateway-caching/scripts/e2e/LEARNINGS.md).

| Claim (as it appears in docs/marketing)                             | E2E step                                                                   | Last release verified |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------- |
| "Cache MISS on first request, HIT within TTL"                       | Steps 4–5 (request → assert fresh; second request → assert identical body) | 2026-05-03            |
| "`sls caching status` reports cluster state"                        | Steps 6, 9 (parse `Enabled:` line)                                         | 2026-05-03            |
| "`sls caching flush` invalidates the cache"                         | Step 7–8 (flush → next request returns fresh body)                         | 2026-05-03            |
| "`sls caching disable` is the safe-offboarding command"             | Step 9 (disable → status confirms `Enabled: false`)                        | 2026-05-03            |
| "Cleanup on removal — cache cluster disabled before stack deletion" | Steps 9–10 (disable → remove → exit 0)                                     | 2026-05-03            |
| "No more ghost billing from orphaned resources"                     | Step 11 (CloudFormation reports stack absent or `DELETE_COMPLETE`)         | 2026-05-03            |
| "Safe offboarding — `sls caching disable` tears down AWS resources" | Steps 9–11 (disable → remove → verify clean)                               | 2026-05-03            |

The "pending first release" marker is replaced with a date the first time `npm run e2e` passes against the to-be-released `dist/`. From that point forward, each release commits a `verified-on: YYYY-MM-DD` line to update this column.

## Pending claims (no live verification yet)

| Claim                                                                     | Required suite / verification                                                       | Status                                                                                         |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| "Jittered backoff prevents thundering herd during concurrent deployments" | `backoff-distribution` (statistical / property-based)                               | Not started — see [evidence-plan.md suite #5](../agents/interlace/serverless/evidence-plan.md) |
| "Zero prototype pollution"                                                | `prototype-safety` (eats own dog food via `@interlace/eslint-plugin-secure-coding`) | Not started — see [evidence-plan.md suite #4](../agents/interlace/serverless/evidence-plan.md) |

## How to add a new claim

1. **Don't write the marketing copy first.** Build (or extend) the benchmark first; ensure it produces a measurable result for our plugin and at least one competitor.
2. Add a row to "Verified claims" above with: claim text, suite name, latest result link, today's date.
3. Add the marketing copy to docs / home page.
4. (Recommended) cross-link from the docs page to the benchmark result so curious readers can audit.

## How to refresh a claim

1. Re-run the benchmark: `npm run bench:caching` (or whichever suite).
2. Commit the new dated JSON in `packages/benchmarks/results/<suite>/`.
3. Bump the "Last verified" date in this table.
4. If a number changed (we won, we lost, scores moved), update the docs copy to match — never let docs and benchmarks disagree.

## Refusing claims

The repo policy (per evidence framework) is: **claims without rows here are not allowed in docs.** When tempted to add unbacked copy, route the instinct into a row in "Pending claims" instead and queue the suite that would back it.
