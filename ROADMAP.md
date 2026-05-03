# Roadmap

## Phase 1 — Foundation (Current)

- [x] Monorepo scaffold (Turborepo, TypeScript, Vitest, CI/CD)
- [ ] `@interlace/serverless-devkit` — shared types, config builder, layer helpers
- [ ] `@interlace/serverless-plugin-openapi` — OpenAPI-first development
- [ ] `@interlace/serverless-plugin-package` — multi-region deploy, workspace isolation

## Phase 2 — Developer Experience

- [ ] `@interlace/serverless-plugin-proxy` — middleware composition with presets
- [ ] `@interlace/serverless-plugin-build-layers` — Lambda Layer artifact building
- [ ] `@interlace/serverless-plugin-throttling` — API Gateway throttling

## Phase 3 — Community Gap Fillers

- [ ] `@interlace/serverless-plugin-cloudfront` — CloudFront caching, edge functions, WAF
- [ ] `@interlace/serverless-plugin-security` — WAF, tracing, cross-account access
- [ ] `@interlace/serverless-plugin-nestjs` — zero-boilerplate NestJS Lambda adapter
- [ ] `@interlace/serverless-plugin-observability` — log forwarding, OTel, env export

## Phase 4 — Distribution

- [ ] Documentation site (apps/docs)
- [ ] Plugin directory listing on serverless.com
- [ ] Dev.to article series on serverless DX
- [ ] Benchmark suite for plugin performance
- [ ] Migration guide articles for each replaced plugin
