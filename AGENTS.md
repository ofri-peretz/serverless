# Agents — serverless repository

> **See also:** [ARCHITECTURE.md](./ARCHITECTURE.md) for this repo's bird's-eye map, and [`../agents/ARCHITECTURE.md`](../agents/ARCHITECTURE.md) for the broader **Interlace** ecosystem (how this repo fits with `agents/` and `eslint/`).

## Purpose

This repo holds the **Interlace Serverless** plugin ecosystem — a Turborepo
monorepo of TypeScript-first Serverless Framework plugins.

## Key Files

| File                                   | Purpose                                            |
| -------------------------------------- | -------------------------------------------------- |
| `packages/`                            | Plugin packages (`@interlace/serverless-plugin-*`) |
| `docs/plugin-development-reference.md` | Plugin authoring guide, lifecycle events, types    |
| `docs/plugin-audit.md`                 | Plugin inventory, competitive analysis, roadmap    |
| `turbo.json`                           | Turborepo task configuration                       |
| `tsconfig.base.json`                   | Shared TypeScript configuration                    |
| `ROADMAP.md`                           | Phased delivery plan                               |

## Conventions

- All plugins are scoped under `@interlace/*`
- Plugin names follow: `@interlace/serverless-plugin-<name>`
- Internal devkit: `@interlace/serverless-devkit`
- TypeScript strict mode, `node:` protocol for built-ins
- CommonJS output for Serverless Framework compatibility
- Vitest for testing, Codecov for coverage

## Common Tasks

| Task           | Command               |
| -------------- | --------------------- |
| Build all      | `npm run build`       |
| Test all       | `npm test`            |
| Lint           | `npm run lint`        |
| Fix formatting | `npm run fix`         |
| Add a plugin   | See `CONTRIBUTING.md` |
