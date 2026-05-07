# Plugin Audit & Roadmap

> Inventory of existing serverless plugins from `platform-dx` and community plugins in active use.
> Goal: Identify which to promote as `@interlace/*` open-source packages and build better alternatives.

## Custom Plugins (Built In-House)

### Tier 1 — High Impact, Community-Ready

| Plugin                 | Current Scope                     | Description                                                                                                                                        | LOC    | Tests        | Priority  |
| ---------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------ | --------- |
| **serverless-openapi** | `@snappygifts/serverless-openapi` | OpenAPI-first development: event-level documentation, Swagger UI, Zod schema generation, SDK generation, spec diffing, request/response validation | ~250K+ | ✅ Extensive | 🔴 **P0** |
| **serverless-package** | `@snappygifts/serverless-package` | Multi-region deploy, workspace isolation, version stabilization, first-deploy detection, package zip enforcement                                   | ~230K+ | ✅ Extensive | 🔴 **P0** |
| **serverless-proxy**   | `@snappygifts/serverless-proxy`   | Handler proxy with middleware composition (OpenAPI validation, CORS, error handling), preset-based configuration                                   | ~100K+ | ✅ Extensive | 🟡 **P1** |

### Tier 2 — Solid Utilities, Niche Value

| Plugin                                      | Current Scope                                          | Description                                                            | LOC    | Tests   | Priority  |
| ------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- | ------ | ------- | --------- |
| **serverless-build-layers**                 | `@snappygifts/serverless-build-layers`                 | Builds Lambda Layer artifacts from `build.sh` scripts before packaging | ~6K    | ✅      | 🟡 **P1** |
| **serverless-throttling**                   | `@snappygifts/serverless-throttling`                   | API Gateway throttling with rollout/rollback control                   | ~16K   | ✅      | 🟡 **P1** |
| **serverless-plugin-lambda-account-access** | `@snappygifts/serverless-plugin-lambda-account-access` | Cross-account Lambda invoke permissions (fork of community plugin)     | ~small | Minimal | 🟢 **P2** |

### Tier 3 — Internal / Deprecation Candidates

| Plugin                        | Current Scope                             | Status         | Notes                                                                                |
| ----------------------------- | ----------------------------------------- | -------------- | ------------------------------------------------------------------------------------ |
| **serverless** (core)         | `@snappygifts/serverless` v5.3.0          | Active         | Config builder, typed config, layer helpers — becomes `@interlace/serverless-devkit` |
| **serverless-toolkit**        | `@snappygifts/serverless-toolkit` v3.0.2  | Active         | Shared utilities — merge into devkit                                                 |
| **serverless-offline**        | `@snappygifts/serverless-offline` v15.2.2 | Fork           | Fork of `serverless-offline` — evaluate if upstream changes make this unnecessary    |
| **serverless-middleware**     | `@snappygifts/serverless-middleware`      | **Deprecated** | Replaced by `@snappygifts/middy-openapi`                                             |
| **serverless-authorizer**     | `@snappygifts/serverless-authorizer`      | Active         | Lambda authorizer — may stay internal                                                |
| **serverless-http-user-rbac** | `@snappygifts/serverless-http-user-rbac`  | Active         | RBAC handler — may stay internal                                                     |

---

## Community Plugins In Use (from `platform-dx`)

These are third-party plugins actively used in production stacks. Some are outdated, poorly maintained, or have limited TypeScript support — making them candidates for `@interlace` replacements.

| Plugin                                   | Version      | Weekly DL | Maintained? | Replacement Opportunity                                   |
| ---------------------------------------- | ------------ | --------- | ----------- | --------------------------------------------------------- |
| `serverless-esbuild`                     | ^1.52.1      | High      | ✅ Active   | Low — well-maintained; v4 native build may replace        |
| `serverless-offline`                     | ^13.9.0      | High      | ✅ Active   | Low — already have a fork for custom needs                |
| `serverless-domain-manager`              | ^7.3.8       | High      | ✅ Active   | Low — mature and stable                                   |
| `serverless-iam-roles-per-function`      | ^3.2.0       | High      | ⚠️ Slow     | **Medium** — common pain point, could improve DX          |
| `serverless-associate-waf`               | ^1.2.1       | Medium    | ⚠️ Stale    | **High** — simple, could absorb into security plugin      |
| `serverless-plugin-common-excludes`      | ^4.0.0       | Medium    | ⚠️ Stale    | **High** — trivial, merge into package plugin             |
| `serverless-plugin-include-dependencies` | ^6.0.0       | Medium    | ⚠️ Slow     | **High** — fragile dep analysis, could do better          |
| `serverless-plugin-typescript`           | ^2.1.5       | Medium    | ❌ Archived | **Critical** — archived; native build or esbuild replaces |
| `serverless-offline-scheduler`           | ^0.5.0       | Low       | ❌ Stale    | **High** — could merge into enhanced offline plugin       |
| `serverless-plugin-tracing`              | (overridden) | Low       | ❌ Stale    | **High** — OTel-native tracing is the modern approach     |
| `serverless-aws-documentation`           | (overridden) | Low       | ❌ Stale    | **Critical** — OpenAPI plugin fully replaces this         |
| `serverless-export-env`                  | (overridden) | Low       | ⚠️ Stale    | **Medium** — useful but could be part of devkit           |
| `serverless-log-forwarding`              | (overridden) | Low       | ⚠️ Stale    | **Medium** — observability plugin opportunity             |

---

## Proposed @interlace Plugin Fleet

Based on the audit above, the initial `@interlace` serverless ecosystem should target these packages:

### Phase 1 — Foundation (MVP)

| Package                                | Based On                            | What It Does                                                                 |
| -------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| `@interlace/serverless-devkit`         | `serverless` + `serverless-toolkit` | Shared types, config builder, layer helpers, typed serverless config         |
| `@interlace/serverless-plugin-openapi` | `serverless-openapi`                | OpenAPI-first: docs generation, Zod schemas, SDK generation, spec validation |
| `@interlace/serverless-plugin-package` | `serverless-package`                | Multi-region deploy, workspace isolation, version stabilization              |

### Phase 2 — Developer Experience

| Package                                     | Based On                  | What It Does                                              |
| ------------------------------------------- | ------------------------- | --------------------------------------------------------- |
| `@interlace/serverless-plugin-proxy`        | `serverless-proxy`        | Middleware composition with preset-based handler wrapping |
| `@interlace/serverless-plugin-build-layers` | `serverless-build-layers` | Lambda Layer artifact building from shell scripts         |
| `@interlace/serverless-plugin-throttling`   | `serverless-throttling`   | API Gateway throttling with controlled rollout/rollback   |

### Phase 3 — Community Gap Fillers

| Package                                      | Replaces                                                     | What It Does                                                        |
| -------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `@interlace/serverless-plugin-security`      | `serverless-associate-waf` + tracing + access                | Unified security: WAF association, tracing, cross-account access    |
| `@interlace/serverless-plugin-dependencies`  | `serverless-plugin-include-dependencies` + `common-excludes` | Smart dependency analysis with tree-shaking awareness               |
| `@interlace/serverless-plugin-observability` | `serverless-log-forwarding` + `export-env`                   | Unified observability: log forwarding, env export, OTel integration |

---

## Competitive Analysis Notes

The Serverless Framework plugin ecosystem has **360+ plugins** but many are:

- **Unmaintained**: Serverless v4 broke many v2/v3 plugins
- **Poorly typed**: Most are plain JS with no TypeScript support
- **Fragmented**: 5 different plugins for things that should be one
- **Undocumented**: Minimal README, no examples, no schema validation

**Our edge**:

1. **TypeScript-first** with full `@types/serverless` integration
2. **Tested** — same Vitest + coverage standards as ESLint ecosystem
3. **Documented** — OpenAPI-level docs with examples
4. **Composable** — plugins work together through shared `@interlace/serverless-devkit`
5. **v4-native** — built for Serverless Framework v4, not backported
