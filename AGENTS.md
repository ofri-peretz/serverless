# Agents — serverless repository

> **See also:** [ARCHITECTURE.md](./ARCHITECTURE.md) for this repo's bird's-eye map, and [`../agents/ARCHITECTURE.md`](../agents/ARCHITECTURE.md) for the broader **Interlace** ecosystem (how this repo fits with `agents/` and `eslint/`). For the synchronised viewport-breakpoint contract shared across `eslint`, `agents`, and `serverless`, see [BREAKPOINTS.md](./BREAKPOINTS.md).

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

Scripts are in `package.json`: `npm run build`, `npm test`, `npm run typecheck`, `npm run ci:local`, `npm run fix`.
Adding a plugin: `CONTRIBUTING.md`.
