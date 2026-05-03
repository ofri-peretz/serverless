# Roadmap

## Phase 1 — Quick Wins (Ship First)

- [x] Monorepo scaffold (Turborepo, TypeScript, Vitest, CI/CD)
- [ ] `@interlace/serverless-devkit` — `defineConfig()`, types, layer helpers, `doctor` CLI, `init-ts`
- [ ] `@interlace/serverless-plugin-caching` — API Gateway caching (replaces `serverless-api-gateway-caching`)
- [ ] `@interlace/serverless-plugin-security` — WAF + tracing + headers (replaces `serverless-associate-waf`)

## Phase 2 — Platform-DX Ports

- [ ] `@interlace/serverless-plugin-openapi` — OpenAPI-first development (port from `@snappygifts/serverless-openapi`)
- [ ] `@interlace/serverless-plugin-package` — multi-region deploy, workspace isolation (port from `@snappygifts/serverless-package`)
- [ ] `@interlace/serverless-plugin-proxy` — middleware composition with presets

## Phase 3 — Community Gap Fillers

- [ ] `@interlace/serverless-plugin-build-layers` — Lambda Layer artifact building
- [ ] `@interlace/serverless-plugin-throttling` — API Gateway throttling
- [ ] `@interlace/serverless-plugin-nestjs` — zero-boilerplate NestJS Lambda adapter
- [ ] `@interlace/serverless-plugin-observability` — log forwarding, OTel, env export
- [ ] `@interlace/serverless-plugin-cloudfront` — CloudFront edge caching, WAF, Lambda@Edge

## Phase 4 — Moonshots (Hard Problems)

- [ ] `@interlace/serverless-plugin-dev` — unified local dev experience
  - Combines v4 `sls dev` (live AWS) + `serverless-offline` (local emulation)
  - Single plugin to manage local/remote toggle per function
  - Route some functions to live AWS, others to local emulators
  - Unified console output, hot reload, breakpoint debugging
  - EventBridge / Step Functions / SQS local emulation
  - **Complexity: Very High** — depends on v4 dev mode maturity

## Phase 5 — Distribution

- [ ] Documentation site (apps/docs)
- [ ] Plugin directory listing on serverless.com
- [ ] Dev.to article series (6 articles planned)
- [ ] `npx @interlace/serverless-devkit doctor` as community tool
- [ ] Migration guide articles for each replaced plugin
