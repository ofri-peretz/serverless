# Ghost-Billing Reproduction — Community `serverless-api-gateway-caching`

> Reproducible on real AWS in ~10 minutes, ~$0.005 in cache-cluster cost. Demonstrates the orphaned-cache-cluster failure mode that motivated `@interlace/serverless-api-gateway-caching`'s `before:remove:remove` cleanup hook and `sls caching disable` command.

---

## TL;DR

The community plugin manages the API Gateway cache cluster **imperatively** (via the AWS `UpdateStage` API), not declaratively in the CloudFormation template. CloudFormation never learns the cluster exists. When a user removes the plugin from `serverless.yml` and redeploys, no plugin code runs — and the cluster persists, billing forever.

Annual cost of an unrecognized 13.5 GB cluster: **$2,190**. Of a 237 GB cluster: **$33,288**.

`@interlace/serverless-api-gateway-caching` blocks this in two ways:

1. **`before:remove:remove` cleanup hook** — fires on `sls remove` to disable the cluster _before_ CloudFormation tears down the stack
2. **`sls caching disable` command** — explicit, documented offboarding command run before removing the plugin from config; the community plugin ships zero custom commands

---

## Reproduction recipe

Two playgrounds in `~/repos/ofriperetz.dev/agents/apps/`:

| Playground                                                                    | Plugin                                                  | Purpose             |
| ----------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------- |
| [`playground-stack/`](../../agents/apps/playground-stack)                     | `@interlace/serverless-api-gateway-caching` (this repo) | Reference / control |
| [`playground-stack-community/`](../../agents/apps/playground-stack-community) | `serverless-api-gateway-caching@1.11.0` (community)     | Trap reproduction   |

Both use a `serverless.ts` config (TypeScript), the same Lambda handler, and the same `interlace` AWS profile (account `346133547796`, `us-east-1`).

### Prerequisites

- Node.js ≥ 20
- Serverless Framework v4 installed (`npm i -g serverless`)
- AWS profile `interlace` configured locally (`aws configure --profile interlace`)
- A `.env` file in each playground containing `SERVERLESS_ACCESS_KEY` and `AWS_PROFILE=interlace`

### Step 1 — Deploy with the community plugin loaded

```bash
cd apps/playground-stack-community
npm install
npm run deploy
```

Verifies via `sls deploy` log:

```
[serverless-api-gateway-caching] Updating API Gateway cache settings (1 of 1).
[serverless-api-gateway-caching] Updating API Gateway cache settings. Attempt 1.
[serverless-api-gateway-caching] Done updating API Gateway cache settings.
✔ Service deployed to stack ghost-billing-demo-development (49s)
```

### Step 2 — Confirm the cluster is up

```bash
REST_API_ID=$(aws apigateway get-rest-apis --profile interlace \
  --query "items[?name=='development-ghost-billing-demo'].id" --output text)

aws apigateway get-stage --profile interlace \
  --rest-api-id "$REST_API_ID" --stage-name development \
  --query "{enabled:cacheClusterEnabled, status:cacheClusterStatus, size:cacheClusterSize}"
```

Wait for `status: AVAILABLE` (typically 4–7 minutes after deploy).

### Step 3 — Trigger the trap

Edit `serverless.ts` (or `serverless.yml`) and **remove the plugin** from the `plugins` array. In our reproduction, this is the only change:

```diff
 const config = {
   service: 'ghost-billing-demo',
-  plugins: ['serverless-api-gateway-caching'],
   provider: { name: 'aws', runtime: 'nodejs20.x', region: 'us-east-1', stage: 'development' },
   functions: { ... },
 };
```

Then redeploy:

```bash
npm run deploy
```

The deploy succeeds in ~28s. **No plugin code runs.**

### Step 4 — Observe the trap

```bash
aws apigateway get-stage --profile interlace \
  --rest-api-id "$REST_API_ID" --stage-name development \
  --query "{enabled:cacheClusterEnabled, status:cacheClusterStatus, size:cacheClusterSize}"
```

Output:

```json
{
  "enabled": true,
  "status": "AVAILABLE",
  "size": "0.5"
}
```

The cluster is **still running and still billing**. No CloudFormation event, no log line, no warning. Try to use the plugin to fix it:

```bash
sls caching disable
# ✖ Serverless command "caching disable" not found.

sls caching status
# ✖ Serverless command "caching status" not found.
```

The community plugin never registered any custom commands — so there is **no plugin-mediated escape**. The user must drop down to AWS CLI knowledge.

### Step 5 — The manual escape hatch

```bash
aws apigateway update-stage --profile interlace \
  --rest-api-id "$REST_API_ID" \
  --stage-name development \
  --patch-operations op=replace,path=/cacheClusterEnabled,value=false
```

The cluster transitions to `DELETE_IN_PROGRESS`. Then `sls remove` cleans up the rest of the stack via CloudFormation cascade.

---

## Cost projection

The user is responsible for whatever the cluster runs. AWS does not flag orphaned clusters. Real numbers ([AWS docs](https://aws.amazon.com/api-gateway/pricing/#Cache_Pricing)):

| Cluster size | $/hour | $/month | $/year |
| -----------: | -----: | ------: | -----: |
|       0.5 GB |  0.020 |   14.40 | 175.20 |
|       1.6 GB |  0.038 |   27.36 | 332.88 |
|       6.1 GB |  0.200 |  144.00 |  1,752 |
|      13.5 GB |  0.250 |  180.00 |  2,190 |
|      28.4 GB |  0.500 |  360.00 |  4,380 |
|      58.2 GB |  1.000 |  720.00 |  8,760 |
|       118 GB |  1.900 |   1,368 | 16,644 |
|       237 GB |  3.800 |   2,736 | 33,288 |

Costs are **per stage, per region**. A multi-stage / multi-region team can multiply.

---

## How `@interlace/serverless-api-gateway-caching` blocks the trap

| Defense                             | Source                                                                           | Description                                                                                                                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sls caching disable` command       | [`src/index.ts`](../packages/serverless-api-gateway-caching/src/index.ts)        | Documented offboarding command — run **before** removing the plugin from config. Issues `cacheClusterEnabled: false` patch immediately, then prints offboarding instructions |
| `before:remove:remove` cleanup hook | [`src/index.ts`](../packages/serverless-api-gateway-caching/src/index.ts)        | Fires on `sls remove`. Disables the cluster via `UpdateStage` _before_ CloudFormation begins teardown — defense-in-depth even when users skip the explicit disable command   |
| `sls caching status` command        | [`src/index.ts`](../packages/serverless-api-gateway-caching/src/index.ts)        | Reports cluster state at any time — surfaces orphans the user may have inherited                                                                                             |
| `sls caching preview` (dry-run)     | [`src/index.ts`](../packages/serverless-api-gateway-caching/src/index.ts)        | Shows the patch ops a deploy would issue without calling AWS write APIs — catches surprises before they cost money                                                           |
| Documentation                       | [Removal guide](https://serverless.interlace.tools/docs/plugins/caching/removal) | Step-by-step offboarding sequence; README front-loads the cleanup story                                                                                                      |

---

## Verified live, both directions

This document is backed by a real AWS reproduction performed on `2026-05-03`:

| Plugin                                      | Stack name                            | `sls remove` cleanup                                                                       | Cluster after redeploy without plugin                               | Final state                                          |
| ------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------- |
| `@interlace/serverless-api-gateway-caching` | `interlace-caching-smoke-development` | ✅ `before:remove:remove` fires; cluster disabled before CF teardown; stack deleted in 28s | n/a (we never had to remove the plugin to clean up)                 | Zero residuals                                       |
| `serverless-api-gateway-caching@1.11.0`     | `ghost-billing-demo-development`      | n/a — we triggered the trap instead                                                        | ❌ `enabled: true, AVAILABLE` — cluster persists, billing continues | Required manual `aws apigateway update-stage` to fix |

Run logs and exact CLI output for both deployments are reproducible from the playground directories listed above.

---

## Related

- Migration guide: <https://serverless.interlace.tools/docs/plugins/caching/migration>
- Removal guide: <https://serverless.interlace.tools/docs/plugins/caching/removal>
- Competitive deep-dive: [`docs/competitive-deep-dive.md`](./competitive-deep-dive.md)
- Plugin source: [`packages/serverless-api-gateway-caching/`](../packages/serverless-api-gateway-caching/)
