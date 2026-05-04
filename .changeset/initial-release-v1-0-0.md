---
'@interlace/serverless-api-gateway-caching': major
'@interlace/serverless-devkit': major
---

# v1.0.0 — Initial stable release

First public stable release of `@interlace/serverless-api-gateway-caching` and
`@interlace/serverless-devkit`. Both packages have been validated end-to-end
on real AWS infrastructure (deploy → cache HIT verification → flush → disable
→ remove → zero residuals) and meet the line-wide DX bar:

- ≥ 90% lines / ≥ 85% branches / 100% functions test coverage
- Strict ESLint for published source (`no-explicit-any`, `no-console`,
  `consistent-type-imports`, `no-extend-native`, etc.)
- Strict typecheck (TypeScript 5.9, no `any`, no non-null assertions in src)
- Self-contained — `@interlace/serverless-api-gateway-caching` has zero npm
  dependencies and no dependency on `@interlace/serverless-devkit`. Framework
  integration types are inlined per package.

## `@interlace/serverless-api-gateway-caching`

A TypeScript-native replacement for the community
[`serverless-api-gateway-caching`](https://github.com/DianaIonita/serverless-api-gateway-caching)
plugin. Everything that plugin does, plus the things it does badly or not at all.

**What's new vs. the community plugin:**

- `before:remove:remove` cleanup hook — no more ghost billing on stack removal
  (the community plugin has no remove hook; reproducing the trap is documented
  in [`docs/ghost-billing-reproduction.md`](../docs/ghost-billing-reproduction.md))
- `sls caching flush`, `sls caching status`, `sls caching disable`, and
  `sls caching preview` (dry-run) commands — the community plugin ships zero
  custom commands
- `flushOnDeploy` to invalidate cache after every deploy
- `ANY` HTTP method automatically becomes GET-only caching
- Shared API Gateway support (`sharedApiGateway`)
- CF-defined additional endpoints (`additionalEndpoints`)
- `CacheKeyParameters` + per-method `CacheNamespace` injected directly into the
  CloudFormation template
- Jittered exponential backoff on `ConflictException` retries — no thundering herd
- Full JSON-schema config validation (Serverless v3+)
- TypeScript types and IntelliSense
- Zero runtime dependencies; zero prototype mutation (the community plugin
  monkey-patches `String.prototype.replaceAll`)
- Drop-in defaults match the community plugin (`ttlInSeconds: 3600`,
  `IgnoreWithWarning` invalidation strategy) — same YAML produces same first-deploy behavior
- **Auto-typed `defineConfig` integration via `PluginConfigRegistry`** —
  importing this plugin automatically extends `@interlace/serverless-devkit`'s
  `defineConfig({ custom: { interlaceCaching: { ... } } })` with full
  IntelliSense. No manual type imports, no `cachingConfig()` wrapper.
  Pattern documented in `docs/serverless-devkit/extending-types`.

See the [migration guide](https://serverless.interlace.tools/docs/plugins/caching/migration)
for the full capability matrix and step-by-step swap instructions.

## `@interlace/serverless-devkit`

TypeScript-first configuration toolkit for Serverless Framework. Ships
`defineConfig()`, `defineFunction()`, plugin-development types, and
compatibility helpers — zero dependencies, full IntelliSense across the
Serverless v3/v4 config surface.

**Plugin type composition** — exposes `PluginConfigRegistry`, an extension
point that any `@interlace/*` plugin can augment via TypeScript module
augmentation. Adding a plugin to your project automatically extends
`defineConfig({ custom: { ... } })` with that plugin's typed config slot,
without devkit ever needing knowledge of it. See
`docs/serverless-devkit/extending-types`.

The redundant `cachingConfig()` compat helper has been removed (the caching
plugin now ships types directly via augmentation). Compat helpers remain for
**community plugins without their own types** (`domainManagerConfig`,
`pruneConfig`).

## Compatibility

- Node.js: `>=20`
- Serverless Framework: `^3.0.0 || ^4.0.0` (verified against v4.35.0 — the
  framework's plugin loader resolves the `require` condition in
  `package.json` `exports`, so the CJS entry must export `module.exports = Plugin`
  directly. Both packages comply.)
