# @interlace/serverless-api-gateway-caching

## 1.0.0 (queued)

### Major Changes

First public stable release. A TypeScript-native replacement for the community
[`serverless-api-gateway-caching`](https://github.com/DianaIonita/serverless-api-gateway-caching)
plugin.

**What's new vs. the community plugin:**

- `before:remove:remove` cleanup hook — defense-in-depth on `sls remove` to
  prevent ghost billing from orphaned cache clusters. Reproduction recipe:
  [`docs/ghost-billing-reproduction.md`](../../docs/ghost-billing-reproduction.md).
- `sls caching flush`, `sls caching status`, `sls caching disable`, and
  `sls caching preview` (dry-run) commands — the community plugin ships zero
  custom commands.
- `flushOnDeploy: true` — auto-invalidate cache after every deploy.
- Per-endpoint `inheritCloudWatchSettingsFromStage` override (community plugin
  only inherits at stage scope).
- Jittered exponential backoff on `ConflictException` retries — no thundering
  herd on concurrent deploys.
- Full JSON-schema config validation with `enum` for `clusterSize` (8 valid AWS
  sizes) and `min`/`max` for TTL (0–3600s).
- TypeScript types and IntelliSense for every config option (re-exports
  `CachingPluginConfig`, `EndpointCachingConfig`, `CacheKeyParameterConfig`,
  `CacheClusterSize`, `PerKeyInvalidationConfig`, `AdditionalEndpointConfig`).
- **Auto-typed `defineConfig` integration.** When used alongside
  `@interlace/serverless-devkit`, the plugin extends the devkit's
  `PluginConfigRegistry` via TypeScript module augmentation — so
  `defineConfig({ custom: { interlaceCaching: { ... } } })` is fully typed
  with no manual imports or compat wrappers. See
  [docs: Extending defineConfig types](https://serverless.interlace.tools/docs/serverless-devkit/extending-types).
- Zero runtime dependencies. Zero global prototype mutation (the community
  plugin assigns `String.prototype.replaceAll` at module load).
- Drop-in defaults match the community plugin (`ttlInSeconds: 3600`,
  `IgnoreWithWarning` invalidation strategy) — same YAML produces same
  first-deploy behavior. Migration guide:
  [docs/plugins/caching/migration](https://serverless.interlace.tools/docs/plugins/caching/migration).

**Compatibility:**

- Node.js: `>=20`
- Serverless Framework: `^3.0.0 || ^4.0.0` (verified against v4.35.0)

**Quality bar:**

- 107 unit tests, 8 test files, all passing
- ≥ 90% lines / ≥ 85% branches / 100% functions coverage
- Strict ESLint and TypeScript (no `any`, no non-null assertions in src)
- 11-step end-to-end test against real AWS before every release
  ([`scripts/e2e/run.ts`](scripts/e2e/run.ts))
- Competitive benchmark vs the community plugin scores **88.0% vs 30.2%**
  composite across **all 7 dimensions** — including lifecycle correctness
  derived from live E2E verdicts and structural cleanup-prevention checks
  ([`benchmarks/suites/api-gateway-caching/`](../../benchmarks/suites/api-gateway-caching/),
  [latest run](../../benchmarks/benchmark-results/api-gateway-caching/latest.json))
