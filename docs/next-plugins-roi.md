# Next Serverless Plugins — ROI Ranking

> **Date:** 2026-05-04 · **Methodology:** competitor weekly DL × maintenance staleness × differentiation strength × strategic fit × effort-to-ship.
>
> **Companion to:** [ROADMAP.md](../ROADMAP.md) (sprint plan), [plugin-audit.md](plugin-audit.md) (internal-plugin inventory), [community-plugin-comparison.md](community-plugin-comparison.md) (caching plugin verified comparison).
>
> **Refresh:** quarterly. Re-pull npm download counts and last-publish dates; re-rank when a row's incumbent shifts.

## Executive summary — top 3 next moves

The data surfaces **one large abandoned-incumbent opportunity not currently in the roadmap** plus reorders two roadmapped plugins.

1. **`@interlace/serverless-iam-roles-per-function`** — **NOT in current roadmap.** Incumbent `serverless-iam-roles-per-function` has **118k dl/wk** and last published **1808 days ago (5 years)**. Per-function IAM is a universal production need. Largest abandoned-incumbent opportunity in the entire serverless ecosystem. Should be **next sprint after the current commitments**.
2. **`@interlace/serverless-plugin-security`** — already Sprint 3. Bundles three stale plugins totaling **~71k dl/wk** with incumbents 6-8.5 years stale. Confirm the sequencing — this is high ROI.
3. **`@interlace/serverless-package`** — currently Sprint 4. **Should move earlier.** Internal plugin is mature (P0 in audit, ~230K LOC), and the community alternatives (`common-excludes`, `include-dependencies`) are stale and combine to ~52k dl/wk. Earlier ship date = earlier OpenAPI shipping (which depends on package).

## Adoption snapshot — community plugins addressable

Each candidate `@interlace/*` plugin scored against its primary incumbent.

| Replacement candidate | Primary incumbent(s) | Incumbent dl/wk | Last publish | Maintenance signal |
| ----------------------------------------------------------- | ---------------------------------------- | --------------: | ------------ | --------------------- | --------------------------------------------------------------------------- |
| **`serverless-iam-roles-per-function`** | `serverless-iam-roles-per-function` | **118,761** | 2021-05-21 | 🔴 abandoned (5 yr) |
| **`serverless-plugin-security`** | `serverless-associate-waf` | 40,164 | 2020-04-17 | 🔴 abandoned (6 yr) |
| (same) | `serverless-plugin-tracing` | 31,738 | 2017-10-13 | 🔴 abandoned (8.5 yr) |
| **`serverless-package`** | `serverless-plugin-common-excludes` | 27,782 | 2021-07-06 | 🔴 abandoned (5 yr) |
| (same) | `serverless-plugin-include-dependencies` | 24,743 | 2024-07-22 | 🟡 slow (650 d) |
| **`serverless-throttling`** | `serverless-api-gateway-throttling` | 42,677 | 2023-03-19 | 🟡 slow (3 yr) |
| **`serverless-plugin-canary-deployments`** ← NOT in roadmap | `serverless-plugin-canary-deployments` | 25,170 | 2022-04-11 | 🔴 abandoned (4 yr) |
| **`serverless-openapi`** | `serverless-aws-documentation` | 14,916 | 2018-04-18 | 🔴 abandoned (8 yr) |
| (same) | `serverless-openapi-documenter` | 4,142 | recent | 🟡 niche / fragmented |
| **`serverless-plugin-observability`** | `serverless-log-forwarding` | 3,756 | 2024-11-27 | 🟡 slow (522 d) |
| **`serverless-offline-scheduler`** ← NOT in roadmap | `serverless-offline-scheduler` | 16,880 | 2021-06-07 | 🔴 abandoned (5 yr) |
| **(skipped)** `serverless-plugin-typescript` | `serverless-plugin-typescript` | 150,601 | 2023-06-05 | 🔴 archived | sls v4 native TS replaces this — devkit `doctor` migration story handles it |

**Active competitors — DO NOT try to replace:**

| Active competitor           | Weekly DL | Last publish     | Why skip                                                  |
| --------------------------- | --------: | ---------------- | --------------------------------------------------------- |
| `serverless-offline`        |   590,158 | recent           | Mature, well-maintained                                   |
| `serverless-esbuild`        |   353,400 | recent           | sls v4 native build replaces it for free; no fight needed |
| `serverless-prune-plugin`   |   343,256 | recent           | Mature, well-maintained, narrow scope                     |
| `serverless-domain-manager` |   274,557 | recent           | Mature; AWS-team-quality                                  |
| `serverless-step-functions` |   177,485 | recent           | Mature; deep AWS surface                                  |
| `serverless-plugin-warmup`  |    70,166 | 2026-02-21 (71d) | Just shipped — actively maintained                        |

These are battle-tested. Spending effort to displace them = poor ROI vs spending the same effort on abandoned-incumbent territory.

## ROI ranking

Each candidate scored 1-5 across 5 dimensions; composite = sum (max 25).

### Tier S — abandoned incumbent + universal need

| Candidate                               | Market | Diff | Mat | Strat | Effort | **Composite** | Rationale                                                                                                                                                                                                 |
| --------------------------------------- | -----: | ---: | --: | ----: | -----: | ------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`serverless-iam-roles-per-function`** |      5 |    5 |   4 |     5 |      4 |     **23/25** | 118k dl/wk + 5-year stale + universal production pain. **Add to next sprint.** Modern v4 type support + better DX = drop-in replacement narrative. The biggest single-plugin opportunity in the portfolio |
| **`serverless-plugin-security`**        |      5 |    5 |   4 |     4 |      3 |     **21/25** | Three abandoned competitors bundled (WAF + tracing + cross-account). 70k+ dl/wk addressable. Already Sprint 3. Ship after caching                                                                         |
| **`serverless-package`**                |      4 |    5 |   5 |     4 |      4 |     **22/25** | Internal Snappy plugin mature (~230K LOC, P0 in audit). Two stale community competitors. **Move earlier in roadmap** — currently Sprint 4                                                                 |

### Tier A — clear ROI, in or near current roadmap

| Candidate                              | Market | Diff | Mat | Strat | Effort | **Composite** | Rationale                                                                                                                                                                       |
| -------------------------------------- | -----: | ---: | --: | ----: | -----: | ------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serverless-throttling`                |      4 |    4 |   5 |     5 |      4 |     **22/25** | 42k dl/wk + 3-year stale + sister to caching plugin (cross-sell). Internal Snappy plugin (~16K LOC). Currently Sprint 5+ — **move to Sprint 4** alongside package               |
| `serverless-openapi`                   |      3 |    5 |   5 |     5 |      3 |     **21/25** | Internal Snappy plugin mature (~250K LOC, P0). OpenAPI/SDK gen is fragmented community space (3 plugins, all small/stale). Strong "TS-first APIs" narrative. Currently Sprint 4 |
| `serverless-plugin-canary-deployments` |      3 |    5 |   3 |     4 |      3 |     **18/25** | **NOT in roadmap.** 25k dl/wk + 4-year stale + clear "modern progressive deploy" angle. Add to Sprint 5+                                                                        |
| `serverless-build-layers`              |      2 |    4 |   4 |     3 |      5 |     **18/25** | Internal Snappy plugin mature. No clear large competitor. Easy ship — already Sprint 5+                                                                                         |

### Tier B — fill ecosystem gaps when capacity allows

| Candidate                         | Composite | Rationale                                                                                                                                                                                          |
| --------------------------------- | --------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serverless-proxy`                |     17/25 | Internal Snappy plugin (~100K LOC). No direct community equivalent — the "competitor" is using Middy at module level. Strategic for the OpenAPI integration story but standalone market is unclear |
| `serverless-plugin-observability` |     17/25 | log-forwarding (3k dl/wk) is small market. Modern OTel angle is strategic — strongest bundled with security plugin                                                                                 |
| `serverless-offline-scheduler`    |     16/25 | **NOT in roadmap.** 16k dl/wk + 5-year stale. Tight scope, clear win. Probably small enough to fold into a "serverless-offline-extras" bundle                                                      |

### Tier C — skip or fold into devkit

| Candidate                                             | Reason to skip                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `serverless-plugin-lambda-account-access`             | 1.8k dl/wk — too small. Roll into `serverless-plugin-security`                   |
| Standalone `serverless-plugin-typescript` replacement | sls v4 has native TS — no plugin needed; devkit `doctor` handles migration story |
| Custom domain manager replacement                     | `serverless-domain-manager` is mature + active. Don't fight                      |

## Recommended sequence (revised vs current ROADMAP.md)

The current roadmap reflects a `funnel-top → flagship` strategy. The market data suggests one re-ordering and one addition:

| Sprint             | Current roadmap                                                    | Suggested                                                                                                                 |
| ------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 1                  | devkit `doctor` + `init-ts` + esbuild article                      | ✅ keep — highest reach, validates the ecosystem story                                                                    |
| 2                  | api-gateway-caching + community-bug article                        | ✅ keep — already shipped & verified                                                                                      |
| 3                  | security plugin + WAF article + serverless.ts article              | ✅ keep — high ROI (Tier S)                                                                                               |
| 4                  | flagship ports (package + openapi)                                 | ✅ keep — but ship `package` BEFORE `openapi` (openapi depends on it for multi-region story)                              |
| **NEW Sprint 4.5** | —                                                                  | **Add: `serverless-iam-roles-per-function`** — biggest single opportunity, missing from roadmap. ~3 weeks                 |
| 5                  | proxy, observability, throttling, build-layers, nestjs, cloudfront | Reorder: throttling FIRST (cross-sells caching), then observability (security cross-sell), then proxy/build-layers/canary |

## What this changes vs the current roadmap

**Adds:** `serverless-iam-roles-per-function` and `serverless-plugin-canary-deployments` — both abandoned-incumbent territory the roadmap doesn't cover.

**Reorders:** package before openapi within Sprint 4. Throttling promoted to Sprint 5 lead.

**Confirms:** Sprints 1-3 are correctly sequenced. The funnel-top devkit story is right. Security plugin in Sprint 3 is right.

**Cuts:** Don't build standalone replacements for `serverless-plugin-typescript`, `serverless-offline`, `serverless-esbuild`, `serverless-domain-manager`, `serverless-prune-plugin`, `serverless-plugin-warmup`, `serverless-step-functions`. They're either actively maintained or replaced by sls v4 native features.

## Strategic patterns from the data

1. **"Abandoned incumbent" is the highest-ROI signal in this ecosystem.** Six plugins with > 25k dl/wk haven't been published in 4+ years. That's where the largest replaceable user bases live.
2. **Don't fight active competitors.** `serverless-offline` (590k), `serverless-esbuild` (353k), `serverless-domain-manager` (274k) are all maintained — re-shipping them as `@interlace/*` would be high effort for low conversion.
3. **Bundling stale plugins is a force multiplier.** `serverless-plugin-security` covers WAF + tracing + access in one install — three stale-plugin replacements at the cost of one. Same opportunity for `serverless-package` (excludes + dependencies) and `serverless-plugin-observability` (logs + env + OTel).
4. **Cross-sell within the @interlace ecosystem.** caching → throttling → security all touch API Gateway. observability + security touch CloudWatch + CloudTrail. Once a user installs one, the others have lower friction.
5. **Internal Snappy plugins (`@snappygifts/*`) are de-risked.** They've been used in production for years. Time-to-ship for those is measured in weeks, not months. Prioritize ports.

## Methodology

Same scoring matrix as the [ESLint portfolio review](../../agents/interlace/portfolio-review.md):

| Dimension           | Means                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------- |
| **Market**          | Incumbent dl/wk (5 = ≥ 100k, 4 = ≥ 30k, 3 = ≥ 10k, 2 = ≥ 1k, 1 = < 1k)                      |
| **Differentiation** | Maintenance staleness + missing features (5 = abandoned + many gaps, 1 = active competitor) |
| **Maturity**        | Internal source mature (5 = ported from Snappy P0/P1) vs greenfield (3) vs prototype (1)    |
| **Strategic**       | Cross-sell potential + narrative fit (5 = central, 1 = peripheral)                          |
| **Effort**          | Inverse — 5 = low effort, 1 = months of engineering                                         |

**Sources:** npm registry weekly DL counts, npm registry `time` field for last-publish dates, internal [plugin-audit.md](plugin-audit.md) for Snappy-internal plugin maturity, [ROADMAP.md](../ROADMAP.md) for current plan.

## Open questions before committing

1. **Capacity vs sequence:** how many parallel plugin teams realistically? If 1, follow the suggested sequence as-is. If 2, parallel-track Tier S items (iam-roles + security) to compress timeline.
2. **Internal plugin licensing:** are the `@snappygifts/*` plugins green-lighted to open-source as `@interlace/*`? Especially package + openapi (P0). If not, that re-ranks heavily — would need greenfield rebuilds.
3. **Brand surface:** at what point does the @interlace ecosystem need a unified positioning page (interlace.dev/serverless)? After Sprint 3? Sprint 4?
