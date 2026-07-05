# Serverless Plugin Ecosystem — Knowledge Base

> Comprehensive reference of every major community plugin, what it does,
> its limitations, and how `@interlace` alternatives improve on them.
> This is the authoritative source for migration planning.

---

## Table of Contents

1. [Build & Bundling](#1-build--bundling)
2. [Local Development](#2-local-development)
3. [Deployment & Packaging](#3-deployment--packaging)
4. [API Management](#4-api-management)
5. [Security & IAM](#5-security--iam)
6. [Documentation & OpenAPI](#6-documentation--openapi)
7. [Observability & Logging](#7-observability--logging)
8. [Environment & Configuration](#8-environment--configuration)
9. [Performance & Caching](#9-performance--caching)
10. [Workflow Orchestration](#10-workflow-orchestration)
11. [Static Assets & Storage](#11-static-assets--storage)
12. [NestJS Integration](#12-nestjs-integration)
13. [Our Custom Plugins (from platform-dx)](#13-our-custom-plugins-from-platform-dx)
14. [Top 20 Community Plugins — Ranked](#14-top-20-community-plugins--ranked)
15. [Updated @interlace Fleet — Full Roadmap](#15-updated-interlace-fleet--full-roadmap)
16. [Migration Quick-Reference](#16-migration-quick-reference)

---

## 1. Build & Bundling

### `serverless-esbuild`

| Field                | Value                                    |
| -------------------- | ---------------------------------------- |
| **npm**              | `serverless-esbuild`                     |
| **Weekly Downloads** | ~500K+                                   |
| **Maintained**       | ✅ Active (floydspace)                   |
| **GitHub**           | github.com/floydspace/serverless-esbuild |

**What it does**: Integrates esbuild as the bundler for Serverless Framework. Transpiles TypeScript/JavaScript, tree-shakes, minifies, and produces individually packaged zip artifacts per Lambda function.

**Key features**:

- `bundle: true` — single-file output with tree-shaking
- `minify: true` — reduces artifact size
- `sourcemap: true` — debugging support
- `external: [...]` — exclude packages (e.g., `aws-sdk`)
- File watching for `serverless-offline` integration
- Lambda Layer support
- `individually: true` packaging

**Limitations**:

- ⚠️ **v4 conflict**: Serverless Framework v4 has native esbuild support via the `build` property. Using `serverless-esbuild` alongside v4's native build causes errors
- ⚠️ No TypeScript type-checking (esbuild strips types without validation)
- ⚠️ Complex monorepo configurations require manual `external` management

**@interlace opportunity**: **Low** — v4 native build replaces this. Our devkit should document the migration path.

**Migration**: Remove `serverless-esbuild` from plugins, use v4 native:

```yaml
# Before (v3 + serverless-esbuild)
plugins:
  - serverless-esbuild
custom:
  esbuild:
    bundle: true
    minify: true
    sourcemap: true

# After (v4 native)
build:
  esbuild:
    bundle: true
    minify: true
    sourcemap: true
```

---

### `serverless-plugin-typescript` ❌ ARCHIVED

| Field                | Value                                              |
| -------------------- | -------------------------------------------------- |
| **npm**              | `serverless-plugin-typescript`                     |
| **Weekly Downloads** | ~150K (declining)                                  |
| **Maintained**       | ❌ Archived                                        |
| **GitHub**           | github.com/serverless/serverless-plugin-typescript |

**What it does**: Compiles TypeScript via `tsc` before packaging. No bundling, no tree-shaking — just transpilation.

**Limitations**:

- ❌ **Archived** — no longer maintained
- ❌ Peer dependency only supports Serverless v2/v3 (`"serverless": "2 || 3"`)
- ❌ Includes entire `node_modules` — massive artifacts
- ❌ No tree-shaking, no minification
- ❌ Slow — full `tsc` compilation vs esbuild

**@interlace opportunity**: **Critical** — 150K weekly downloads on a dead plugin. Our devkit should provide the migration guide.

**Migration**: Switch to v4 native build:

```yaml
# Before (serverless-plugin-typescript)
plugins:
  - serverless-plugin-typescript
custom:
  serverlessPluginTypescript:
    tsConfigFileLocation: ./tsconfig.json

# After (v4 native — zero config!)
# Just point your handler to a .ts file. That's it.
functions:
  hello:
    handler: src/handler.hello # .ts file, auto-transpiled
```

---

### `serverless-webpack`

| Field                | Value                |
| -------------------- | -------------------- |
| **npm**              | `serverless-webpack` |
| **Weekly Downloads** | ~200K (declining)    |
| **Maintained**       | ⚠️ Slow              |

**What it does**: Integrates Webpack as bundler. Full control over build pipeline with Webpack's vast plugin ecosystem.

**Limitations**:

- ⚠️ Webpack is significantly slower than esbuild
- ⚠️ Complex configuration (webpack.config.js)
- ⚠️ v4 native build conflict
- ⚠️ Overkill for most Lambda functions

**@interlace opportunity**: **Low** — same migration path as esbuild → v4 native.

---

## 2. Local Development

### `serverless-offline`

| Field                | Value                                  |
| -------------------- | -------------------------------------- |
| **npm**              | `serverless-offline`                   |
| **Weekly Downloads** | ~700K+                                 |
| **Maintained**       | ✅ Active (dherault)                   |
| **GitHub**           | github.com/dherault/serverless-offline |

**What it does**: Emulates AWS Lambda and API Gateway locally. The most popular Serverless Framework plugin by far.

**Key features**:

- HTTP API and REST API emulation
- WebSocket support
- Lambda-to-Lambda invocation
- SQS/SNS/DynamoDB Streams (via companion plugins)
- `--reloadHandler` for hot reload
- `--noPrependStageInUrl` for clean local URLs
- Custom authorizer support

**Limitations**:

- ⚠️ API Gateway emulation is imperfect (CORS, auth edge cases)
- ⚠️ No native Step Functions or EventBridge emulation
- ⚠️ Memory leaks in long-running sessions
- ⚠️ No built-in middleware pipeline integration

**@interlace opportunity**: **Low priority** — we have a fork (`@snappygifts/serverless-offline` v15.2.2) but it's best to track upstream. We can contribute patches.

---

### `serverless-offline-scheduler`

| Field                | Value                          |
| -------------------- | ------------------------------ |
| **npm**              | `serverless-offline-scheduler` |
| **Weekly Downloads** | ~5K                            |
| **Maintained**       | ❌ Stale (last release 2020)   |

**What it does**: Emulates CloudWatch scheduled events (`rate()` / `cron()`) locally alongside `serverless-offline`.

**Limitations**:

- ❌ Last published 2020 — likely broken on v4
- ❌ No TypeScript types
- ❌ Limited configuration options

**@interlace opportunity**: **Medium** — could absorb into an enhanced offline plugin or devkit utility.

---

## 3. Deployment & Packaging

### `serverless-plugin-common-excludes`

| Field                | Value                               |
| -------------------- | ----------------------------------- |
| **npm**              | `serverless-plugin-common-excludes` |
| **Weekly Downloads** | ~50K                                |
| **Maintained**       | ⚠️ Stale (dougmoscrop)              |

**What it does**: Automatically adds common junk files to `package.exclude` — test files, dotfiles, README, docs, etc. Reduces artifact size without manual configuration.

**Default excludes**: `.git`, `.serverless`, `tests`, `__tests__`, `.idea`, `.vscode`, `*.md`, `*.ts` (source), `coverage`, etc.

**Limitations**:

- ⚠️ Static exclude list — doesn't analyze actual usage
- ⚠️ Can accidentally exclude needed files (e.g., `.md` files used as templates)
- ⚠️ Redundant with bundlers (esbuild/webpack already produce minimal output)

**@interlace opportunity**: **High** — absorb into `@interlace/serverless-plugin-package`.

**Migration**:

```yaml
# Before
plugins:
  - serverless-plugin-common-excludes

# After
plugins:
  - '@interlace/serverless-plugin-package'
# Smart excludes built-in, plus multi-region deploy + workspace isolation
```

---

### `serverless-plugin-include-dependencies`

| Field                | Value                                    |
| -------------------- | ---------------------------------------- |
| **npm**              | `serverless-plugin-include-dependencies` |
| **Weekly Downloads** | ~60K                                     |
| **Maintained**       | ⚠️ Slow (dougmoscrop)                    |

**What it does**: Scans handler code to identify which `node_modules` are actually required, then includes only those in the artifact. Complement to `common-excludes`.

**Limitations**:

- ⚠️ Static analysis is fragile — misses dynamic `require()` calls
- ⚠️ No tree-shaking (includes entire module directories)
- ⚠️ Doesn't understand monorepo workspace resolution
- ⚠️ Redundant with bundlers

**@interlace opportunity**: **High** — our `serverless-plugin-package` handles this better with workspace-aware isolation.

**Migration**: Same as above — use `@interlace/serverless-plugin-package`.

---

## 4. API Management

### `serverless-domain-manager`

| Field                | Value                                                  |
| -------------------- | ------------------------------------------------------ |
| **npm**              | `serverless-domain-manager`                            |
| **Weekly Downloads** | ~200K+                                                 |
| **Maintained**       | ✅ Active (amplify-education)                          |
| **GitHub**           | github.com/amplify-education/serverless-domain-manager |

**What it does**: Creates and manages custom domain names for API Gateway (REST, HTTP, WebSocket). Handles Route53 DNS records and ACM certificate validation.

**Key features**:

- Custom domain creation for REST API, HTTP API, WebSocket
- Multi-region domain support
- Route53 record management
- ACM certificate association
- Base path mapping
- Stage-specific domains

**Limitations**:

- ⚠️ Complex multi-domain setups require verbose configuration
- ⚠️ Certificate must be pre-created in ACM

**@interlace opportunity**: **Low** — well-maintained, mature. No need to compete. Our `serverless-devkit` can provide typed configuration helpers.

---

### `serverless-associate-waf`

| Field                | Value                      |
| -------------------- | -------------------------- |
| **npm**              | `serverless-associate-waf` |
| **Weekly Downloads** | ~5K                        |
| **Maintained**       | ⚠️ Stale                   |

**What it does**: Associates a regional AWS WAF Web ACL with the API Gateway created by the Serverless stack. Simple config:

```yaml
custom:
  associateWaf:
    name: 'my-web-acl-name'
```

**Limitations**:

- ⚠️ Only handles WAF → APIGW association (one-trick)
- ⚠️ No WAFv2 resource creation
- ⚠️ No TypeScript types
- ⚠️ No IP set management, rate limiting rules, or geo-blocking

**@interlace opportunity**: **High** — absorb into `@interlace/serverless-plugin-security`.

**Migration**:

```yaml
# Before
plugins:
  - serverless-associate-waf
custom:
  associateWaf:
    name: 'my-web-acl'

# After
plugins:
  - '@interlace/serverless-plugin-security'
custom:
  interlaceSecurity:
    waf:
      name: 'my-web-acl'
    # Plus: tracing, cross-account access, security headers — all in one plugin
```

---

## 5. Security & IAM

### `serverless-iam-roles-per-function`

| Field                | Value                               |
| -------------------- | ----------------------------------- |
| **npm**              | `serverless-iam-roles-per-function` |
| **Weekly Downloads** | ~200K+                              |
| **Maintained**       | ⚠️ Slow (RC versions in prod)       |

**What it does**: Creates a dedicated IAM role per Lambda function with function-specific `iamRoleStatements`, instead of the default shared role.

**Key features**:

- Per-function IAM roles (least privilege)
- Inherits provider-level statements
- Custom role naming (`iamRoleStatementsName`)
- Auto-includes CloudWatch Logs, VPC, stream permissions

**Limitations**:

- ⚠️ **Native replacement**: Serverless Framework v4 supports `functions.<name>.iam.role` natively
- ⚠️ TypeScript issues — `iamRoleStatements` not in official types (requires `@ts-ignore`)
- ⚠️ 64-character IAM role name limit causes failures in long service/function names
- ⚠️ Conflicts with `role` property on functions

**@interlace opportunity**: **Medium** — native v4 support makes this less critical. Our devkit should document the migration.

**Migration** (to native v4):

```yaml
# Before (plugin)
plugins:
  - serverless-iam-roles-per-function
functions:
  hello:
    handler: src/handler.hello
    iamRoleStatements:
      - Effect: Allow
        Action: ['dynamodb:GetItem']
        Resource: 'arn:aws:dynamodb:*:*:table/users'

# After (native v4)
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

---

### `serverless-plugin-lambda-account-access`

| Field                | Value                                     |
| -------------------- | ----------------------------------------- |
| **npm**              | `serverless-plugin-lambda-account-access` |
| **Weekly Downloads** | ~2K                                       |
| **Maintained**       | ⚠️ Stale (rschick)                        |

**What it does**: Adds cross-account Lambda invoke permissions. Allows specific AWS accounts to call your Lambda functions.

**@interlace opportunity**: **Medium** — absorb into `@interlace/serverless-plugin-security`.

---

## 6. Documentation & OpenAPI

### `serverless-aws-documentation` ❌ STALE

| Field          | Value                          |
| -------------- | ------------------------------ |
| **npm**        | `serverless-aws-documentation` |
| **Maintained** | ❌ Stale                       |

**What it does**: Adds API Gateway documentation models and request/response schemas to your Serverless config.

**Limitations**:

- ❌ No OpenAPI 3.x support (stuck on Swagger 2.0)
- ❌ No SDK generation
- ❌ No request validation
- ❌ No Swagger UI hosting
- ❌ No Zod schema integration

**@interlace opportunity**: **Critical** — our OpenAPI plugin is a 100x improvement.

**Migration**:

```yaml
# Before (serverless-aws-documentation)
plugins:
  - serverless-aws-documentation
custom:
  documentation:
    models:
      - name: UserRequest
        contentType: application/json
        schema: { ... }

# After (@interlace/serverless-plugin-openapi)
plugins:
  - '@interlace/serverless-plugin-openapi'
# Full OpenAPI 3.1 spec, Swagger UI, Zod schemas, SDK generation,
# spec diffing, request/response validation — all from one plugin.
# Define routes with defineRoute() and get everything auto-generated.
```

---

## 7. Observability & Logging

### `serverless-plugin-tracing` ❌ STALE

| Field          | Value                       |
| -------------- | --------------------------- |
| **npm**        | `serverless-plugin-tracing` |
| **Maintained** | ❌ Stale                    |

**What it does**: Enables X-Ray tracing on Lambda functions.

**Limitations**:

- ❌ Only X-Ray (no OTel support)
- ❌ No per-function configuration
- ❌ No correlation with API Gateway tracing

**@interlace opportunity**: **High** — absorb into `@interlace/serverless-plugin-security` or `observability`.

---

### `serverless-log-forwarding`

| Field                | Value                       |
| -------------------- | --------------------------- |
| **npm**              | `serverless-log-forwarding` |
| **Weekly Downloads** | ~15K                        |
| **Maintained**       | ⚠️ Stale                    |

**What it does**: Sets up CloudWatch Logs subscription filters to forward logs to a destination Lambda (e.g., for shipping to Datadog, Splunk, Elastic).

**Limitations**:

- ⚠️ Only Lambda destinations (no Kinesis, Firehose)
- ⚠️ No per-function log group configuration
- ⚠️ No filter pattern customization
- ⚠️ No OTel-native forwarding

**@interlace opportunity**: **Medium** — candidate for `@interlace/serverless-plugin-observability`.

---

### `serverless-export-env`

| Field                | Value                   |
| -------------------- | ----------------------- |
| **npm**              | `serverless-export-env` |
| **Weekly Downloads** | ~10K                    |
| **Maintained**       | ⚠️ Stale                |

**What it does**: Exports resolved environment variables from `serverless.yml` to a local `.env` file. Resolves SSM parameters, CloudFormation intrinsic functions, and `${self:...}` references.

**Limitations**:

- ⚠️ Requires deployment to resolve CloudFormation values
- ⚠️ No encrypted `.env` support
- ⚠️ No per-function `.env` generation

**@interlace opportunity**: **Medium** — candidate for devkit utility or observability plugin.

---

## 8. Environment & Configuration

### Summary Table

| Plugin                     | Weekly DL | Status    | What                                           | @interlace Replaces With |
| -------------------------- | --------- | --------- | ---------------------------------------------- | ------------------------ |
| `serverless-dotenv-plugin` | ~100K     | ✅ Active | Loads `.env` files into `provider.environment` | Devkit utility           |
| `serverless-stage-manager` | ~20K      | ⚠️ Stale  | Restricts which stages can be deployed to      | Devkit validation hook   |

---

## 9. Performance & Caching

### `serverless-api-gateway-caching`

| Field                | Value                            |
| -------------------- | -------------------------------- |
| **npm**              | `serverless-api-gateway-caching` |
| **Weekly Downloads** | ~20K                             |
| **Maintained**       | ⚠️ Stale                         |

**What it does**: Configures API Gateway stage-level caching per method. Enables cache for specific endpoints with TTL, cache key parameters, and invalidation.

**Limitations**:

- ⚠️ API Gateway caching is **regional only** — no global edge presence
- ⚠️ **Expensive** — hourly charge based on cache size (0.5GB–237GB)
- ⚠️ Only one cache per stage (not per endpoint)
- ⚠️ No cache invalidation API from Lambda
- ⚠️ No TypeScript types

**Why CloudFront is better**:

| Feature          | API Gateway Cache    | CloudFront                                      |
| ---------------- | -------------------- | ----------------------------------------------- |
| **Scope**        | Regional (per stage) | Global (400+ edge locations)                    |
| **Cost**         | Hourly (cache size)  | Usage-based (data transfer)                     |
| **Methods**      | Any (GET/POST/PUT)   | GET/HEAD/OPTIONS default                        |
| **TTL**          | Per-method           | Per-behavior + cache policies                   |
| **Invalidation** | Via API only         | Path-based, programmatic                        |
| **Security**     | N/A                  | WAF, geo-blocking, signed URLs                  |
| **Cold start**   | N/A                  | Prevents requests from reaching Lambda entirely |

---

### `serverless-api-cloudfront`

| Field                | Value                       |
| -------------------- | --------------------------- |
| **npm**              | `serverless-api-cloudfront` |
| **Weekly Downloads** | ~8K                         |
| **Maintained**       | ⚠️ Stale                    |

**What it does**: Creates a CloudFront distribution in front of API Gateway for custom domains, SSL, and edge caching.

**Limitations**:

- ⚠️ No cache policy management (only default TTL)
- ⚠️ No origin request/response policies
- ⚠️ No Lambda@Edge or CloudFront Functions support
- ⚠️ No per-path cache behavior configuration
- ⚠️ No cache invalidation automation

**@interlace opportunity**: **Critical** — `@interlace/serverless-plugin-cloudfront`.

**Migration**:

```yaml
# Before (serverless-api-cloudfront)
plugins:
  - serverless-api-cloudfront
custom:
  apiCloudFront:
    domain: api.example.com
    certificate: arn:aws:acm:...

# After (@interlace/serverless-plugin-cloudfront)
plugins:
  - '@interlace/serverless-plugin-cloudfront'
custom:
  interlaceCloudFront:
    domain: api.example.com
    certificate: arn:aws:acm:...
    caching:
      defaultTtl: 300
      behaviors:
        - path: '/api/v1/products/*'
          ttl: 3600
          allowedMethods: [GET, HEAD]
          cachePolicy: 'CachingOptimized'
        - path: '/api/v1/auth/*'
          ttl: 0 # No cache for auth
    security:
      wafAcl: 'arn:aws:wafv2:...'
      geoRestriction: { type: 'whitelist', locations: ['US', 'EU'] }
    edgeFunctions:
      viewerRequest: 'src/edge/auth-check.handler'
```

---

### `serverless-plugin-warmup`

| Field                | Value                      |
| -------------------- | -------------------------- |
| **npm**              | `serverless-plugin-warmup` |
| **Weekly Downloads** | ~30K                       |
| **Maintained**       | ✅ Active                  |

**What it does**: Creates a scheduled "warmer" Lambda that periodically invokes your functions to prevent cold starts. Configurable concurrency, stages, and payload.

**Limitations**:

- ⚠️ Adds cost (warmer Lambda invocations)
- ⚠️ Doesn't help with provisioned concurrency (native AWS feature)
- ⚠️ No integration with CloudFront (edge warming)

**@interlace opportunity**: **Low** — well-maintained. We have `middy-cold-start` middleware as an alternative approach.

---

### `serverless-prune-plugin`

| Field                | Value                     |
| -------------------- | ------------------------- |
| **npm**              | `serverless-prune-plugin` |
| **Weekly Downloads** | ~100K+                    |
| **Maintained**       | ✅ Active                 |

**What it does**: Prunes old Lambda function versions to prevent hitting the 75GB code storage limit. Keeps N most recent versions.

**Limitations**:

- ⚠️ Simple — just deletes old versions
- ⚠️ No awareness of aliases (could prune in-use versions)

**@interlace opportunity**: **Low** — simple utility, but could absorb into `serverless-plugin-package` as a lifecycle hook.

---

## 10. Workflow Orchestration

### `serverless-step-functions`

| Field                | Value                             |
| -------------------- | --------------------------------- |
| **npm**              | `serverless-step-functions`       |
| **Weekly Downloads** | ~100K+                            |
| **Maintained**       | ✅ Active (serverless-operations) |

**What it does**: Defines AWS Step Functions state machines directly in `serverless.yml` with full ASL (Amazon States Language) support.

**@interlace opportunity**: **Low** — well-maintained, mature. Track upstream.

---

## 11. Static Assets & Storage

### `serverless-s3-sync`

| Field                | Value                |
| -------------------- | -------------------- |
| **npm**              | `serverless-s3-sync` |
| **Weekly Downloads** | ~30K                 |
| **Maintained**       | ⚠️ Stale             |

**What it does**: Syncs local directories to S3 buckets during deployment. Supports delete propagation, ACLs, content types.

---

### `serverless-finch`

| Field                | Value              |
| -------------------- | ------------------ |
| **npm**              | `serverless-finch` |
| **Weekly Downloads** | ~10K               |
| **Maintained**       | ⚠️ Stale           |

**What it does**: Deploys static websites to S3 with website hosting configuration.

---

### `serverless-layers`

| Field                | Value               |
| -------------------- | ------------------- |
| **npm**              | `serverless-layers` |
| **Weekly Downloads** | ~20K                |
| **Maintained**       | ⚠️ Slow             |

**What it does**: Manages Lambda Layers — packages shared dependencies into layers automatically, detects changes, publishes new versions only when needed.

**@interlace opportunity**: **Medium** — overlaps with `serverless-plugin-build-layers`. Our version is more flexible (shell script based).

---

## 12. NestJS Integration

### Current Landscape

The community approach to NestJS + Serverless is fragmented and boilerplate-heavy:

1. **`@codegenie/serverless-express`** — wraps Express/NestJS app for Lambda
2. **Manual `lambda.ts` bootstrap** — every project duplicates the same 30 lines
3. **Cold start pain** — NestJS bootstrap is heavy (~500ms+)
4. **No module-aware packaging** — bundlers don't understand NestJS's DI graph

**Typical boilerplate** (every NestJS-Lambda project writes this):

```typescript
// lambda.ts — EVERY project copies this
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import serverlessExpress from '@codegenie/serverless-express';
import express from 'express';
import { AppModule } from './app.module';

let cachedServer: any;

async function bootstrap() {
  if (cachedServer) return cachedServer;
  const expressApp = express();
  const adapter = new ExpressAdapter(expressApp);
  const app = await NestFactory.create(AppModule, adapter);
  await app.init();
  cachedServer = serverlessExpress({ app: expressApp });
  return cachedServer;
}

export const handler = async (event: any, context: any) => {
  const server = await bootstrap();
  return server(event, context);
};
```

### `@interlace/serverless-plugin-nestjs` (Proposed — Phase 3)

**Vision**: Zero-boilerplate NestJS-to-Lambda adapter with DI-aware optimizations.

**Key features**:

- **Auto-bootstrap**: Point your handler to a NestJS module, the plugin generates the Lambda adapter
- **DI-aware cold start optimization**: Lazy-load modules based on function scope
- **Platform-less mode**: Use `NestFactory.createApplicationContext()` for event-driven functions (SQS, S3 triggers) — skip HTTP overhead entirely
- **Per-function modules**: Map individual NestJS modules to separate Lambda functions
- **Middleware integration**: Auto-configure with `@interlace/serverless-plugin-proxy` presets
- **Cold start metrics**: Report bootstrap time in CloudWatch custom metrics

**Config**:

```yaml
plugins:
  - '@interlace/serverless-plugin-nestjs'

custom:
  interlaceNestjs:
    appModule: 'src/app.module' # Root module
    platform: 'express' # 'express' | 'fastify' | 'none'
    lazyModules: true # Lazy-load non-critical modules
    warmupPayload:
      source: 'serverless-warmup' # Skip bootstrap on warmup

functions:
  api:
    handler: nestjs # Magic handler — plugin generates the adapter
    events:
      - http:
          method: any
          path: /{proxy+}

  # Event-driven function — uses createApplicationContext() (no HTTP overhead)
  processQueue:
    handler: nestjs:QueueModule.handler
    events:
      - sqs:
          arn: !GetAtt MyQueue.Arn
```

**Migration from manual setup**:

```yaml
# Before (manual boilerplate)
functions:
  api:
    handler: src/lambda.handler # 30 lines of bootstrap code

# After (@interlace/serverless-plugin-nestjs)
functions:
  api:
    handler: nestjs # Zero boilerplate
# The plugin generates the adapter, caches the app, handles cold starts.
```

---

## 13. Our Custom Plugins (from platform-dx)

### `@snappygifts/serverless-openapi` → `@interlace/serverless-plugin-openapi`

**What it does** (250K+ LOC, extensive tests):

- OpenAPI 3.x spec generation from `defineRoute()` declarations
- Swagger UI documentation hosting (auto-generated handler)
- Zod schema generation from OpenAPI schemas
- TypeScript SDK generation (client/server)
- Spec diffing between versions (breaking change detection)
- Spec validation (structural + semantic)
- Spec versioning with semver auto-bump
- Middy middleware for request/response validation
- Collection exporter (bulk route analysis)

**Competitive edge**: No community plugin comes close. `serverless-aws-documentation` is Swagger 2.0 only, no validation, no SDK gen, no Zod. This is our flagship.

---

### `@snappygifts/serverless-package` → `@interlace/serverless-plugin-package`

**What it does** (230K+ LOC, extensive tests):

- **Multi-region deploy** — deploy to multiple AWS regions from a single `serverless deploy`
- **Workspace isolation** — in monorepos, isolate dependencies per stack
- **Version stabilization** — prevent drift between deployments
- **First-deploy detection** — handle initial stack creation gracefully
- **Package zip enforcement** — ensure artifact integrity
- **JSON cycle compatibility** — handle circular references in CloudFormation templates

**Competitive edge**: Replaces `serverless-plugin-common-excludes` + `serverless-plugin-include-dependencies` + manual multi-region scripts. No community plugin handles workspace isolation.

---

### `@snappygifts/serverless-proxy` → `@interlace/serverless-plugin-proxy`

**What it does** (100K+ LOC, extensive tests):

- Handler proxy wrapping with middleware composition
- Preset-based configuration (OpenAPI validation, CORS, error handling)
- Serialization layer (request/response transforms)
- Compatibility shim for older Serverless Framework versions
- CLI tools for proxy debugging

---

### `@snappygifts/serverless-build-layers` → `@interlace/serverless-plugin-build-layers`

**What it does**:

- Executes `build.sh` scripts in Lambda Layer directories before packaging
- Produces layer artifacts (`nodejs/node_modules/...`) ready for deployment
- Hooks into `before:package:createDeploymentArtifacts`

---

### `@snappygifts/serverless-throttling` → `@interlace/serverless-plugin-throttling`

**What it does**:

- API Gateway method-level throttling configuration
- Controlled rollout (gradual rate limit changes)
- Rollback support (revert to previous throttling config)
- Typed configuration with validation

---

### `@snappygifts/serverless` + `serverless-toolkit` → `@interlace/serverless-devkit`

> **Engineering Mandate: Raw-First, Types-as-Enhancement**
>
> Every @interlace plugin **must** work with raw `serverless.yml` — no devkit
> dependency, no `defineConfig()`, no TypeScript. The devkit is an _optional
> enhancement_ that unlocks IntelliSense and type safety for teams who adopt
> `serverless.ts`. A team should be able to `npm install @interlace/serverless-plugin-openapi`,
> add it to their YAML `plugins:` list, configure `custom:`, and deploy — period.

#### Rules for Plugin Authors

1. **YAML examples first** — every plugin README shows `serverless.yml` as the primary example
2. **`serverless.ts` as "Recommended"** — shown as a second example with the DX benefits called out
3. **No devkit peer dependency** — plugins must never `import` from `@interlace/serverless-devkit`
4. **Config helpers are optional** — `openApiConfig()` is a convenience, not a requirement
5. **Runtime reads `serverless.service.custom.*`** — plugins access config the standard Serverless Framework way

#### The Problem with YAML (why we recommend TS)

Most Serverless Framework projects use `serverless.yml`. It works fine, but has DX gaps:

1. **No IntelliSense** — YAML editors give no autocomplete for plugin-specific config
2. **No type safety** — typos in property names fail silently at deploy time
3. **No refactoring** — renaming a function doesn't update references
4. **String-based composition** — `${self:custom.foo}` is fragile and unvalidated
5. **No imports** — large configs become 500+ line walls of YAML
6. **Plugin config is undiscoverable** — you must read plugin README to know what keys exist

#### The `serverless.ts` Advantage

The Serverless Framework natively supports `serverless.ts` — but without types,
it's just untyped JavaScript in a `.ts` file. The devkit changes this:

```typescript
// serverless.ts — WITH @interlace/serverless-devkit
import { defineConfig } from '@interlace/serverless-devkit';
import { openApiConfig } from '@interlace/serverless-plugin-openapi';
import { packageConfig } from '@interlace/serverless-plugin-package';
import { cloudfrontConfig } from '@interlace/serverless-plugin-cloudfront';

export default defineConfig({
  service: 'my-api',

  provider: {
    name: 'aws',
    runtime: 'nodejs22.x', // ← autocomplete shows valid runtimes
    region: 'us-east-1', // ← autocomplete shows valid regions
    stage: '${opt:stage, "dev"}',
    memorySize: 512,
    timeout: 30,
  },

  plugins: [
    '@interlace/serverless-plugin-openapi',
    '@interlace/serverless-plugin-package',
    '@interlace/serverless-plugin-cloudfront',
  ],

  custom: {
    // Full IntelliSense — every key is typed, documented, and validated
    ...openApiConfig({
      specVersion: '3.1.0',
      swaggerUI: { enabled: true, path: '/docs' },
      zod: { outputDir: './src/generated' },
    }),

    ...packageConfig({
      regions: ['us-east-1', 'eu-west-1'],
      workspaceIsolation: true,
    }),

    ...cloudfrontConfig({
      domain: 'api.example.com',
      caching: {
        defaultTtl: 300,
        behaviors: [
          { path: '/api/v1/products/*', ttl: 3600 },
          { path: '/api/v1/auth/*', ttl: 0 },
        ],
      },
    }),
  },

  functions: {
    getUser: {
      handler: 'src/handlers/user.get',
      events: [{ http: { method: 'get', path: '/users/{id}' } }],
    },
  },
});
```

**What you get**:

- ✅ **Full autocomplete** for every property (provider, functions, resources, custom)
- ✅ **Plugin config is typed** — `openApiConfig()` shows exactly what options exist
- ✅ **Compile-time validation** — typos caught before deploy
- ✅ **Composable** — import shared configs, merge with spread
- ✅ **Refactorable** — rename a function, find all references
- ✅ **Documented inline** — JSDoc on every property

#### Format Support Matrix

The devkit provides types for `serverless.ts` but all @interlace plugins work
with every format the Serverless Framework supports:

| Format            | Supported | IntelliSense  | Type Safety     | Recommended |
| ----------------- | --------- | ------------- | --------------- | ----------- |
| `serverless.ts`   | ✅        | ✅ Full       | ✅ Compile-time | ⭐ **Yes**  |
| `serverless.js`   | ✅        | ⚠️ JSDoc only | ⚠️ Runtime only | Good        |
| `serverless.yml`  | ✅        | ❌ None       | ❌ None         | Works fine  |
| `serverless.json` | ✅        | ❌ None       | ❌ None         | Works fine  |

Plugins read config from `serverless.service.custom.*` at runtime — they are
format-agnostic. The type layer is purely for developer experience.

#### Devkit API Surface

```typescript
// Main export — typed config builder
import { defineConfig } from '@interlace/serverless-devkit';

// Type for manual composition
import type { InterlaceServerlessConfig } from '@interlace/serverless-devkit';

// Layer helpers
import { defineLayer, commonLayers } from '@interlace/serverless-devkit/layers';

// Function helpers
import {
  defineFunction,
  defineFunctions,
} from '@interlace/serverless-devkit/functions';

// Shared types (re-exported for convenience)
import type {
  AwsProvider,
  AwsFunction,
  AwsHttpEvent,
  AwsSqsEvent,
  AwsScheduleEvent,
} from '@interlace/serverless-devkit/types';
```

#### Each Plugin Exports Its Own Config Helper

```typescript
// Every @interlace plugin provides a typed config function:
import { openApiConfig } from '@interlace/serverless-plugin-openapi';
import { packageConfig } from '@interlace/serverless-plugin-package';
import { cloudfrontConfig } from '@interlace/serverless-plugin-cloudfront';
import { securityConfig } from '@interlace/serverless-plugin-security';
import { nestjsConfig } from '@interlace/serverless-plugin-nestjs';
import { throttlingConfig } from '@interlace/serverless-plugin-throttling';
import { proxyConfig } from '@interlace/serverless-plugin-proxy';

// Each returns a typed object that spreads into `custom`:
export default defineConfig({
  custom: {
    ...openApiConfig({/* fully typed */}),
    ...packageConfig({/* fully typed */}),
  },
});
```

#### Migration from YAML to TS

```yaml
# serverless.yml (before)
service: my-api
provider:
  name: aws
  runtime: nodejs22.x
  region: us-east-1
plugins:
  - '@interlace/serverless-plugin-openapi'
custom:
  interlaceOpenApi:
    specVersion: '3.1.0'
functions:
  getUser:
    handler: src/handlers/user.get
    events:
      - http:
          method: get
          path: /users/{id}
```

```typescript
// serverless.ts (after — same result, but with full IntelliSense)
import { defineConfig } from '@interlace/serverless-devkit';
import { openApiConfig } from '@interlace/serverless-plugin-openapi';

export default defineConfig({
  service: 'my-api',
  provider: { name: 'aws', runtime: 'nodejs22.x', region: 'us-east-1' },
  plugins: ['@interlace/serverless-plugin-openapi'],
  custom: {
    ...openApiConfig({ specVersion: '3.1.0' }),
  },
  functions: {
    getUser: {
      handler: 'src/handlers/user.get',
      events: [{ http: { method: 'get', path: '/users/{id}' } }],
    },
  },
});
```

#### What the devkit also provides:

- `buildServerlessConfig()` — legacy API from `@snappygifts/serverless`
- `TApplicationServerlessConfig` — full TypeScript interface for `serverless.ts`
- Layer helpers (`defineLayer()`, `commonLayers.coralogix`, etc.)
- Lambda function name builder
- MSK/Kafka event builder helpers
- Shared types for provider, functions, custom config

## 14. Top 20 Community Plugins — Ranked

| #   | Plugin                                   | Weekly DL | Status      | Category      | @interlace Action                          |
| --- | ---------------------------------------- | --------- | ----------- | ------------- | ------------------------------------------ |
| 1   | `serverless-offline`                     | ~700K     | ✅ Active   | Local Dev     | Track upstream (we have a fork)            |
| 2   | `serverless-esbuild`                     | ~500K     | ✅ Active   | Build         | Migrate to v4 native (devkit guide)        |
| 3   | `serverless-webpack`                     | ~200K     | ⚠️ Slow     | Build         | Migrate to v4 native                       |
| 4   | `serverless-domain-manager`              | ~200K     | ✅ Active   | API           | Track upstream (devkit typed helpers)      |
| 5   | `serverless-iam-roles-per-function`      | ~200K     | ⚠️ Slow     | Security      | Migrate to v4 native                       |
| 6   | `serverless-plugin-typescript`           | ~150K     | ❌ Archived | Build         | **Capture** — migration guide to v4 native |
| 7   | `serverless-dotenv-plugin`               | ~100K     | ✅ Active   | Config        | Devkit utility                             |
| 8   | `serverless-step-functions`              | ~100K     | ✅ Active   | Workflow      | Track upstream                             |
| 9   | `serverless-prune-plugin`                | ~100K     | ✅ Active   | Deploy        | Absorb into package plugin                 |
| 10  | `serverless-plugin-include-dependencies` | ~60K      | ⚠️ Slow     | Package       | **Replace** → `plugin-package`             |
| 11  | `serverless-plugin-common-excludes`      | ~50K      | ⚠️ Stale    | Package       | **Replace** → `plugin-package`             |
| 12  | `serverless-plugin-warmup`               | ~30K      | ✅ Active   | Perf          | Low — middy-cold-start alternative         |
| 13  | `serverless-s3-sync`                     | ~30K      | ⚠️ Stale    | Storage       | Track (niche)                              |
| 14  | `serverless-layers`                      | ~20K      | ⚠️ Slow     | Package       | **Replace** → `plugin-build-layers`        |
| 15  | `serverless-api-gateway-caching`         | ~20K      | ⚠️ Stale    | Caching       | **Replace** → `plugin-cloudfront`          |
| 16  | `serverless-stage-manager`               | ~20K      | ⚠️ Stale    | Config        | Devkit validation hook                     |
| 17  | `serverless-log-forwarding`              | ~15K      | ⚠️ Stale    | Observability | **Replace** → `plugin-observability`       |
| 18  | `serverless-export-env`                  | ~10K      | ⚠️ Stale    | Config        | Devkit utility                             |
| 19  | `serverless-api-cloudfront`              | ~8K       | ⚠️ Stale    | Caching       | **Replace** → `plugin-cloudfront`          |
| 20  | `serverless-associate-waf`               | ~5K       | ⚠️ Stale    | Security      | **Replace** → `plugin-security`            |

**Summary**: Of the top 20, we can directly **replace 8**, provide **migration guides for 4** (to v4 native), and **track 5** that are well-maintained. That's **12 of 20** plugins where @interlace provides clear value.

---

## 15. Updated @interlace Fleet — Full Roadmap

### Phase 1 — Foundation

| Package                                | Replaces                                                    | Downloads Captured            |
| -------------------------------------- | ----------------------------------------------------------- | ----------------------------- |
| `@interlace/serverless-devkit`         | Manual config + `dotenv-plugin` + `stage-manager`           | ~120K                         |
| `@interlace/serverless-plugin-openapi` | `serverless-aws-documentation`                              | Greenfield (niche leadership) |
| `@interlace/serverless-plugin-package` | `common-excludes` + `include-dependencies` + `prune-plugin` | ~210K                         |

### Phase 2 — Developer Experience

| Package                                     | Replaces                | Downloads Captured |
| ------------------------------------------- | ----------------------- | ------------------ |
| `@interlace/serverless-plugin-proxy`        | Manual middleware setup | Greenfield         |
| `@interlace/serverless-plugin-build-layers` | `serverless-layers`     | ~20K               |
| `@interlace/serverless-plugin-throttling`   | Manual APIGW throttling | Greenfield         |

### Phase 3 — Community Gap Fillers (NEW)

| Package                                      | Replaces                                                     | Downloads Captured          |
| -------------------------------------------- | ------------------------------------------------------------ | --------------------------- |
| `@interlace/serverless-plugin-cloudfront`    | `api-cloudfront` + `api-gateway-caching`                     | ~28K                        |
| `@interlace/serverless-plugin-security`      | `associate-waf` + `plugin-tracing` + `lambda-account-access` | ~12K                        |
| `@interlace/serverless-plugin-nestjs`        | Manual NestJS bootstrap boilerplate                          | Greenfield (huge community) |
| `@interlace/serverless-plugin-observability` | `log-forwarding` + `export-env`                              | ~25K                        |

### Total addressable community: **~415K weekly downloads** across replaceable plugins

---

## 16. Migration Quick-Reference

### One-Click Migrations (drop-in replacements)

| Remove                                   | Install                                      | Config Change                                            |
| ---------------------------------------- | -------------------------------------------- | -------------------------------------------------------- |
| `serverless-plugin-common-excludes`      | `@interlace/serverless-plugin-package`       | Move `exclude` patterns to `interlacePackage.excludes`   |
| `serverless-plugin-include-dependencies` | `@interlace/serverless-plugin-package`       | Automatic — workspace isolation handles this             |
| `serverless-aws-documentation`           | `@interlace/serverless-plugin-openapi`       | Replace `documentation.models` with `defineRoute()`      |
| `serverless-associate-waf`               | `@interlace/serverless-plugin-security`      | Move `associateWaf.name` to `interlaceSecurity.waf.name` |
| `serverless-plugin-tracing`              | `@interlace/serverless-plugin-security`      | Move to `interlaceSecurity.tracing: { xray: true }`      |
| `serverless-api-cloudfront`              | `@interlace/serverless-plugin-cloudfront`    | Move `apiCloudFront` to `interlaceCloudFront`            |
| `serverless-api-gateway-caching`         | `@interlace/serverless-plugin-cloudfront`    | Switch to CloudFront cache behaviors                     |
| `serverless-log-forwarding`              | `@interlace/serverless-plugin-observability` | Move to `interlaceObservability.logForwarding`           |
| Manual NestJS `lambda.ts`                | `@interlace/serverless-plugin-nestjs`        | Delete bootstrap file, set `handler: nestjs`             |

### Migrate to Native v4 (no plugin needed)

| Remove                              | Native v4 Equivalent                            |
| ----------------------------------- | ----------------------------------------------- |
| `serverless-plugin-typescript`      | Point handler to `.ts` file — auto-transpiled   |
| `serverless-esbuild`                | `build.esbuild: { bundle: true, minify: true }` |
| `serverless-webpack`                | `build.esbuild: { ... }` (switch to esbuild)    |
| `serverless-iam-roles-per-function` | `functions.<name>.iam.role.statements: [...]`   |

### Enhanced Replacement (more features)

| Remove                         | Install                                   | Why Switch                                                                |
| ------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------- |
| Manual `serverless.yml` config | `@interlace/serverless-devkit`            | Typed `serverless.ts` with IntelliSense, layer helpers, config validation |
| Multiple packaging plugins     | `@interlace/serverless-plugin-package`    | Multi-region deploy + workspace isolation + version stabilization         |
| Manual OpenAPI/Swagger         | `@interlace/serverless-plugin-openapi`    | Full OpenAPI 3.1, Zod, SDK gen, spec diffing, Swagger UI                  |
| Manual middleware setup        | `@interlace/serverless-plugin-proxy`      | Preset-based middleware composition with hot-reload                       |
| API Gateway caching            | `@interlace/serverless-plugin-cloudfront` | Global edge caching, WAF, geo-blocking, Lambda@Edge — all in one          |
| Manual NestJS bootstrap        | `@interlace/serverless-plugin-nestjs`     | Zero-boilerplate, DI-aware cold start, platform-less event handlers       |
