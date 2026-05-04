# Community Plugin Comparative E2E

> Measures the incumbent `serverless-api-gateway-caching` (community) plugin's
> behavior on real AWS, side-by-side with this plugin. Used to validate or
> refute the comparative claims in [CLAIMS.md](../../../../CLAIMS.md).

## What this run measures

Specifically: **the `sls remove` (full stack deletion) scenario.**

| #   | Step                               | What we measure                                                       |
| --- | ---------------------------------- | --------------------------------------------------------------------- |
| 1   | Pre-flight                         | AWS creds + region                                                    |
| 2   | Stage fixture                      | Community plugin installed from npm at pinned version                 |
| 3   | `sls deploy`                       | Wall-clock deploy time + endpoint URL                                 |
| 4   | Wait for cluster `AVAILABLE`       | Cluster create curve (CREATE_IN_PROGRESS → AVAILABLE)                 |
| 5   | Cache MISS + HIT                   | Confirms community plugin's caching works at runtime                  |
| 6   | `sls remove` (10-min hard timeout) | Exit code, duration, output                                           |
| 7   | Post-remove orphan check           | CloudFormation status, APIGateway stage existence, REST API existence |
| 8   | Verdict                            | Was removal clean? Were resources orphaned?                           |

## What this run does NOT measure

The actual ghost-billing scenario is **plugin uninstall while keeping the
service running** — NOT `sls remove`. Per the
[ghost-billing reproduction recipe](../../../../docs/ghost-billing-reproduction.md),
the trap fires when:

1. User removes the plugin from `serverless.yml`
2. User runs `sls deploy` (not `sls remove`)
3. CloudFormation never knew about the cache cluster (it's managed via
   `UpdateStage` API, not declared in CFN), so the cluster persists
4. With no plugin code running, no cleanup hook fires; the cluster keeps
   billing

This E2E does not exercise that path. A future `cleanup-uninstall-path` suite
would automate the manual recipe; tracked in
[agents/interlace/serverless/evidence-plan.md](https://github.com/ofri-peretz/agents/blob/main/interlace/serverless/evidence-plan.md).

## Findings (2026-05-04)

Both plugins clean up correctly on `sls remove`:

|                              | Interlace plugin (2026-05-03) | Community plugin (2026-05-04) |
| ---------------------------- | ----------------------------- | ----------------------------- |
| Deploy time                  | 130s                          | 109s                          |
| Cluster create               | 245s                          | 214s                          |
| Cache HIT response time      | 146ms (5.5x faster than MISS) | 102ms (8.6x faster than MISS) |
| `sls remove` duration        | 28s                           | 31s                           |
| `sls remove` exit code       | 0                             | 0                             |
| CloudFormation post-remove   | `does not exist`              | `does not exist`              |
| APIGateway stage post-remove | gone                          | gone                          |
| REST API post-remove         | gone                          | gone                          |
| Orphans?                     | None                          | None                          |

**Implication:** AWS CloudFormation handles cache-cluster teardown as part of
stage-delete in the full-stack-removal case, regardless of whether the plugin
has a `before:remove:remove` hook. Earlier marketing copy implying our hook
"fixes" community's `sls remove` bug was wrong — there is no `sls remove` bug.

The hook is still valuable as **defense-in-depth** for partial-deploy /
concurrent-deploy edge cases (untested) and our `sls caching disable`
command is the actual fix for the **plugin-uninstall** scenario.

## Cost and runtime

- **Cost:** ~$0.05 per run (cache cluster × ~7-10 min)
- **Runtime:** ~9-12 min wall clock
- **Hard timeout on remove:** 10 min (cost guard if cluster delete hangs)

## How to run

```bash
AWS_PROFILE=interlace AWS_REGION=us-east-1 \
  npx tsx scripts/e2e-community/run.ts
```

The orchestrator loads `.env.local` from the same chain as the main E2E
([agents/.env.local](https://github.com/ofri-peretz/agents/blob/main/.env.local)
→ `serverless/.env.local` → plugin `.env.local`, with shell env winning).

Run logs land in [`runs/`](./runs/) — one JSON per invocation with full
timings, AWS observations, and verdict.

## See also

- [`scripts/e2e/`](../e2e/) — main E2E for THIS plugin (verifies our claims)
- [`docs/ghost-billing-reproduction.md`](../../../../docs/ghost-billing-reproduction.md) — the manual recipe for the actual ghost-billing scenario
- [`CLAIMS.md`](../../../../CLAIMS.md) → "Ghost billing — what's measured" — the scenario table that resolved this
