# @interlace/serverless-api-gateway-caching

> API Gateway caching for Serverless Framework — done right.

A TypeScript-native replacement for [`serverless-api-gateway-caching`](https://github.com/DianaIonita/serverless-api-gateway-caching) that fixes ghost billing, adds CLI commands, and provides full config validation.

## Why switch?

Everything the community plugin does, plus the things it does badly or not at all.

| Capability                                                 | Community plugin                                | `@interlace/serverless-api-gateway-caching`                            |
| ---------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| Enable/disable cache cluster                               | ✅                                              | ✅                                                                     |
| Cluster size (0.5–237 GB)                                  | ✅                                              | ✅ (+ enum-validated config)                                           |
| Per-method TTL (0–3600s)                                   | ✅                                              | ✅                                                                     |
| Data encryption at rest                                    | ✅                                              | ✅                                                                     |
| Cache key from path / query / header                       | ✅                                              | ✅                                                                     |
| Cache key from request body                                | ✅                                              | ✅ (`mappedFrom`)                                                      |
| Per-key invalidation control                               | ✅                                              | ✅                                                                     |
| Unauthorized invalidation handling                         | ✅                                              | ✅                                                                     |
| CloudWatch settings inheritance                            | ✅ (stage-only)                                 | ✅ (stage + per-endpoint override)                                     |
| **Auto-flush on deploy**                                   | ❌                                              | ✅ `flushOnDeploy: true`                                               |
| **`sls caching flush` command**                            | ❌                                              | ✅                                                                     |
| **`sls caching status` command**                           | ❌                                              | ✅                                                                     |
| **`sls caching disable` command**                          | ❌                                              | ✅ (safe offboarding)                                                  |
| **`sls caching preview` (dry-run)**                        | ❌                                              | ✅ Shows patch ops without calling AWS write APIs                      |
| **`before:remove:remove` cleanup hook**                    | ❌ ghost billing                                | ✅                                                                     |
| **`ANY` method → GET-only caching**                        | ❌ partial                                      | ✅ Enables GET, explicitly disables DELETE/HEAD/OPTIONS/PATCH/POST/PUT |
| **Shared API Gateway support**                             | ⚠️ partial                                      | ✅ `sharedApiGateway` flag                                             |
| **CF-defined additional endpoints**                        | ✅                                              | ✅ `additionalEndpoints`                                               |
| **`CacheKeyParameters` + `CacheNamespace` on CF template** | ⚠️ partial                                      | ✅ Per-method namespace isolation                                      |
| **Jittered exponential backoff (no thundering herd)**      | ❌                                              | ✅                                                                     |
| **JSON-schema config validation (Serverless v3+)**         | ❌                                              | ✅ Full schema, TTL range enforcement                                  |
| **TypeScript types & IntelliSense**                        | ❌                                              | ✅                                                                     |
| **Zero runtime dependencies**                              | ❌ `lodash.isempty`                             | ✅                                                                     |
| **No prototype pollution**                                 | 🔴 monkey-patches `String.prototype.replaceAll` | ✅                                                                     |

## Install

```bash
npm install @interlace/serverless-api-gateway-caching
```

## Quick Start

```yaml
# serverless.yml
plugins:
  - '@interlace/serverless-api-gateway-caching'

custom:
  interlaceCaching:
    enabled: true
    clusterSize: '0.5' # GB — valid: 0.5, 1.6, 6.1, 13.5, 28.4, 58.2, 118, 237
    ttlInSeconds: 300 # 0–3600 (default: 300)
    dataEncrypted: false # encrypt cached data at rest
    flushOnDeploy: false # flush cache after every deploy

functions:
  listUsers:
    handler: src/handler.list
    events:
      - http:
          path: /users
          method: get
          caching:
            enabled: true # must be explicitly enabled per endpoint

  getUser:
    handler: src/handler.get
    events:
      - http:
          path: /users/{id}
          method: get
          caching:
            enabled: true
            ttlInSeconds: 600 # override global TTL
            dataEncrypted: true # override global encryption
            cacheKeyParameters:
              - name: request.path.id
              - name: request.header.Accept-Language
```

> **Note:** Enabling caching globally does **not** automatically cache all endpoints — you must set `caching.enabled: true` on each endpoint individually. However, disabling caching globally disables it everywhere.

## Cache Key Parameters

Cache key parameters define what makes a cache entry unique. Without them, all requests to the same path return the same cached response.

### Path, query string, and header parameters

```yaml
caching:
  enabled: true
  cacheKeyParameters:
    - name: request.path.id
    - name: request.querystring.page
    - name: request.querystring.limit
    - name: request.header.Accept-Language
```

### Body-based cache keys

For POST endpoints (e.g., GraphQL), cache based on the request body:

```yaml
caching:
  enabled: true
  cacheKeyParameters:
    # Cache by the entire body
    - name: integration.request.header.bodyValue
      mappedFrom: method.request.body
    # Or cache by a specific JSON path
    - name: integration.request.header.cityCount
      mappedFrom: method.request.body.cities[0].petCount
```

### Catch-all path parameters

```yaml
functions:
  proxy:
    handler: src/proxy.handle
    events:
      - http:
          path: /api/{proxy+}
          method: get
          caching:
            enabled: true
            cacheKeyParameters:
              - name: request.path.proxy
```

## Per-Key Cache Invalidation

Control how clients can invalidate specific cache entries using the `Cache-Control: max-age=0` header:

```yaml
custom:
  interlaceCaching:
    enabled: true
    perKeyInvalidation:
      requireAuthorization: true # default: true
      handleUnauthorizedRequests: Ignore # Ignore | IgnoreWithWarning | Fail
```

| Strategy            | Behavior                                           |
| ------------------- | -------------------------------------------------- |
| `Ignore`            | Silently ignore unauthorized invalidation requests |
| `IgnoreWithWarning` | Ignore but add a `Warning` header in the response  |
| `Fail`              | Return 403 Forbidden                               |

Override per endpoint:

```yaml
caching:
  enabled: true
  perKeyInvalidation:
    requireAuthorization: true
    handleUnauthorizedRequests: Fail # stricter than global default
```

## Shared API Gateway

When your API Gateway is shared across multiple Serverless services, use `sharedApiGateway` to avoid overwriting the cache cluster settings from the main service:

```yaml
# In the service that OWNS the API Gateway:
custom:
  interlaceCaching:
    enabled: true
    clusterSize: '1.6'

# In services that SHARE the API Gateway:
custom:
  interlaceCaching:
    enabled: true
    sharedApiGateway: true                                           # skip stage-level cluster changes
    restApiId: ${cf:api-gateway-${self:provider.stage}.RestApiId}   # cross-stack reference
    basePath: /animals                                               # optional path prefix
```

## Additional Endpoints (CloudFormation-Defined)

For endpoints defined directly in CloudFormation (not as Lambda functions), such as HTTP proxies or DynamoDB service proxies:

```yaml
custom:
  interlaceCaching:
    enabled: true
    additionalEndpoints:
      - method: GET
        path: /serverless
        caching:
          enabled: true
          ttlInSeconds: 1200

      - method: GET
        path: /dynamodb
        caching:
          enabled: true
          cacheKeyParameters:
            - name: request.querystring.id
```

## CloudWatch Settings Inheritance

By default, per-method CloudWatch settings (log level, data trace, metrics) are inherited from the stage-level `*/*` defaults. This matches the community plugin behavior:

```yaml
custom:
  interlaceCaching:
    enabled: true
    endpointsInheritCloudWatchSettingsFromStage: true # default: true
```

Override per endpoint:

```yaml
caching:
  enabled: true
  inheritCloudWatchSettingsFromStage: false
```

## CLI Commands

### `sls caching status`

Show the current cache cluster state:

```bash
sls caching status
# --- Cache Status ---
#   Enabled:  true
#   Size:     0.5 GB
#   Status:   AVAILABLE
#   Stage:    development
#   API ID:   abc123xyz
```

### `sls caching flush`

Flush all cached responses for a stage:

```bash
sls caching flush
sls caching flush --stage production
```

### `sls caching disable`

**Fully disable the cache cluster.** Run this **before** removing the plugin from your `serverless.yml` to prevent ghost billing:

```bash
sls caching disable
sls caching disable --stage production
```

### `sls caching preview`

Dry-run — print every patch operation a `sls deploy` would apply, without calling AWS write APIs. Useful for verifying config in CI gates and reviewing exact changes before committing:

```bash
sls caching preview --stage production
# --- Cache Preview (dry-run) ---
#   REST API:    abc123def4
#   Stage:       production
#   Cluster:     enabled
#   Size:        0.5 GB
#   Default TTL: 300s
#   Operations:  6 (would chunk into 1 UpdateStage call(s))
#
#   replace /*/*/caching/enabled  →  false
#   replace /cacheClusterEnabled  →  true
#   replace /cacheClusterSize     →  0.5
#   replace /~1users~1{id}/GET/caching/enabled       →  true
#   replace /~1users~1{id}/GET/caching/ttlInSeconds  →  600
#   replace /~1users~1{id}/GET/caching/dataEncrypted →  true
#
# No AWS write APIs were called. Run `sls deploy` to apply.
```

## ⚠️ Removing This Plugin

> **Critical:** If you remove the plugin from `serverless.yml` without disabling the cache first, the cache cluster continues running on AWS and you will be billed for it indefinitely. The community `serverless-api-gateway-caching` plugin has the same trap — see the [reproducible end-to-end demo on real AWS](https://github.com/ofri-peretz/serverless/blob/main/docs/ghost-billing-reproduction.md) for proof and cost projections.

### Safe removal procedure

```bash
# Step 1: Disable the cache cluster on AWS
sls caching disable --stage development
sls caching disable --stage production    # repeat for each stage

# Step 2: Edit serverless.yml
#   - Remove '@interlace/serverless-api-gateway-caching' from plugins
#   - Remove 'interlaceCaching' from custom
#   - Remove 'caching' from function http events

# Step 3: Deploy clean
sls deploy --stage development
sls deploy --stage production

# Step 4: Uninstall
npm uninstall @interlace/serverless-api-gateway-caching
```

### Why is this necessary?

API Gateway cache clusters are provisioned resources that cost ~$0.02/hour ($14.40/month for 0.5 GB). They are **not** part of your CloudFormation stack — they're managed via the `UpdateStage` API at deploy time.

When you remove a caching plugin and redeploy:

- CloudFormation doesn't know about the cache cluster → it stays running
- No plugin hooks fire → nothing disables it
- You get ghost billing until you manually disable it in the AWS console

The `sls caching disable` command solves this by calling `UpdateStage` to set `cacheClusterEnabled=false` before you remove the plugin.

> **Note:** If you use `sls remove` (full stack deletion), the cleanup happens automatically via our `before:remove:remove` hook. The manual disable step is only needed when removing the **plugin** while keeping the service.

## Migrating from serverless-api-gateway-caching

### Step 1: Swap the package

```bash
npm uninstall serverless-api-gateway-caching
npm install @interlace/serverless-api-gateway-caching
```

### Step 2: Update serverless.yml

```diff
plugins:
-  - serverless-api-gateway-caching
+  - '@interlace/serverless-api-gateway-caching'

custom:
-  apiGatewayCaching:
+  interlaceCaching:
    enabled: true
    clusterSize: '0.5'
    ttlInSeconds: 300
-    apiGatewayIsShared: true
+    sharedApiGateway: true       # renamed for clarity
```

### Step 3: No other changes

Per-endpoint `caching` config on `http` events is **100% compatible** — no changes needed:

```yaml
# Works identically in both plugins
events:
  - http:
      path: /users/{id}
      method: get
      caching:
        enabled: true
        ttlInSeconds: 600
        cacheKeyParameters:
          - name: request.path.id
```

### Step 4: Deploy and verify

```bash
sls deploy
sls caching status    # verify cache is active
```

### Config key mapping

| Community Plugin                              | @interlace         | Notes                |
| --------------------------------------------- | ------------------ | -------------------- |
| `apiGatewayCaching`                           | `interlaceCaching` | Top-level config key |
| `apiGatewayIsShared`                          | `sharedApiGateway` | Renamed              |
| `endpointsInheritCloudWatchSettingsFromStage` | Same               | No change            |
| `additionalEndpoints`                         | Same               | No change            |
| `clusterSize`                                 | Same               | No change            |
| `ttlInSeconds`                                | Same               | No change            |
| `dataEncrypted`                               | Same               | No change            |
| `perKeyInvalidation`                          | Same               | No change            |
| `basePath`                                    | Same               | No change            |
| `restApiId`                                   | Same               | No change            |

## Configuration Reference

### Global Settings (`custom.interlaceCaching`)

| Property                                      | Type      | Default | Description                                                                 |
| --------------------------------------------- | --------- | ------- | --------------------------------------------------------------------------- |
| `enabled`                                     | `boolean` | `false` | Enable the cache cluster                                                    |
| `clusterSize`                                 | `string`  | `'0.5'` | Cache size in GB: `0.5`, `1.6`, `6.1`, `13.5`, `28.4`, `58.2`, `118`, `237` |
| `ttlInSeconds`                                | `number`  | `300`   | Default TTL (0–3600)                                                        |
| `dataEncrypted`                               | `boolean` | `false` | Encrypt cached data at rest                                                 |
| `flushOnDeploy`                               | `boolean` | `false` | Flush cache after every deploy                                              |
| `sharedApiGateway`                            | `boolean` | `false` | Skip stage-level cluster changes                                            |
| `restApiId`                                   | `string`  | auto    | Explicit REST API ID (for cross-stack)                                      |
| `basePath`                                    | `string`  | —       | Path prefix for shared gateways                                             |
| `endpointsInheritCloudWatchSettingsFromStage` | `boolean` | `true`  | Copy CloudWatch settings from stage to methods                              |
| `perKeyInvalidation`                          | `object`  | —       | Default invalidation settings                                               |
| `additionalEndpoints`                         | `array`   | `[]`    | CF-defined endpoints to cache                                               |

### Endpoint Settings (`http.caching`)

| Property                             | Type      | Default | Description                      |
| ------------------------------------ | --------- | ------- | -------------------------------- |
| `enabled`                            | `boolean` | `false` | Enable caching for this endpoint |
| `ttlInSeconds`                       | `number`  | global  | Override TTL                     |
| `dataEncrypted`                      | `boolean` | global  | Override encryption              |
| `inheritCloudWatchSettingsFromStage` | `boolean` | `true`  | Override CloudWatch inheritance  |
| `perKeyInvalidation`                 | `object`  | global  | Override invalidation settings   |
| `cacheKeyParameters`                 | `array`   | `[]`    | Cache key parameters             |

## Release Verification

Every claim in this README is backed by a reproducible E2E test. Before tagging a release, run:

```bash
npm run e2e
```

11-step verification: deploys real AWS resources, makes a request, confirms cache HIT on retry, runs `sls caching flush` and verifies invalidation, runs `sls caching disable` then `sls remove`, and asserts CloudFormation reports the stack as fully gone.

Cost: ~$0.05–$0.10 per run (cache cluster × 5–10 minutes). Always cleans up via `try/finally` — even on test failure, an emergency `sls remove` runs so AWS isn't left billing for orphaned resources.

See [`scripts/e2e/README.md`](./scripts/e2e/README.md) for prereqs, troubleshooting, and the full step-by-step.

The release-verified claims are tracked in [`CLAIMS.md`](../../CLAIMS.md) at the repo root, alongside the static-evidence claims (zero deps, types coverage) sourced from the [`api-gateway-caching` competitive benchmark](../benchmarks/benchmarks/api-gateway-caching/).

## REST API Only

This plugin only supports **REST API** (`http` events). HTTP API (`httpApi` events) does not support API Gateway caching. See [AWS docs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html).

## License

MIT
