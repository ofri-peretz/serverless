# E2E Learnings

> Each E2E run is paid AWS data. This file synthesizes what we've learned across iterations — bugs found, AWS timing observations, common CloudFormation/APIGW issues — so the next run starts smarter.
>
> Per-run JSON logs in [`runs/`](./runs). Each new run produces a dated entry automatically (orchestrator writes via `persistRunLog()`).

## Bugs found and fixed (chronological)

| #   | Run                                                                                        | Step                       | Symptom                                                                                                                                                                                     | Root cause                                                                                                                                                                                                                                            | Fix                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [2026-05-03T20:29:00 / qcdz7o](./runs/2026-05-03T20-29-00-interlace-cache-e2e-qcdz7o.json) | 4 (Cache MISS)             | Lambda returns 502                                                                                                                                                                          | `handler.ts` deployed as-is to nodejs20.x. Lambda runtime executes JS only — no TS transpiler in deploy package                                                                                                                                       | Renamed fixture handler to `.js` (CommonJS). Runtime entry points are an explicit exception to the "TS everywhere" rule because Lambda doesn't transpile                                                                                                                                                                                                |
| 2   | [2026-05-03T20:50:00 / qcjbkx](./runs/2026-05-03T20-50-00-interlace-cache-e2e-qcjbkx.json) | 5 (Cache HIT)              | Both requests get fresh `generatedAt`                                                                                                                                                       | Two compounding bugs: (a) no wait for cluster `AVAILABLE` before MISS; (b) `Cache-Control: no-cache` header bypassed cache                                                                                                                            | (a) Added `waitForCacheClusterReady()` polling APIGateway.getStage every 15s up to 6 min; (b) removed the header from `getEndpoint()`                                                                                                                                                                                                                   |
| 3   | [2026-05-03T21:10:00 / qcz5hr](./runs/2026-05-03T21-10-00-interlace-cache-e2e-qcz5hr.json) | 5 (Cache HIT)              | Cluster `AVAILABLE` after 238s, MISS passes, HIT still gets fresh body                                                                                                                      | APIGW takes additional ~30-90s AFTER cluster `AVAILABLE` to propagate per-method cache config. Static 2.5s wait insufficient                                                                                                                          | Replaced fixed delay with retry loop: poll every 5s for up to 60s until cached body returns. Tighter success path, clearer failure                                                                                                                                                                                                                      |
| 4   | [2026-05-03T23:20:39 / qe9c53](./runs/2026-05-03T23-20-39-interlace-cache-e2e-qe9c53.json) | 5 (Cache HIT)              | All 13 retry attempts returned different `generatedAt` until attempts 9-13 returned the same `266034` — cache eventually started serving but with a LATER Lambda response, not the MISS one | Test was checking against MISS timestamp, but APIGW caches whatever response is current AFTER propagation finishes (~40s window). Plus our TTL=60s means cached entries naturally expire mid-test. The MISS response wasn't even ELIGIBLE for caching | Restructured assertion: cache is HITTING when **two consecutive responses share the same `generatedAt`**, regardless of whether it matches the MISS. This proves the cache layer is intercepting and serving stored responses                                                                                                                           |
| 5   | [2026-05-03T23:20:39 / qe9c53](./runs/2026-05-03T23-20-39-interlace-cache-e2e-qe9c53.json) | 7 (flush) + 8 (post-flush) | Step 7 emitted no plugin logs (silent bail suspicion); step 8 timed out at 30s with cached value unchanged                                                                                  | Two issues stacked: (a) orchestrator's `run()` helper suppressed flush stdout/stderr so we couldn't see whether the plugin actually ran; (b) post-flush window (30s) was tighter than APIGW's flush propagation latency (~35s observed)               | (a) Switched flush invocation to `runStreaming` so plugin logs surface (now shows `[interlace-caching] Flushing stage cache… Cache flushed successfully.`); (b) bumped post-flush wait to 18 attempts × 5s = 90s (past natural TTL of 60s, so a missing flush won't get masked by TTL expiry); (c) added missing `--stage e2e` flag to flush invocation |
| ✅  | [2026-05-03T23:32:06 / qeo2ui](./runs/2026-05-03T23-32-06-interlace-cache-e2e-qeo2ui.json) | **all 11**                 | E2E PASSED end-to-end (542s, 9 min)                                                                                                                                                         | After 5 iterations the orchestrator and the plugin's full claim surface are both verified live                                                                                                                                                        | First green run — locks in the 2026-05-03 verified date for [CLAIMS.md](../../../../CLAIMS.md) live-evidence rows                                                                                                                                                                                                                                       |

## AWS timing — what to expect

Calibrated from 5 runs against `us-east-1` (4 failed iterations + 1 green run). Use as planning ranges, not contracts. The green run JSON ([2026-05-03T23-32-06-…qeo2ui.json](./runs/2026-05-03T23-32-06-interlace-cache-e2e-qeo2ui.json)) is the canonical reference.

| Operation                                                                   | Observed range                                   | Green run                         | What we record                                                   |
| --------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------- |
| `sls deploy` (CloudFormation + initial APIGW config)                        | **100-165s**                                     | 130s                              | `awsObservations.deployDurationSec`                              |
| Cache cluster `CREATE_IN_PROGRESS` → `AVAILABLE`                            | **178-301s** (~3-5 min)                          | 245s                              | `awsObservations.cacheClusterCreateSec` + 16-step status history |
| Per-method cache config propagation (post-AVAILABLE → cache starts serving) | **~30-90s** (AWS does not document this)         | 45s                               | retry-loop attempts in `testCacheHit`                            |
| Cache MISS response time (cold Lambda)                                      | **743-1102ms**                                   | 807ms                             | `notable.cacheMissResponseTimeMs`                                |
| Cache HIT response time (served from edge)                                  | **146-170ms**                                    | 146ms (**5.5x faster than MISS**) | `notable.cacheHitResponseTimeMs`                                 |
| `sls caching flush` propagation (command exit → cache invalidated)          | **~35s**                                         | 35s                               | `notable.flushPropagationSec`                                    |
| `sls caching disable` (cluster → `DELETE_IN_PROGRESS`)                      | **~5s** (instant API call, async cluster delete) | <5s                               | (visible in step 9 status)                                       |
| `sls remove` (cluster pre-disabled by plugin)                               | **24-30s**                                       | 28s                               | `awsObservations.removeDurationSec`                              |
| Plugin's `before:remove:remove` cleanup hook                                | **<5s**                                          | <5s                               | logs `Cache cluster disabled. Stack removal can proceed.`        |

**End-to-end ballpark:** **~9-12 minutes per green run.** Cost: ~$0.05 per run (cache cluster 0.5GB × ~7-8 min). Free-tier covers Lambda + APIGW request volume at this scale.

### Insight: cache HIT latency vs MISS latency

The 5.5x latency improvement (807ms → 146ms) is the headline number proving the cache is doing its job. APIGW's cache layer serves from the edge without invoking Lambda — that's the whole point. Future E2E runs should **always** see HIT << MISS; if they don't, the cache isn't actually serving (likely a propagation/config issue, not a cluster issue).

### Insight: APIGW cache populates from "current state" at propagation time, not from the first request

After cluster `AVAILABLE`, APIGW takes ~30-90s to start caching responses. During that window, every request goes fresh to Lambda. Once caching activates, it locks in **whatever response is current at that moment** — NOT the first request that came in. So a test that asserts "cached body == first request body" will fail; the correct assertion is "two consecutive responses are identical."

### Insight: TTL doesn't restart on cache hit

Our config uses `ttlInSeconds: 60`. The TTL is from cache-store time, not last-access time. A cached entry stored at T=45s expires at T=105s regardless of how many hits it serves. Long retry loops may straddle TTL boundaries and see the cache "re-populate" with a new response.

### Insight: AWS console `cacheClusterStatus` matches APIGW.getStage output

Watching the AWS console during a run confirmed the orchestrator's poll output: `CREATE_IN_PROGRESS` (~4 min), then `AVAILABLE`, then on disable `DELETE_IN_PROGRESS`. The plugin's `sls caching status` command reads the same field; sources of truth are aligned.

## How to invoke

Quick reference for running this E2E.

|                       | Where                                              | Why                                                                                                                                               |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS profile           | `AWS_PROFILE=interlace`                            | IAM user `interlace-cli` in account `346133547796`. Profile defined in `~/.aws/config`. Override per-run: `AWS_PROFILE=other-profile npm run e2e` |
| AWS region            | `AWS_REGION=us-east-1`                             | Default. Plugin works in any APIGW region. Other regions may have different cluster pricing                                                       |
| Serverless v4 license | `SERVERLESS_ACCESS_KEY=...` in `agents/.env.local` | Loaded by orchestrator's `loadDotEnvLocal()`. Only required if you bump the fixture to sls v4. Today's fixture pins v3 (no license needed)        |
| Plugin built          | run `npm run e2e` (auto-builds first)              | Or `tsx scripts/e2e/run.ts` directly if `dist/` is current                                                                                        |

`.env.local` precedence (later wins):

1. `agents/.env.local` (cross-product cruise-control secrets — lowest precedence)
2. `serverless/.env.local` (monorepo-wide)
3. `serverless/packages/serverless-api-gateway-caching/.env.local` (plugin-scoped — highest)
4. **shell env vars override all three** (CLI override pattern)

If your shell has `AWS_PROFILE` set to something else (e.g. `aws-snappy-prod` from your day job), the loader respects it. To force this E2E onto the interlace profile, prefix the command:

```bash
AWS_PROFILE=interlace npm run e2e
```

### Pre-flight catches

The orchestrator's step 1 checks credentials via `aws sts get-caller-identity` — if your SSO session is expired, you'll see `ExpiredToken` immediately rather than burning a deploy attempt. Refresh with `aws sso login --profile interlace` (or whichever auth your profile uses).

## Common CloudFormation / APIGW gotchas

What we hit (and how to recognize them in future runs):

### "I deployed but `sls caching status` reports `cacheClusterStatus: CREATE_IN_PROGRESS`"

Normal. AWS provisions the cache cluster asynchronously — `sls deploy` returns when CloudFormation finishes, but the cluster takes another 3-5 minutes after that. **Wait, don't redeploy.** Our `waitForCacheClusterReady()` polls until `AVAILABLE`.

### "Cache cluster reached `AVAILABLE` but my requests still hit Lambda fresh every time"

Check three things in order:

1. **Did you send `Cache-Control: no-cache`?** APIGW respects it and bypasses the cache. Our `getEndpoint()` deliberately omits this header (Bug #2 above).
2. **Has it been < 60s since cluster reached `AVAILABLE`?** Per-method cache config takes additional time to propagate. Retry, don't redeploy (Bug #3).
3. **Is `caching.enabled: true` actually set on the endpoint?** The plugin warns "API Gateway caching is enabled but none of the endpoints have caching enabled" — check deploy logs for that string.

### "`sls remove` deleted the stack but I think a cache cluster might still be running"

The plugin's `before:remove:remove` hook disables the cluster _before_ CloudFormation tears down the stage. Verified live in every E2E run we've done — the plugin logs `Cache cluster disabled. Stack removal can proceed.` before `sls remove` succeeds.

If you genuinely suspect orphans, the manual confirmation is:

```bash
# Find any stages with active clusters across all our APIs
aws apigateway get-rest-apis --output json | \
  jq -r '.items[].id' | \
  while read api; do
    aws apigateway get-stages --rest-api-id "$api" --output json | \
      jq -r ".item[] | select(.cacheClusterEnabled == true) | \"$api / \(.stageName) / \(.cacheClusterStatus)\""
  done
```

### "Lambda returned 502 / Internal Server Error"

Almost always one of:

1. **Handler file isn't compiled JS** — Lambda nodejs runtimes execute `.js`/`.mjs`/`.cjs` only. If you deployed `.ts`, expect 502. (Bug #1.) The fixture's `handler.js` is the canonical reference.
2. **Handler export name mismatch** — `serverless.yml` says `handler: handler.hello` → file `handler.js` must export `hello`.
3. **Cold-start timeout** — increase `timeout` in `serverless.yml`. Our fixture uses 6s; cold-starts on `nodejs20.x` are typically <1s but transient AWS issues happen.

CloudWatch logs are the actual answer — the fixture sets `logRetentionInDays: 1` so they're available briefly.

### "`sls deploy` succeeded but my plugin hooks didn't fire"

Check the `dist/index.cjs` exists. The orchestrator's pre-flight catches this, but if you're invoking `tsx scripts/e2e/run.ts` directly without running `npm run build` first, the fixture installs an old/stale tarball and hooks may be missing.

The `npm run e2e` script auto-builds; the bare `tsx` invocation does not.

## How fixes get persisted in this file

When a run fails:

1. The orchestrator's `persistRunLog()` writes the failure to `runs/<timestamp>-<service>.json` automatically.
2. After landing the fix in code, **manually append** to that JSON file's `fixApplied` field — describing the fix in one sentence so future maintainers can trace symptom → fix.
3. Add a row to the **Bugs found** table at the top of this file. Don't drop bugs; even fixed ones are calibration data ("how often does our APIGW timing vary?").

## What we still don't measure

Open observations to capture in future runs:

- **`sls caching flush` duration** — instrument the orchestrator's `flushAndVerifyMiss()` to record AWS API call time.
- **`sls caching disable` propagation** — how long after `disable` exits does `getStage` report `cacheClusterStatus: !AVAILABLE`?
- **Cold-start vs warm-start latency on the MISS request** — first invocation is typically 800-1000ms; subsequent could be measured.
- **Request count and APIGW logging cost** — currently we estimate $0.02/run; with logging enabled the cost would be different.
- **Region variation** — all data so far is `us-east-1`. Other regions may have different cluster-create latencies.

## See also

- [`scripts/e2e/README.md`](./README.md) — how to run + prereqs + cost
- [`scripts/e2e/runs/`](./runs/) — full per-run logs (one JSON per invocation)
- [`CLAIMS.md`](../../../../CLAIMS.md) at serverless repo root — claims registry; the live-evidence rows are populated when this E2E passes
- [Interlace Evidence Framework](https://github.com/ofri-peretz/agents/blob/main/interlace/evidence-framework.md) — the contract every claim must satisfy
