# Roadmap — ROI-Ordered

> Priority = **reach × conversion**. Ship what gets the most people
> into the @interlace ecosystem fastest.

## Sprint 1 — The Funnel Top (Weeks 1-3)

### `npx @interlace/serverless-devkit doctor` + `init-ts`

**Why first**: 850K weekly downloads MUST migrate from build plugins to v4.
`doctor` is the zero-commitment entry point — `npx`, no install, immediate
value. Every output recommends @interlace.

- [ ] Config scanner (parse `serverless.yml` / `.ts` / `.js`)
- [ ] Legacy build plugin detection (esbuild/webpack/typescript)
- [ ] Config translation engine (`custom.esbuild.*` → `build.esbuild.*`)
- [ ] Unsupported feature warnings (custom plugins, loaders, define)
- [ ] Redundant packaging plugin detection
- [ ] Cache/WAF cleanup risk detection
- [ ] `init-ts` — YAML-to-TypeScript converter with @interlace imports
- [ ] `defineConfig()` + typed plugin config helpers
- [ ] Ship to npm as `@interlace/serverless-devkit`

**Reach**: 850K migrating users + every article CTA
**Conversion**: "Run this → see problems → install @interlace fix"

### Article 1: "Migrating from serverless-esbuild to v4 — The Complete Guide"

**Why**: Targets the #1 plugin by downloads (500K). SEO goldmine —
everyone will Google this when upgrading to v4.

- [ ] Config translation table (full)
- [ ] Unsupported features and workarounds
- [ ] CTA: `npx @interlace/serverless-devkit doctor`
- [ ] Publish to Dev.to + ofriperetz.dev

---

## Sprint 2 — First Plugin Ships (Weeks 3-5)

### `@interlace/serverless-api-gateway-caching`

**Why second**: Quickest plugin to build (~300 LOC to beat), the existing
plugin has provable bugs (prototype pollution, ghost billing), and the
article writes itself.

- [ ] Full API Gateway caching support (superset of community plugin)
- [ ] `before:remove:remove` cleanup hook
- [ ] `sls caching flush` + `sls caching status` commands
- [ ] Dry-run / preview mode
- [ ] Multi-value query strings and headers
- [ ] TypeScript types + `cachingConfig()` helper

### Article 2: "The Hidden Costs of serverless-api-gateway-caching"

- [ ] Prototype pollution bug (`String.prototype.replaceAll`)
- [ ] Ghost billing (no cleanup on disable/remove)
- [ ] Missing AWS API surface
- [ ] CTA: `npm install @interlace/serverless-api-gateway-caching`

---

## Sprint 3 — Security + Authority (Weeks 5-7)

### `@interlace/serverless-plugin-security`

- [ ] WAF association (name + ARN, paginated, fail-on-error)
- [ ] X-Ray tracing per-function
- [ ] Security headers (HSTS, CSP, X-Frame)
- [ ] Remove hook cleanup

### Article 3: "Your WAF Plugin is Silently Failing"

- [ ] Error swallowing proof (source code)
- [ ] No pagination (100 ACL limit)
- [ ] CTA: switch to @interlace

### Article 4: "serverless.ts > serverless.yml — Here's the Proof"

- [ ] `defineConfig()` demo with IntelliSense screenshots
- [ ] CTA: `npx @interlace/serverless-devkit init-ts`

---

## Sprint 4 — Flagship Ports (Weeks 7-12)

### `@interlace/serverless-plugin-package`

- [ ] Port from `@snappygifts/serverless-package`
- [ ] Multi-region deploy
- [ ] Workspace isolation
- [ ] Replaces `common-excludes` + `include-dependencies` (~210K DL)

### `@interlace/serverless-plugin-openapi`

- [ ] Port from `@snappygifts/serverless-openapi`
- [ ] OpenAPI 3.1 spec generation
- [ ] Swagger UI, Zod schemas, SDK gen, spec diffing

---

## Sprint 5+ — Community Gap Fillers (Weeks 12+)

- [ ] `@interlace/serverless-plugin-nestjs`
- [ ] `@interlace/serverless-plugin-cloudfront`
- [ ] `@interlace/serverless-plugin-observability`
- [ ] `@interlace/serverless-plugin-throttling`
- [ ] `@interlace/serverless-plugin-build-layers`

## Phase 4 — Moonshots

- [ ] `@interlace/serverless-plugin-dev` — unified local/remote dev experience
