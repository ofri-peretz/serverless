# E2E Release Verification

> Run before tagging a release. Deploys real AWS resources, exercises every claim the README makes, then tears them down. Pass means the plugin is release-ready.

```bash
cd packages/serverless-api-gateway-caching
npm run e2e
```

That's the whole interface.

## What it tests

11 sequential steps, each printed live:

|   # | Step                                | Asserts                                                                      |
| --: | ----------------------------------- | ---------------------------------------------------------------------------- |
|   1 | Pre-flight                          | AWS credentials work; `dist/` is built; region is set                        |
|   2 | Stage fixture                       | Plugin is packed via `npm pack`, fixture installed in a temp dir             |
|   3 | `sls deploy`                        | Stack creates successfully; endpoint URL is parseable from output            |
|   4 | Cache MISS                          | First HTTP request returns 200 with a fresh `generatedAt` timestamp          |
|   5 | Cache HIT                           | Second request within TTL returns identical body — Lambda was NOT re-invoked |
|   6 | `sls caching status`                | Cluster reports `Enabled: true`                                              |
|   7 | `sls caching flush`                 | Command exits 0                                                              |
|   8 | Post-flush MISS                     | Next request has a NEW `generatedAt` — flush worked                          |
|   9 | `sls caching disable` then `status` | Cluster reports `Enabled: false`                                             |
|  10 | `sls remove`                        | Stack tears down without error                                               |
|  11 | Verify clean                        | CloudFormation reports stack as gone or `DELETE_COMPLETE`                    |

If any step fails, the orchestrator runs an emergency `sls remove` so AWS isn't left billing for orphaned resources.

## What it costs

**~$0.05 – $0.10 per run.**

Cost breakdown:

- **API Gateway cache cluster (0.5 GB):** $0.020/hr → 5–10 min run = ~$0.002–0.005
- **Lambda invocations:** ~5 invocations × free tier = $0
- **API Gateway requests:** ~5 requests × $3.50/million = ~$0
- **CloudFormation stack ops:** $0
- **Headroom for retries / regional pricing variations:** the rest

If a run exceeds 1 hour for any reason (e.g., stuck stack), kill it (`Ctrl-C`) — the orchestrator's emergency remove runs even on `SIGINT`.

## Prereqs

| Requirement                     | How to check                                 | How to fix                                                                                                                 |
| ------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Node ≥ 20                       | `node --version`                             | nvm install 20                                                                                                             |
| AWS credentials                 | `aws sts get-caller-identity` works          | Set `AWS_PROFILE`, or `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` (see `.env.local` below)                               |
| AWS CLI (optional)              | `which aws`                                  | Used for the post-remove verification step. The script proceeds without it but skips one assertion                         |
| AWS region                      | `echo $AWS_REGION`                           | `export AWS_REGION=us-east-1` (or another region — works anywhere API Gateway runs)                                        |
| Serverless Framework v4 license | `echo $SERVERLESS_ACCESS_KEY`                | Required for sls v4 deploy. Get one at [serverless.com](https://www.serverless.com/), then add to `.env.local` (see below) |
| Plugin built                    | `ls dist/index.cjs`                          | `npm run build` (the `e2e` script runs this automatically)                                                                 |
| `serverless` CLI                | invoked via `npx`; auto-installed by fixture | n/a                                                                                                                        |

The script will refuse to run if `dist/` is missing. The `e2e` npm script auto-builds first.

## Configuring credentials (`.env.local`)

Both `AWS_PROFILE` (or AWS access keys) and `SERVERLESS_ACCESS_KEY` can live in a `.env.local` file — gitignored, never committed:

```bash
# packages/serverless-api-gateway-caching/.env.local
AWS_PROFILE=interlace-cli
AWS_REGION=us-east-1
SERVERLESS_ACCESS_KEY=your_serverless_framework_license_here
```

The orchestrator loads `.env.local` from three paths in this order, with later wins:

1. `agents/.env.local` (cruise-control repo, cross-product) — lowest precedence
2. `serverless/.env.local` (monorepo-wide)
3. `packages/serverless-api-gateway-caching/.env.local` (plugin-scoped) — highest

Putting shared secrets (`SERVERLESS_ACCESS_KEY`, `AWS_PROFILE`) in `agents/.env.local` is the recommended default — keeps them in one place across the whole Interlace product line.

Existing shell env vars override all three — useful for one-off runs:

```bash
AWS_PROFILE=staging-account npm run e2e
```

## What's deployed

A minimal Serverless app under a unique service name (`interlace-cache-e2e-<6-char suffix>`):

- 1 Lambda function with an HTTP `GET /hello` endpoint
- 1 API Gateway REST API with a 0.5 GB cache cluster (TTL 60s)
- CloudWatch log groups (1-day retention)

Deployed to whatever AWS region you set, in a stage called `e2e`. The unique suffix means concurrent E2E runs (or stale resources from a failed previous run) don't collide.

## What gets cleaned up

Step 10 (`sls remove`) deletes everything CloudFormation knows about: Lambda, API Gateway, log groups, cache cluster.

Step 11 verifies the cleanup by querying CloudFormation. If the stack is reported as gone OR `DELETE_COMPLETE`, the test passes.

If the test fails mid-run, the emergency-remove handler runs `sls remove` automatically. If THAT fails too, the script prints a manual cleanup command:

```bash
aws cloudformation delete-stack --stack-name interlace-cache-e2e-<suffix>-e2e --region <region>
```

## Troubleshooting

**`AWS credentials missing`** — set `AWS_PROFILE` to a profile in `~/.aws/credentials`, or export `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`.

**`Plugin not built`** — run `npm run build` first. The `npm run e2e` script does this for you, but if you're invoking `tsx scripts/e2e/run.ts` directly, you need to build manually.

**`Could not parse endpoint URL from sls deploy output`** — happens when Serverless Framework's output format changes between versions. Open an issue with the deploy output attached.

**`Cache miss when hit was expected`** — the cache propagation delay was longer than 2.5s. The orchestrator already waits, but in some regions APIGW takes longer. Bump the wait in `run.ts` step 5 from 2500ms to 5000ms and re-run.

**`Stack status after remove: <something else>`** — CloudFormation stack didn't fully tear down. Check the AWS console; if resources are stuck (rare for our minimal fixture), force-delete via the console. The most common cause is an in-flight cache cluster operation; wait 5 minutes and re-try `sls remove`.

**Region not us-east-1 fails** — some AWS regions have different cache cluster pricing or availability. The plugin works everywhere API Gateway runs, but if a region rejects 0.5 GB cluster sizes, edit `fixture/serverless.yml` to a supported size.

## When to run

- **Before every release** — non-negotiable. This is the gate that backs the "no ghost billing" claim in the README and CLAIMS.md
- **When you change anything in `before:remove:remove` or `caching:disable:disable` hooks** — these are the cleanup paths the test specifically verifies
- **When a competitor benchmark dimension changes** — the [api-gateway-caching benchmark](../../../benchmarks/benchmarks/api-gateway-caching/) reads claims that this E2E backs

## What every run captures

The orchestrator writes a structured JSON log to [`runs/`](./runs/) on every invocation (success OR failure). Each log records:

- **Per-step timings** — deploy, cluster-ready, MISS latency, HIT retries, flush, disable, remove, verify-clean
- **AWS observations** — cache cluster create time, full status-history transitions (`CREATE_IN_PROGRESS` → `AVAILABLE` with elapsed seconds at each step), endpoint URL, identity ARN
- **Failure context** — which step failed, the exact error message, root-cause analysis when known
- **Manual annotations** — after fixing a bug, append `fixApplied` to the offending run's JSON so symptom → fix is traceable

[`LEARNINGS.md`](./LEARNINGS.md) synthesizes patterns across runs: bugs found and fixed, AWS timing ranges to expect, common CloudFormation/APIGW gotchas, and what we still don't measure. **Read this before debugging an E2E failure** — most issues have already been seen.

## See also

- [`LEARNINGS.md`](./LEARNINGS.md) — calibration data + bug log + AWS gotchas
- [`runs/`](./runs/) — per-invocation JSON logs
- [`benchmarks/api-gateway-caching/methodology.md`](../../../benchmarks/benchmarks/api-gateway-caching/methodology.md) — what we measure statically vs what this E2E measures live
- [`CLAIMS.md`](../../../../CLAIMS.md) at the repo root — claims registry that maps each marketing assertion to the test that backs it
- [Interlace Evidence Framework](https://github.com/ofri-peretz/agents/blob/main/interlace/evidence-framework.md) — the contract every claim must satisfy
