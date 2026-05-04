# Claims Registry — `@interlace/serverless`

> Every marketing claim in this repo's docs and home page is mapped here to its evidence file. Format mandated by the [Interlace Evidence Framework](../agents/interlace/evidence-framework.md).
>
> If a claim doesn't have a row, it can't ship in the docs. If "Last verified" is older than 90 days, the claim is **stale** and gets a "verification pending" banner in docs until refreshed.
>
> **Companion doc:** [`docs/community-plugin-comparison.md`](docs/community-plugin-comparison.md) — full feature-by-feature comparison vs the community `serverless-api-gateway-caching@1.11.0`, with line-numbered source citations for every row. Read it before adding any "vs the community plugin" copy to docs.

## Verified claims

These appear today in `apps/docs/src/app/(home)/page.tsx` and are backed by the API Gateway Caching benchmark.

### Static-evidence claims (npm registry + composite score)

| Claim (as it appears in docs/marketing)                         | Suite                                           | Latest result                                                               | Last verified |
| --------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- | ------------- |
| "TypeScript-native — full IntelliSense for every config option" | api-gateway-caching (TypeScript Coverage = 1.0) | [latest.json](benchmarks/benchmark-results/api-gateway-caching/latest.json) | 2026-05-04    |
| "Zero runtime dependencies"                                     | api-gateway-caching (direct deps = 0)           | [latest.json](benchmarks/benchmark-results/api-gateway-caching/latest.json) | 2026-05-04    |
| "Actively maintained" (implicit in maintenance score)           | api-gateway-caching (Maintenance Signal = 1.0)  | [latest.json](benchmarks/benchmark-results/api-gateway-caching/latest.json) | 2026-05-04    |
| "Composite score 88% vs community 30% (7 of 7 dimensions)"      | api-gateway-caching (composite ranking)         | [latest.json](benchmarks/benchmark-results/api-gateway-caching/latest.json) | 2026-05-04    |

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
| "Safe offboarding — `sls caching disable` tears down AWS resources" | Steps 9–11 (disable → remove → verify clean)                               | 2026-05-03            |
| "No ghost billing on plugin uninstall" (vs community)               | Manual reproduction (see scenario table below)                             | 2026-05-03            |

The "pending first release" marker is replaced with a date the first time `npm run e2e` passes against the to-be-released `dist/`. From that point forward, each release commits a `verified-on: YYYY-MM-DD` line to update this column.

### Ghost billing — what's measured

The "no ghost billing" claim is **scenario-specific**. Two distinct removal paths produce different outcomes; only one of them is the ghost-billing scenario.

| Scenario                                                                      | Community plugin                                                                                                                                                                                                                                                 | This plugin                                                                                 | Ghost billing?           |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------ |
| **`sls remove`** (full stack deletion)                                        | Clean (CloudFormation tears down stage and cluster) — measured 2026-05-04 in [community E2E](packages/serverless-api-gateway-caching/scripts/e2e-community/runs/2026-05-04T00-15-49-community-interlace-cache-e2e-community-qg8hlm.json), 31s exit 0, no orphans | Clean (`before:remove:remove` hook pre-disables for defense-in-depth) — measured 2026-05-03 | ❌ Neither plugin        |
| **Plugin uninstall** (remove from `plugins:`, redeploy, keep service running) | Cluster keeps running indefinitely — no remove-phase hook fires; CloudFormation never knew about the cluster (managed via `UpdateStage` API, not CFN)                                                                                                            | Run `sls caching disable` first → cluster stops → safe to uninstall                         | ✅ Community plugin only |

Manual reproduction recipe: [docs/ghost-billing-reproduction.md](docs/ghost-billing-reproduction.md) — uses `apps/playground-stack-community/` and reproduces the trap in ~10 minutes for ~$0.005.

The `sls remove` measurement we ran on 2026-05-04 was useful for what it ruled out: it confirmed AWS CloudFormation handles cache-cluster teardown for both plugins in the happy-path full-stack-removal case. So earlier marketing copy that implied "we fix `sls remove`'s ghost-billing bug" was wrong — there is no `sls remove` ghost-billing bug. The bug lives in the **plugin-uninstall-while-keeping-service** path, where our `sls caching disable` is the actual fix.

Future automation: `cleanup-uninstall-path` E2E suite would deploy with the community plugin, then redeploy with the plugin removed, then poll AWS for the orphaned cluster. Tracked in [agents/interlace/serverless/evidence-plan.md](../agents/interlace/serverless/evidence-plan.md).

## Re-scoped claims (measurement narrowed the scope)

The 2026-05-04 community E2E narrowed the ghost-billing claim to the precise scenario where it actually applies. The claim itself is still true; earlier copy implied the wrong scenario.

| Original copy                                                                                                                                         | What we measured                                                                     | What's true                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Cleanup on removal — cache clusters disabled before stack deletion. No more ghost billing from orphaned resources." (home page card, pre-2026-05-04) | Community plugin's `sls remove` is clean — 31s exit 0, stack/stage/REST API all gone | "Safe offboarding — `sls caching disable` stops the cluster before you remove the plugin" — true scenario is plugin-uninstall, not `sls remove`. CFN handles cluster teardown for the full-stack-removal case in both plugins |
| "Fixes the community plugin's `sls remove` ghost-billing bug"                                                                                         | No bug exists in `sls remove` for the community plugin — both plugins clean up       | "Adds a defense-in-depth `before:remove:remove` hook + the missing `sls caching disable` command" — defensible because neither exists in the community plugin                                                                 |

The structural fact remains: the community plugin has only 3 hooks (`before:package:initialize`, `before:package:finalize`, `after:deploy:deploy`) and no remove-phase hook or custom commands. That's a real architectural gap and our defense-in-depth hook + safe-offboarding command are real features. But the **consequence** earlier copy asserted (ghost billing on `sls remove`) was the wrong consequence — see scenario table above for the right one.

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
2. Commit the new dated JSON in `benchmarks/benchmark-results/<suite>/<YYYY-MM-DD>_v<version>/`.
3. Bump the "Last verified" date in this table.
4. If a number changed (we won, we lost, scores moved), update the docs copy to match — never let docs and benchmarks disagree.

## Refusing claims

The repo policy (per evidence framework) is: **claims without rows here are not allowed in docs.** When tempted to add unbacked copy, route the instinct into a row in "Pending claims" instead and queue the suite that would back it.
