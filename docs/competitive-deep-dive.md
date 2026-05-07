# Community Plugin Deep Dive — Source-Level Analysis

> For each plugin we intend to replace, this document provides:
>
> - Exact behavior (from reading source code, not just README)
> - What they DON'T do (missing capabilities)
> - Resource cleanup gaps
> - Full AWS API coverage analysis
> - Quick Win assessment
> - Migration pain points to exploit

---

## 🏆 Quick Win Tier List

| Tier                | Plugin                                   | Effort   | Impact | Why                                                      |
| ------------------- | ---------------------------------------- | -------- | ------ | -------------------------------------------------------- |
| **S — Ship First**  | `serverless-api-gateway-caching`         | ~2 weeks | High   | 300 LOC, zero cleanup, missing half of AWS API surface   |
| **S — Ship First**  | `serverless-associate-waf`               | ~1 week  | Medium | 190 LOC, trivial to subsume, zero disassociate-on-remove |
| **A — Fast Follow** | `serverless-plugin-common-excludes`      | ~3 days  | Medium | Static list, we already have better                      |
| **A — Fast Follow** | `serverless-plugin-include-dependencies` | ~1 week  | Medium | Our workspace isolation is superior                      |
| **B — Strategic**   | `serverless-domain-manager`              | Skip     | Low    | Well-maintained, not worth competing                     |
| **B — Strategic**   | `serverless-iam-roles-per-function`      | Skip     | Low    | Native v4 replaces this                                  |

---

## S-Tier: `serverless-api-gateway-caching`

> **Source**: [github.com/DianaIonita/serverless-api-gateway-caching](https://github.com/DianaIonita/serverless-api-gateway-caching) · [npm](https://www.npmjs.com/package/serverless-api-gateway-caching)

### Source Code Review

**Files analyzed**: `apiGatewayCachingPlugin.js`, `stageCache.js`, `ApiGatewayCachingSettings.js`, `cacheKeyParameters.js`, `restApiId.js`, `pathParameters.js`

#### Architecture

```
apiGatewayCachingPlugin.js (entry)
  ├── hooks: before:package:initialize, before:package:finalize, after:deploy:deploy
  ├── ApiGatewayCachingSettings (config parser)
  ├── cacheKeyParameters (CloudFormation template mutation)
  ├── stageCache (post-deploy API Gateway UpdateStage calls)
  └── restApiId (REST API ID resolution)
```

#### What It Does (Exactly)

1. **`before:package:initialize`** — Parses `custom.apiGatewayCaching` into a settings object
2. **`before:package:finalize`** — Mutates CloudFormation template to add `RequestParameters` for cache key params
3. **`after:deploy:deploy`** — Calls `APIGateway.updateStage()` with patch operations to:
   - Enable/disable cache cluster
   - Set cluster size
   - Set TTL per method
   - Set data encryption per method
   - Set per-key invalidation settings per method
   - Optionally inherit CloudWatch settings from stage

#### Critical Source Code Findings

**🔴 `String.prototype.replaceAll` monkey-patch** (stageCache.js line 10-16):

```javascript
String.prototype.replaceAll = function (search, replacement) {
  let target = this;
  return target.split(search).join(replacement);
};
```

This is a **global prototype pollution** — modifying `String.prototype` for ALL code in the process. In modern Node.js (18+), `replaceAll` is native and this override silently breaks it.

**🔴 No `remove` hook** — The plugin has NO lifecycle hook for `before:remove:remove` or `after:remove:remove`. When you `sls remove` your stack, the cache cluster is deleted (because the stage is deleted), but if you disable caching in config and redeploy, the cache cluster **stays running and billing you**.

**🔴 No `sls offline` integration** — No awareness of local development at all.

**🔴 Retry logic has exponential backoff but no jitter** (stageCache.js line 211-243):

```javascript
const delay = baseDelay * 2 ** attempt; // No jitter = thundering herd
```

**🟡 MAX_PATCH_OPERATIONS_PER_STAGE_UPDATE = 80** — Hard-coded chunk size for the AWS API limit. This is correct but undocumented.

**🟡 `lodash.isempty` dependency** — Pulls in lodash for a single function (`isEmpty`).

#### What It Doesn't Support (AWS API Gaps)

| AWS Capability                     | Supported | Notes                                               |
| ---------------------------------- | --------- | --------------------------------------------------- |
| Enable/disable cache cluster       | ✅        |                                                     |
| Cluster size selection             | ✅        | 0.5, 1.6, 6.1, 13.5, 28.4, 58.2, 118, 237 GB        |
| TTL per method                     | ✅        | 0-3600 seconds                                      |
| Data encryption at rest            | ✅        |                                                     |
| Cache key from path params         | ✅        |                                                     |
| Cache key from query strings       | ✅        |                                                     |
| Cache key from headers             | ✅        |                                                     |
| Cache key from request body        | ✅        | Via integration mapping                             |
| Per-key invalidation control       | ✅        |                                                     |
| Unauthorized invalidation handling | ✅        | Ignore/IgnoreWithWarning/Fail                       |
| **Multi-value query strings**      | ❌        | Explicitly noted as unsupported                     |
| **Multi-value headers**            | ❌        | Explicitly noted as unsupported                     |
| **Cache flush on deploy**          | ❌        | No option to auto-flush after deploy                |
| **Cache flush command**            | ❌        | No `sls flush-cache` command                        |
| **CloudWatch metrics config**      | ⚠️        | Only inherits from stage, can't set independently   |
| **Throttling settings**            | ❌        | Can't configure method throttling alongside caching |
| **Stage variables as cache keys**  | ❌        | Not supported                                       |
| **Content handling**               | ❌        | CONVERT_TO_BINARY/CONVERT_TO_TEXT not configurable  |
| **Custom integration timeout**     | ❌        | Can't set alongside cache config                    |
| **Canary settings**                | ❌        | No canary deployment cache config                   |
| **Resource cleanup on disable**    | ❌        | Disabling cache in config doesn't clean up cluster  |
| **HTTP API support**               | ❌        | Only REST API (AWS limitation, but should document) |
| **Dry-run mode**                   | ❌        | No way to preview patch operations                  |

#### Pain Points from GitHub Issues

1. Cache cluster stays active (and billing) after disabling
2. No way to flush cache without AWS console
3. `ConflictException` during deploys (retry helps but users don't know why)
4. No TypeScript types
5. Multi-value params unsupported
6. `ANY` method handling is confusing
7. No HTTP API support (AWS limitation but users keep asking)

#### @interlace/serverless-api-gateway-caching — Spec

We should call this `plugin-caching` (not `plugin-cloudfront`) since API Gateway caching is the immediate replacement. CloudFront is a separate, bigger scope.

**What we build better**:

```yaml
# serverless.yml
plugins:
  - '@interlace/serverless-api-gateway-caching'

custom:
  interlaceCaching:
    enabled: true
    clusterSize: '0.5'
    ttlInSeconds: 300
    dataEncrypted: true
    flushOnDeploy: true # ← NEW: auto-flush after deploy
    perKeyInvalidation:
      requireAuthorization: true
      handleUnauthorizedRequests: Ignore
    # NEW: multi-value support
    multiValueQueryStrings: true
    multiValueHeaders: true

functions:
  getUser:
    handler: src/handler.getUser
    events:
      - http:
          path: /users/{id}
          method: get
          caching:
            enabled: true
            ttlInSeconds: 600
            cacheKeyParameters:
              - name: request.path.id
              - name: request.querystring.fields
              - name: request.header.Accept-Language
```

**Commands we add**:

```bash
sls caching flush          # Flush entire stage cache
sls caching flush --path /users  # Flush specific path (if possible via API)
sls caching status         # Show cache cluster status, hit/miss rates
```

**Cleanup we fix**:

- `before:remove:remove` → disable cache cluster
- `after:deploy:deploy` → if `enabled: false`, actively disable cluster
- Dry-run mode: `sls caching preview` → shows patch operations without applying

---

## S-Tier: `serverless-associate-waf`

> **Source**: [github.com/mikesouza/serverless-associate-waf](https://github.com/mikesouza/serverless-associate-waf) · [npm](https://www.npmjs.com/package/serverless-associate-waf)

### Source Code Review (190 LOC total)

**File**: `lib/index.js` — single file, no tests visible in repo.

#### Architecture

```
AssociateWafPlugin
  ├── hooks: after:deploy:deploy, before:package:finalize
  ├── associateWaf() → WAF.associateWebACL
  ├── disassociateWaf() → WAF.disassociateWebACL
  ├── findWebAclByName() → WAF.listWebACLs (Limit: 100)
  └── outputRestApiId() → Adds CF output for split-stack compat
```

#### What It Does (Exactly)

1. **`before:package:finalize`** — Adds `ApiGatewayRestApiWaf` to CloudFormation Outputs (for split-stack compatibility)
2. **`after:deploy:deploy`** — If `custom.associateWaf.name` is set, calls `WAF.associateWebACL`. If name is empty/unset, calls `WAF.disassociateWebACL`

#### Critical Source Code Findings

**🔴 No `remove` hook** — When you `sls remove`, the WAF association is NOT cleaned up. The API Gateway is deleted, so the association becomes orphaned, but if you're using a shared API Gateway, the WAF stays associated to a now-broken stage.

**🔴 `listWebACLs` with `Limit: 100`** — If you have more than 100 WAF ACLs, the plugin silently can't find yours. No pagination.

**🔴 No ARN support** — The plugin looks up WAFs by name only. If you already have the ARN (which is common in multi-account setups), you can't pass it directly.

**🔴 Error swallowing** — Both `associateWaf()` and `disassociateWaf()` catch ALL errors and just `console.error`. A failed WAF association doesn't fail the deploy.

**🟡 WAFRegional vs WAFV2** — Supports both, but `version` config is poorly documented (`"V2"` or `"Regional"`).

**🟡 No WAFv2 scope configuration** — Hard-coded to `REGIONAL`. Can't use `CLOUDFRONT` scope.

#### What It Doesn't Support

| Capability                   | Supported | Notes                        |
| ---------------------------- | --------- | ---------------------------- |
| Associate WAF by name        | ✅        |                              |
| Disassociate WAF             | ✅        | When name is empty           |
| WAFv2 support                | ✅        | Via `version: V2` config     |
| WAFRegional support          | ✅        | Default                      |
| Split-stack compatibility    | ✅        | Via CF Output                |
| **Associate by ARN**         | ❌        | Must use name lookup         |
| **Pagination**               | ❌        | Max 100 ACLs                 |
| **Remove hook cleanup**      | ❌        | Orphaned associations        |
| **Fail on error**            | ❌        | Swallows all errors silently |
| **WAF creation**             | ❌        | Must pre-create WAF          |
| **IP set management**        | ❌        |                              |
| **Rate limiting rules**      | ❌        |                              |
| **Geo-blocking**             | ❌        |                              |
| **Security headers**         | ❌        |                              |
| **Multiple WAF association** | ❌        | One WAF per stack            |
| **HTTP API support**         | ❌        | REST API only                |
| **CloudFront scope**         | ❌        | Hard-coded REGIONAL          |

#### @interlace/serverless-plugin-security — WAF Spec

```yaml
custom:
  interlaceSecurity:
    waf:
      # Support BOTH name and ARN
      name: 'my-web-acl' # OR
      arn: 'arn:aws:wafv2:...' # direct ARN — no lookup needed
      version: 'V2' # default: V2
      scope: 'REGIONAL' # or 'CLOUDFRONT'
      failOnError: true # ← NEW: deploy fails if WAF can't associate
    # Additional security features in same plugin:
    tracing:
      xray: true
      otel: false
    headers:
      strictTransportSecurity: true
      contentSecurityPolicy: "default-src 'self'"
```

**Cleanup we fix**:

- `before:remove:remove` → Disassociate WAF before stack deletion
- Paginated `listWebACLs` (handle 100+ ACLs)
- Error handling: configurable fail/warn behavior

---

## A-Tier: `serverless-plugin-common-excludes`

> **Source**: [github.com/dougmoscrop/serverless-plugin-common-excludes](https://github.com/dougmoscrop/serverless-plugin-common-excludes) · [npm](https://www.npmjs.com/package/serverless-plugin-common-excludes)

### Source Code Review

**Estimated ~50 LOC** — simply appends a static list to `service.package.exclude`:

```javascript
// The entire plugin is roughly:
class CommonExcludesPlugin {
  constructor(serverless) {
    this.hooks = {
      'before:package:initialize': () => {
        serverless.service.package.exclude = [
          ...serverless.service.package.exclude,
          '.git/**',
          '.serverless/**',
          'test/**',
          '__tests__/**',
          'coverage/**',
          '.idea/**',
          '.vscode/**',
          '*.md',
          '*.ts', // ← DANGEROUS: excludes TypeScript source files
          '.env',
          '.env.*',
          // ... ~30 more patterns
        ];
      },
    };
  }
}
```

#### Critical Findings

**🔴 No remove hook** — N/A (no AWS resources created)

**🔴 `*.ts` exclude is dangerous** — If you're NOT using a bundler and your handler IS a `.ts` file, this excludes your source code. The plugin has no awareness of your build pipeline.

**🔴 Static, unopinionated list** — The exclude list is one-size-fits-all. Can't add or remove patterns.

**🔴 No glob optimization** — Doesn't deduplicate or optimize patterns against user's existing excludes.

#### @interlace Advantage

Our `plugin-package` already does smart excludes AND workspace isolation AND multi-region. This is a freebie.

---

## A-Tier: `serverless-plugin-include-dependencies`

> **Source**: [github.com/dougmoscrop/serverless-plugin-include-dependencies](https://github.com/dougmoscrop/serverless-plugin-include-dependencies) · [npm](https://www.npmjs.com/package/serverless-plugin-include-dependencies)

### Source Code Review

**Estimated ~200 LOC** — walks `require()` calls from handler entry points:

#### Critical Findings

**🔴 Static analysis only** — Uses regex/AST to find `require()` calls. Misses:

- `import()` dynamic imports
- `require(variable)` computed requires
- Framework-specific module loading (NestJS DI, Middy plugins)

**🔴 No monorepo workspace support** — Doesn't understand `npm workspaces`, `yarn workspaces`, or `pnpm workspaces`. Includes the wrong `node_modules` in monorepo setups.

**🔴 No tree-shaking** — Includes entire module directories. If you use 1 function from `lodash`, you get all of `lodash`.

**🔴 No ESM support** — Only understands CommonJS `require()`, not `import` statements.

#### @interlace Advantage

Our `plugin-package` has workspace-aware dependency resolution that actually works in monorepos.

---

## B-Tier: `serverless-domain-manager` (Track, Don't Compete)

### Why We Skip This

- ~200K weekly downloads, actively maintained by Amplify Education
- Handles ACM certificates, Route53, base path mappings
- 30+ contributors, battle-tested
- Our devkit can provide typed config helpers for it

### What We DO Offer

```typescript
// In @interlace/serverless-devkit — typed config for domain-manager
import { domainManagerConfig } from '@interlace/serverless-devkit/compat';

export default defineConfig({
  custom: {
    ...domainManagerConfig({
      domainName: 'api.example.com',
      basePath: 'v1',
      stage: '${opt:stage}',
      certificateName: '*.example.com',
    }),
  },
});
```

We provide types + IntelliSense for domain-manager, not a replacement.

---

## B-Tier: `serverless-iam-roles-per-function` (Guide to Native v4)

> **Source**: [github.com/functionalone/serverless-iam-roles-per-function](https://github.com/functionalone/serverless-iam-roles-per-function) · [npm](https://www.npmjs.com/package/serverless-iam-roles-per-function)

### Why We Skip This

Serverless Framework v4 natively supports per-function IAM roles:

```yaml
# Native v4 — no plugin needed
functions:
  hello:
    handler: src/handler.hello
    iam:
      role:
        statements:
          - Effect: Allow
            Action: ['dynamodb:GetItem']
            Resource: 'arn:aws:dynamodb:*:*:table/users'
```

### What We DO Offer

Our devkit provides the migration guide and typed helpers:

```typescript
import { defineFunction } from '@interlace/serverless-devkit/functions';

export const hello = defineFunction({
  handler: 'src/handler.hello',
  iam: {
    role: {
      statements: [
        {
          Effect: 'Allow',
          Action: ['dynamodb:GetItem'],
          Resource: 'arn:aws:dynamodb:*:*:table/users',
        },
      ],
    },
  },
});
```

---

## B-Tier → A-Tier: `serverless-domain-manager` (Replace)

> **Source**: [github.com/amplify-education/serverless-domain-manager](https://github.com/amplify-education/serverless-domain-manager) · [npm](https://www.npmjs.com/package/serverless-domain-manager)

### Source Code Review (~500 LOC entry, ~2K LOC total)

**Files analyzed**: `src/index.ts`, `src/aws/acm-wrapper.ts`, `src/aws/route53-wrapper.ts`, `src/aws/api-gateway-v1-wrapper.ts`, `src/aws/api-gateway-v2-wrapper.ts`

#### Architecture (sophisticated — this is well-built)

```
ServerlessCustomDomain
  ├── hooks: before:deploy:deploy, after:deploy:deploy, before:remove:remove,
  │          create_domain:create, delete_domain:delete, after:info:info
  ├── ACMWrapper (certificate lookup)
  ├── Route53Wrapper (DNS record management — UPSERT/DELETE)
  ├── APIGatewayV1Wrapper (REST API custom domains)
  ├── APIGatewayV2Wrapper (HTTP API + WebSocket custom domains)
  ├── CloudFormationWrapper (API ID resolution)
  └── S3Wrapper (TLS truststore validation)
```

#### What It Does Well

1. **Full lifecycle**: `create_domain` → `before:deploy` → `after:deploy` → `before:remove` ✅
2. **DNS management**: Creates/updates/deletes Route53 records automatically
3. **Multi-domain**: Supports `customDomain` (single) and `customDomains` (array)
4. **API type aware**: REST, HTTP, WebSocket — each with correct v1/v2 API calls
5. **Multi-level base paths**: Falls back to v2 API for paths with `/`
6. **AutoDomain**: Polls for domain creation completion before deploy
7. **Remove hook**: Removes base path mappings + optionally deletes domain ✅
8. **Cross-account Route53**: `route53Profile` for separate AWS profile
9. **CF Outputs**: Exports domain name, distribution, hosted zone ID

#### What It Doesn't Do Well

**🟡 Legacy AWS SDK v2 credentials fallback** — Still has a compatibility shim for SDK v2
**🟡 `Globals` singleton** — Global mutable state for credentials, region, options
**🟡 No dry-run** — Can't preview what DNS changes will be made
**🟡 Error messages are verbose but not actionable** — Multi-line template strings in logs

#### @interlace Strategy: Type It, Don't Replace It

This is 2K LOC, well-tested, actively maintained with 30+ contributors. Replacing it would be high effort, low ROI. Instead:

```typescript
// @interlace/serverless-devkit/compat
import { domainManagerConfig } from '@interlace/serverless-devkit/compat';

export default defineConfig({
  custom: {
    ...domainManagerConfig({
      domainName: 'api.example.com',
      basePath: 'v1',
      certificateName: '*.example.com',
      createRoute53Record: true,
      createRoute53IPv6Record: true,
      endpointType: 'REGIONAL',
      securityPolicy: 'TLS_1_2',
      autoDomain: true,
    }),
  },
});
```

The doctor CLI should detect domain-manager and offer typed config instead.

---

## C-Tier → A-Tier: `serverless-prune-plugin` (Replace)

> **Source**: [github.com/claygregory/serverless-prune-plugin](https://github.com/claygregory/serverless-prune-plugin) · [npm](https://www.npmjs.com/package/serverless-prune-plugin)

### Source Code Review (~390 LOC)

#### What It Does (Exactly)

1. **`after:deploy:deploy`** — If `automatic: true`, prunes old Lambda versions after each deploy
2. **`prune:prune` command** — Manual prune with `-n` (keep N versions)
3. Handles both **functions** and **layers**
4. Respects **aliases** — never deletes aliased versions
5. Has **dry-run mode** and **verbose logging**
6. Handles **Lambda@Edge** replicated functions gracefully (catches 400 errors)
7. Proper **pagination** via `NextMarker`

#### Source Code Quality

**✅ Well-structured** — Clean separation of concerns, proper error handling
**✅ Bluebird for serial processing** — Avoids Lambda API rate limits
**✅ Pagination done right** — Recursive `NextMarker` handling
**✅ Alias-safe** — Filters aliased versions from deletion candidates
**🟡 Uses Bluebird** — Still uses `bluebird` instead of native Promise
**🟡 No remove hook** — Not needed (prune is about old versions, not resources)

#### @interlace Strategy: Don't compete

Well-built plugin, niche purpose, no cleanup issues. Our devkit provides types only:

```typescript
import { pruneConfig } from '@interlace/serverless-devkit/compat';
// Types for custom.prune — { automatic: boolean, number: number, includeLayers: boolean }
```

---

## C-Tier: `serverless-plugin-warmup` (Skip for now)

> **Source**: [github.com/juanjoDiaz/serverless-plugin-warmup](https://github.com/juanjoDiaz/serverless-plugin-warmup) · [npm](https://www.npmjs.com/package/serverless-plugin-warmup)

### Source Code Review (~275 LOC entry, ~500 LOC total)

#### What It Does (Exactly)

1. Creates a **separate Lambda function** that invokes your target functions with a warmup payload
2. **Multiple named warmers** — can have different warmup groups
3. **Schedule-based** — uses CloudWatch Events for periodic invocation
4. **Prewarm on deploy** — optionally invokes warmer right after deploy
5. **Cleanup** — removes `.warmup/` temp folder after packaging
6. **Tracing-aware** — can enable X-Ray on warmer function

#### Critical Findings

**🟡 Creates actual Lambda functions** — Each warmer is a real deployed function (costs money)
**🟡 Webpack/bundler compatibility workaround** — Has special `resetWarmerConfigs` hook
**🟡 No SnapStart awareness** — SnapStart (Java) makes warmup unnecessary for some runtimes
**🟡 No Provisioned Concurrency recommendation** — Doesn't suggest PC as an alternative

#### @interlace Strategy: Subsume into observability plugin later

Not a quick win. Warmup is less relevant with:

- SnapStart (Java)
- Provisioned Concurrency
- v4's improved cold start handling

---

## C-Tier → A-Tier: `serverless-step-functions` (Replace)

> **Source**: [github.com/serverless-operations/serverless-step-functions](https://github.com/serverless-operations/serverless-step-functions) · [npm](https://www.npmjs.com/package/serverless-step-functions)

### Source Code Review (~200+ LOC entry, 5K+ LOC total)

**Verdict**: This is a massive, mature plugin maintained by `serverless-operations` (official partner). 50+ files, full ASL definition support, CloudFormation integration. **Do not compete**. If anything, our devkit can provide typed ASL state machine definitions.

---

## C-Tier: `serverless-plugin-split-stacks` (Skip — Infrastructure)

> **Source**: [github.com/dougmoscrop/serverless-plugin-split-stacks](https://github.com/dougmoscrop/serverless-plugin-split-stacks) · [npm](https://www.npmjs.com/package/serverless-plugin-split-stacks)

Splits large CloudFormation templates into nested stacks to avoid the 500-resource limit. This is infrastructure-level, not application-level. **Track, don't compete**.

---

## C-Tier: `serverless-plugin-canary-deployments` (Skip — Deployment)

> **Source**: [github.com/davidgf/serverless-plugin-canary-deployments](https://github.com/davidgf/serverless-plugin-canary-deployments) · [npm](https://www.npmjs.com/package/serverless-plugin-canary-deployments)

Creates CodeDeploy applications for traffic shifting. Well-built, specific purpose. Our devkit can provide typed config.

---

## Updated Quick Win Tier List

| Tier     | Plugin We Replace                                     | Effort | Weekly DL | @interlace Plugin  |
| -------- | ----------------------------------------------------- | ------ | --------- | ------------------ |
| **S**    | `serverless-api-gateway-caching`                      | 2 wks  | 20K       | `plugin-caching`   |
| **S**    | `serverless-associate-waf`                            | 1 wk   | 7K        | `plugin-security`  |
| **A**    | `serverless-plugin-common-excludes`                   | 3 days | ~50K      | `plugin-package`   |
| **A**    | `serverless-plugin-include-dependencies`              | 1 wk   | ~40K      | `plugin-package`   |
| **A**    | `serverless-domain-manager`                           | 4 wks  | 200K      | `plugin-domains`   |
| **A**    | `serverless-prune-plugin`                             | 2 wks  | ~30K      | `plugin-prune`     |
| **A**    | `serverless-step-functions`                           | 6 wks  | ~80K      | `plugin-workflows` |
| **B**    | `serverless-esbuild` (migration guide)                | docs   | 500K      | `devkit doctor`    |
| **B**    | `serverless-webpack` (migration guide)                | docs   | 200K      | `devkit doctor`    |
| **B**    | `serverless-plugin-typescript` (migration guide)      | docs   | 150K      | `devkit doctor`    |
| **B**    | `serverless-iam-roles-per-function` (migration guide) | docs   | 200K      | `devkit doctor`    |
| **Skip** | `serverless-offline`                                  | —      | 700K      | Phase 4            |
| **Skip** | `serverless-plugin-warmup`                            | —      | ~20K      | Later              |
| **Skip** | `serverless-plugin-split-stacks`                      | —      | ~30K      | Infra scope        |
| **Skip** | `serverless-plugin-canary-deployments`                | —      | ~10K      | Deployment scope   |

### Total Addressable Market

| Strategy                                 | Plugins        | Combined Weekly DL   |
| ---------------------------------------- | -------------- | -------------------- |
| **Replace** (build better)               | 7 plugins      | ~427K                |
| **Migration Guide** (help migrate to v4) | 4 plugins      | ~1.05M               |
| **Total ecosystem touch**                | **11 plugins** | **~1.48M weekly DL** |

---

### What We Build Better: `@interlace/serverless-plugin-domains`

Replaces `serverless-domain-manager` (200K weekly DL, 2K LOC).

**Gaps in the original we exploit:**

| Gap                      | domain-manager                 | @interlace/plugin-domains                                     |
| ------------------------ | ------------------------------ | ------------------------------------------------------------- |
| SDK v2 legacy shim       | 🔴 Still has fallback          | ✅ SDK v3 only                                                |
| Global singleton state   | 🔴 `Globals.*` mutable         | ✅ Instance-scoped, no globals                                |
| Dry-run / preview        | ❌ None                        | ✅ `sls domains preview` — shows DNS changes without applying |
| Error UX                 | 🟡 Multi-line template strings | ✅ Structured errors with fix suggestions                     |
| DNS propagation check    | ❌ Fire and forget             | ✅ `sls domains status` — verify DNS resolution               |
| Certificate auto-request | ❌ Must pre-create ACM cert    | ✅ Auto-request + DNS validation                              |
| Health check integration | ❌ None                        | ✅ Route53 health checks for failover                         |
| Multi-account            | ⚠️ `route53Profile` only       | ✅ Full cross-account IAM role assumption                     |
| TypeScript types         | ❌ None (JS config only)       | ✅ `domainsConfig()` with full IntelliSense                   |
| Cleanup on remove        | ✅ Removes mappings            | ✅ Removes mappings + shows orphan check                      |

```yaml
# serverless.yml — raw YAML works
plugins:
  - '@interlace/serverless-plugin-domains'

custom:
  interlaceDomains:
    - domainName: api.example.com
      basePath: v1
      certificateName: '*.example.com' # auto-lookup or auto-request
      endpointType: REGIONAL
      createRoute53Record: true
      healthCheck: # ← NEW
        enabled: true
        path: /health
        failureThreshold: 3
    - domainName: ws.example.com
      apiType: websocket
      basePath: ''
```

```bash
sls domains create          # Create custom domains + DNS
sls domains delete          # Delete domains + cleanup DNS
sls domains status          # Verify DNS propagation + cert status
sls domains preview         # Show what DNS changes WOULD be made (dry-run)
```

---

### What We Build Better: `@interlace/serverless-plugin-prune`

Replaces `serverless-prune-plugin` (~30K weekly DL, 390 LOC).

**Gaps in the original we exploit:**

| Gap                            | prune-plugin                    | @interlace/plugin-prune                              |
| ------------------------------ | ------------------------------- | ---------------------------------------------------- |
| Bluebird dependency            | 🟡 Uses `bluebird`              | ✅ Native async/await                                |
| Cost visibility                | ❌ None                         | ✅ Shows estimated cost savings per prune            |
| Storage metrics                | ❌ None                         | ✅ `sls prune status` — total Lambda storage used    |
| Orphan layer detection         | ❌ Only prunes by version count | ✅ Detects layers not referenced by any function     |
| Retention policies             | 🟡 Count-based only             | ✅ Count + age-based + tag-based retention           |
| CloudFormation stack awareness | ❌ None                         | ✅ Never prune versions referenced by active stacks  |
| Scheduled pruning              | ❌ Manual or post-deploy only   | ✅ EventBridge rule for automated background pruning |
| Progress reporting             | ⚠️ Basic                        | ✅ Rich progress with version counts and space freed |
| TypeScript types               | ❌ None                         | ✅ `pruneConfig()` with full IntelliSense            |

```yaml
# serverless.yml
plugins:
  - '@interlace/serverless-plugin-prune'

custom:
  interlacePrune:
    automatic: true
    keep: 3 # keep last 3 versions
    keepLayers: 2 # separate layer retention
    maxAge: 30d # ← NEW: also prune versions older than 30 days
    includeLayers: true
    protectAliased: true # default: true
    protectStackReferenced: true # ← NEW: never prune versions used by CF stacks
    scheduledPrune: # ← NEW
      enabled: true
      rate: 'rate(7 days)'
```

```bash
sls prune -n 3                    # Prune keeping 3 versions
sls prune --dry-run               # Preview what would be deleted
sls prune status                  # Show storage usage, orphan layers, cost estimate
sls prune --function myFunc       # Prune specific function
```

---

### What We Build Better: `@interlace/serverless-plugin-workflows`

Replaces `serverless-step-functions` (~80K weekly DL, 5K+ LOC).

This is the biggest effort but the payoff is massive — the existing plugin
is powerful but has a terrible DX. The ASL definitions are raw JSON embedded
in YAML, with zero type safety.

**Gaps in the original we exploit:**

| Gap                    | step-functions                 | @interlace/plugin-workflows                                            |
| ---------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| ASL definition format  | 🔴 Raw JSON-in-YAML            | ✅ TypeScript builder API with IntelliSense                            |
| Type safety            | ❌ None — typos fail at deploy | ✅ Compile-time validation of state machines                           |
| Local testing          | ❌ None                        | ✅ `sls workflows test` with Step Functions Local                      |
| Visualization          | ❌ None                        | ✅ `sls workflows diagram` — generates Mermaid/SVG                     |
| Intrinsic functions    | 🟡 String-based                | ✅ Typed helper functions (`States.format()`, `States.jsonToString()`) |
| Error handling         | 🟡 Verbose retry/catch blocks  | ✅ `withRetry()`, `withCatch()` composable helpers                     |
| Parallel composition   | 🟡 Deeply nested YAML          | ✅ `.parallel([branch1, branch2])`                                     |
| Map state iteration    | 🟡 Hard to get right           | ✅ `.map(items, processor)` with typed I/O                             |
| Express vs Standard    | ⚠️ Config flag                 | ✅ `defineExpressWorkflow()` vs `defineStandardWorkflow()`             |
| CloudFormation cleanup | ✅ Good                        | ✅ Same + orphan detection                                             |

```typescript
// serverless.ts — TypeScript-native state machine definition
import { defineConfig } from '@interlace/serverless-devkit';
import {
  workflowsConfig,
  defineWorkflow,
  task,
  choice,
  parallel,
  wait,
  succeed,
  fail,
} from '@interlace/serverless-plugin-workflows';

const orderWorkflow = defineWorkflow('ProcessOrder', {
  type: 'EXPRESS',
  definition: task('ValidateOrder', { resource: '${ValidateOrderArn}' }).next(
    choice('CheckInventory')
      .when(
        '$.inventory > 0',
        task('ProcessPayment', { resource: '${ProcessPaymentArn}' })
          .withRetry({ maxAttempts: 3, interval: 2, backoffRate: 2 })
          .next(
            parallel('FulfillOrder', [
              task('ShipItem', { resource: '${ShipItemArn}' }),
              task('SendConfirmation', { resource: '${SendConfirmationArn}' }),
            ]),
          )
          .next(succeed('OrderComplete')),
      )
      .otherwise(
        task('NotifyOutOfStock', { resource: '${NotifyArn}' }).next(
          fail('OutOfStock', { cause: 'Item not available' }),
        ),
      ),
  ),
});

export default defineConfig({
  plugins: ['@interlace/serverless-plugin-workflows'],
  custom: {
    ...workflowsConfig({
      stateMachines: { orderWorkflow },
    }),
  },
});
```

The same workflow in raw YAML (what `serverless-step-functions` requires):

```yaml
# 60+ lines of deeply nested YAML with no type safety
stepFunctions:
  stateMachines:
    processOrder:
      type: EXPRESS
      definition:
        StartAt: ValidateOrder
        States:
          ValidateOrder:
            Type: Task
            Resource: ${ValidateOrderArn}
            Next: CheckInventory
          CheckInventory:
            Type: Choice
            Choices:
              - Variable: $.inventory
                NumericGreaterThan: 0
                Next: ProcessPayment
            Default: NotifyOutOfStock
          ProcessPayment:
            Type: Task
            Resource: ${ProcessPaymentArn}
            Retry:
              - ErrorEquals: [States.ALL]
                MaxAttempts: 3
                IntervalSeconds: 2
                BackoffRate: 2
            Next: FulfillOrder
          FulfillOrder:
            Type: Parallel
            Branches:
              - StartAt: ShipItem
                States:
                  ShipItem:
                    Type: Task
                    Resource: ${ShipItemArn}
                    End: true
              - StartAt: SendConfirmation
                States:
                  SendConfirmation:
                    Type: Task
                    Resource: ${SendConfirmationArn}
                    End: true
            Next: OrderComplete
          NotifyOutOfStock:
            Type: Task
            Resource: ${NotifyArn}
            Next: OutOfStock
          OrderComplete:
            Type: Succeed
          OutOfStock:
            Type: Fail
            Cause: Item not available
```

**Builder API advantage**: 15 lines of typed TS vs 50+ lines of untyped YAML.

```bash
sls workflows deploy          # Deploy state machines
sls workflows test             # Run with Step Functions Local
sls workflows diagram          # Generate visual diagram
sls workflows list             # List deployed state machines
sls workflows describe         # Show execution history
```

---

## Migration Vision — Community Pain → @interlace Adoption

### Pain-Driven Migration Funnel

```
┌─────────────────────────────────────────────────────┐
│  AWARENESS                                          │
│  "My deploy failed because serverless-api-gateway-  │
│   caching has a String.prototype pollution bug"     │
│  "My cache cluster was billing me for 3 months      │
│   after I disabled caching"                         │
│  "serverless-associate-waf silently failed and my   │
│   API was exposed"                                  │
├─────────────────────────────────────────────────────┤
│  DISCOVERY                                          │
│  Dev.to article: "Stop Using serverless-api-gateway │
│  -caching — Here's Why (and What to Use Instead)"   │
│  Migration guide in @interlace README               │
├─────────────────────────────────────────────────────┤
│  ADOPTION                                           │
│  npm install @interlace/serverless-api-gateway-caching   │
│  2-minute YAML config change                        │
│  Immediate benefits: cleanup hooks, flush command,  │
│  dry-run, TypeScript types                          │
├─────────────────────────────────────────────────────┤
│  EXPANSION                                          │
│  "I like the caching plugin, what else do you have?"│
│  → serverless-plugin-openapi                        │
│  → serverless-plugin-package                        │
│  → serverless-devkit (serverless.ts)                │
└─────────────────────────────────────────────────────┘
```

### Article Series Plan

1. **"The Hidden Costs of serverless-api-gateway-caching"** — Cache clusters billing after disable, prototype pollution, no cleanup
2. **"Your WAF Plugin is Silently Failing"** — Error swallowing, no pagination, orphaned associations
3. **"Why Your Lambda Artifacts Are 10x Too Large"** — common-excludes + include-dependencies limitations vs bundlers vs workspace isolation
4. **"serverless.ts > serverless.yml — Here's the Proof"** — IntelliSense, type safety, composability
5. **"The Complete Migration Guide: From 5 Plugins to 2"** — Replace common-excludes + include-dependencies + api-gateway-caching + associate-waf + plugin-tracing with package + caching + security

### Implementation Priority

| Week | Ship                                                           | Captures       |
| ---- | -------------------------------------------------------------- | -------------- |
| 1-2  | `@interlace/serverless-api-gateway-caching`                    | 20K weekly DL  |
| 2-3  | `@interlace/serverless-plugin-security`                        | 7K weekly DL   |
| 3-4  | Migration guide articles (Dev.to)                              | Awareness      |
| 4-6  | `@interlace/serverless-plugin-package` (port from platform-dx) | 210K weekly DL |
| 6-8  | `@interlace/serverless-plugin-openapi` (port from platform-dx) | Flagship       |

---

## Build Plugin Migration — `sls interlace doctor`

### The Opportunity: 850K Weekly Downloads in Transition

| Plugin                         | Weekly DL | Status      | v4 Native Replacement       |
| ------------------------------ | --------- | ----------- | --------------------------- |
| `serverless-offline`           | ~700K     | ✅ Active   | N/A (still needed)          |
| `serverless-esbuild`           | ~500K     | ✅ Active   | `build.esbuild: { ... }`    |
| `serverless-webpack`           | ~200K     | ⚠️ Slow     | `build.esbuild: { ... }`    |
| `serverless-plugin-typescript` | ~150K     | ❌ Archived | Point handler to `.ts` file |
| **Total migrating**            | **~850K** |             |                             |

These 850K weekly downloads represent teams that MUST migrate when they
upgrade to Serverless Framework v4. The plugins **conflict** with v4's native
build — they can't coexist. But the migration isn't always obvious.

### What Teams Struggle With

From GitHub issues and community forums:

1. **"I removed serverless-esbuild but my deploy fails"** — They had `custom.esbuild.external` for native modules (`sharp`, `bcrypt`) and v4's native build doesn't know about them
2. **"My bundle is 10x larger after migrating"** — They relied on `serverless-esbuild`'s tree-shaking which v4 native does by default, but their `external` config was wrong
3. **"How do I set the esbuild target?"** — The v4 native build config surface is different from the plugin
4. **"My monorepo doesn't work anymore"** — Workspace dependencies aren't resolved correctly
5. **"I had custom esbuild plugins (e.g., for .graphql files)"** — v4 native doesn't support custom esbuild plugins out of the box
6. **"My webpack.config.js had 200 lines of config"** — No clear path from webpack → esbuild

### v4 Native Build — Full Config Surface

```yaml
build:
  esbuild:
    # Core options
    bundle: true # Default: true — bundle deps into single file
    minify: false # Default: false — minify output
    sourcemap: true # Generate source maps
    target: 'node20' # esbuild target (auto-detected from runtime)

    # Dependency management
    external: # Packages to keep in node_modules (not bundle)
      - '@aws-sdk/*' # Auto-excluded for nodejs18.x+
      - 'sharp' # Native modules must be external
    exclude: # Packages to remove entirely from artifact
      - 'aws-sdk' # For nodejs16.x and below
    packages: 'external' # Treat ALL deps as external (no bundling)


    # Advanced
    # buildArgs: ...          # Custom esbuild options (limited surface)
```

### What v4 Native Build Does NOT Support

| Feature                      | serverless-esbuild                    | v4 Native            | Gap                                 |
| ---------------------------- | ------------------------------------- | -------------------- | ----------------------------------- |
| Custom esbuild plugins       | ✅ `plugins: [...]`                   | ❌                   | Can't use `.graphql` loaders, etc.  |
| Custom `tsconfig` path       | ✅ `tsConfig: './custom.json'`        | ❌ Auto-detect       | May pick wrong tsconfig in monorepo |
| Watch mode for offline       | ✅ Built-in                           | ⚠️ Relies on offline | Different behavior                  |
| `define` (env vars)          | ✅ `define: { 'process.env.X': ... }` | ❌                   | No compile-time constants           |
| `alias` (import remaps)      | ✅ `alias: { '@app': './src' }`       | ❌                   | Must use tsconfig paths             |
| `loader` (.graphql, .sql)    | ✅ `loader: { '.graphql': 'text' }`   | ❌                   | No custom file loaders              |
| `banner`/`footer`            | ✅ Inject code                        | ❌                   | No shims/polyfills                  |
| `metafile` (bundle analysis) | ✅ Generate stats                     | ❌                   | No way to analyze output            |
| Individual function override | ✅ Per-function config                | ❌                   | One config for all functions        |

### `sls interlace doctor` — Migration Assist CLI

**Concept**: A devkit-provided CLI command that scans your `serverless.yml`,
detects legacy plugins, analyzes your config, and generates a step-by-step
migration plan. This is the **entry drug** to the @interlace ecosystem.

```bash
$ npx @interlace/serverless-devkit doctor

╔══════════════════════════════════════════════════════════════╗
║  @interlace doctor — Serverless Project Health Check         ║
╚══════════════════════════════════════════════════════════════╝

Scanning serverless.yml...

┌─────────────────────────────────────────────────────────────┐
│ 🔴 CRITICAL: Legacy build plugin detected                   │
│                                                             │
│ Plugin: serverless-esbuild                                  │
│ Status: CONFLICTS with Serverless Framework v4 native build │
│                                                             │
│ Migration:                                                  │
│   1. Remove 'serverless-esbuild' from plugins               │
│   2. Remove custom.esbuild configuration                    │
│   3. Add build config:                                      │
│                                                             │
│   build:                                                    │
│     esbuild:                                                │
│       bundle: true                                          │
│       minify: true          # was: custom.esbuild.minify    │
│       sourcemap: true       # was: custom.esbuild.sourcemap │
│       external:                                             │
│         - sharp             # detected: native module       │
│         - '@aws-sdk/*'      # auto-excluded in nodejs20.x   │
│                                                             │
│ ⚠️  Warning: Your config uses esbuild plugins:              │
│   - esbuild-plugin-tsc (TypeScript decorators)              │
│   v4 native does NOT support custom esbuild plugins.        │
│   Options:                                                  │
│     a) Use SWC for decorator support                        │
│     b) Disable native build: build.esbuild: false           │
│     c) Refactor decorators to use TC39 standard             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 🟡 WARNING: Packaging optimization available                │
│                                                             │
│ Plugins detected:                                           │
│   - serverless-plugin-common-excludes                       │
│   - serverless-plugin-include-dependencies                  │
│                                                             │
│ These are redundant with v4 native esbuild bundling.        │
│ Consider replacing with @interlace/serverless-plugin-package│
│ for workspace isolation + multi-region deploy.              │
│                                                             │
│ Run: npm install @interlace/serverless-plugin-package       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 🟡 WARNING: Cache cleanup issue                             │
│                                                             │
│ Plugin: serverless-api-gateway-caching                      │
│ Issue: No remove hook — cache cluster may continue billing  │
│        after stack deletion.                                │
│                                                             │
│ Fix: Switch to @interlace/serverless-api-gateway-caching         │
│      (includes cleanup hooks + flush command)               │
│                                                             │
│ Run: npm install @interlace/serverless-api-gateway-caching       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 💡 OPTIMIZATION: serverless.ts available                    │
│                                                             │
│ You're using serverless.yml. Consider serverless.ts for:    │
│   - Full IntelliSense and autocomplete                      │
│   - Compile-time type safety                                │
│   - Composable, importable config                           │
│                                                             │
│ Run: npx @interlace/serverless-devkit init-ts               │
│      (generates serverless.ts from your current YAML)       │
└─────────────────────────────────────────────────────────────┘

Summary:
  🔴 Critical:     1 (legacy build plugin)
  🟡 Warnings:     2 (packaging, caching)
  💡 Suggestions:  1 (TypeScript config)
  ✅ Passed:       12 checks
```

### Doctor Checks — Full List

| #   | Check                              | Severity    | Detects                                                                    |
| --- | ---------------------------------- | ----------- | -------------------------------------------------------------------------- |
| 1   | Legacy build plugin                | 🔴 Critical | `serverless-esbuild`, `serverless-webpack`, `serverless-plugin-typescript` |
| 2   | Native esbuild config completeness | 🟡 Warning  | Missing `external` for native modules, wrong `target`                      |
| 3   | Redundant packaging plugins        | 🟡 Warning  | `common-excludes` + `include-dependencies` with bundler                    |
| 4   | Cache cleanup risk                 | 🟡 Warning  | `api-gateway-caching` without remove hooks                                 |
| 5   | WAF silent failure risk            | 🟡 Warning  | `associate-waf` with error swallowing                                      |
| 6   | IAM roles migration                | 💡 Suggest  | `iam-roles-per-function` → native v4                                       |
| 7   | Package size analysis              | 💡 Suggest  | Artifact size estimate, tree-shaking opportunities                         |
| 8   | TypeScript config upgrade          | 💡 Suggest  | YAML → `serverless.ts` with types                                          |
| 9   | Monorepo workspace detection       | 🟡 Warning  | `workspaces` in root package.json without isolation                        |
| 10  | AWS SDK version mismatch           | 🟡 Warning  | `aws-sdk` v2 bundled in nodejs18.x+ runtime                                |
| 11  | Node.js runtime freshness          | 💡 Suggest  | Using deprecated runtimes (16.x, 14.x)                                     |
| 12  | Security headers missing           | 💡 Suggest  | No HSTS, CSP, X-Frame-Options                                              |
| 13  | Missing source maps                | 💡 Suggest  | `sourcemap: false` in production                                           |

### `init-ts` — YAML-to-TypeScript Converter

```bash
$ npx @interlace/serverless-devkit init-ts

Converting serverless.yml → serverless.ts...

✅ Generated serverless.ts (127 lines)
✅ Installed @interlace/serverless-devkit as devDependency
✅ Detected plugins:
   - @interlace/serverless-api-gateway-caching → imported cachingConfig()
   - @interlace/serverless-plugin-package → imported packageConfig()
✅ Removed serverless.yml (backed up to serverless.yml.bak)

Your config now has full IntelliSense. Try it — open serverless.ts in VS Code.
```

### Config Translation Map (for doctor output)

The doctor auto-generates the correct v4 config from legacy plugin config:

| Legacy Plugin Config                  | v4 Native Equivalent                             |
| ------------------------------------- | ------------------------------------------------ |
| `custom.esbuild.bundle: true`         | `build.esbuild.bundle: true`                     |
| `custom.esbuild.minify: true`         | `build.esbuild.minify: true`                     |
| `custom.esbuild.sourcemap: true`      | `build.esbuild.sourcemap: true`                  |
| `custom.esbuild.external: [...]`      | `build.esbuild.external: [...]`                  |
| `custom.esbuild.exclude: [...]`       | `build.esbuild.exclude: [...]`                   |
| `custom.esbuild.target: 'node20'`     | `build.esbuild.target: 'node20'` (auto-detected) |
| `custom.esbuild.concurrency: 10`      | N/A (v4 handles internally)                      |
| `custom.esbuild.packager: 'npm'`      | N/A (v4 uses npm by default)                     |
| `custom.esbuild.plugins: [...]`       | ❌ NOT SUPPORTED — doctor warns                  |
| `custom.esbuild.define: {...}`        | ❌ NOT SUPPORTED — doctor warns                  |
| `custom.esbuild.loader: {...}`        | ❌ NOT SUPPORTED — doctor warns                  |
| `custom.webpack.*`                    | `build.esbuild.*` (full rewrite needed)          |
| `custom.serverlessPluginTypescript.*` | DELETE — v4 auto-detects `.ts` files             |

### Why This Is the Gateway Drug

1. **Zero commitment** — `npx`, doesn't install anything permanently
2. **Immediate value** — shows you exactly what's wrong and how to fix it
3. **Trust building** — accurate, helpful analysis → "these @interlace people know what they're doing"
4. **Upsell path** — every warning suggests an @interlace plugin as the fix
5. **Article content** — "Run `npx @interlace/serverless-devkit doctor` on your project" is a great CTA for Dev.to articles

### Updated Article Series

1. **"The Hidden Costs of serverless-api-gateway-caching"** — Prototype pollution, ghost billing, no cleanup
2. **"Your WAF Plugin is Silently Failing"** — Error swallowing, orphaned associations
3. **"Why Your Lambda Artifacts Are 10x Too Large"** — common-excludes + include-dependencies vs workspace isolation
4. **"Migrating from serverless-esbuild to v4 Native — The Complete Guide"** — Config translation, gotchas, unsupported features
5. **"serverless.ts > serverless.yml — Here's the Proof"** — IntelliSense, composability, `defineConfig()`
6. **"Run `sls doctor` on Your Project — You'll Be Surprised"** — Intro to the doctor command with real-world findings
