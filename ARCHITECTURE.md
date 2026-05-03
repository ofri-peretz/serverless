# Architecture

> Bird's-eye view of the **Interlace Serverless** repo. Read this before contributing — it's the map that tells you where to find things.
>
> For the broader ecosystem (how this repo fits with `agents/` and `eslint/`), see [`agents/ARCHITECTURE.md`](../agents/ARCHITECTURE.md). For agent-facing instructions, see [AGENTS.md](AGENTS.md).
>
> Format follows the [`ARCHITECTURE.md` convention](https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html).

## What this repo is

The **Interlace Serverless** plugin ecosystem — TypeScript-first plugins for the Serverless Framework, plus shared developer tooling. Younger sibling to `eslint/`; same engineering conventions, smaller surface.

Sister repos: [`agents/`](../agents/) (cross-product baselines + skills), [`eslint/`](../eslint/) (ESLint plugin suite).

## Bird's-eye

```
serverless/
├── packages/
│   ├── serverless-api-gateway-caching/  ← @interlace/serverless-api-gateway-caching
│   │                                       Serverless Framework plugin for API Gateway
│   │                                       caching (renamed from serverless-plugin-caching)
│   └── serverless-devkit/                ← @interlace/serverless-devkit
│                                            Shared dev tooling for serverless plugins
│
├── apps/
│   └── docs/                             ← Fumadocs site at docs.interlace.dev/serverless
│
├── docs/                                 ← repo-internal docs (plugin authoring, audits)
├── tools/                                ← repo-local tooling
└── scripts/                              ← build + CI scripts
```

## Conventions

- **Scope:** all packages publish under `@interlace/*`
- **Plugin naming:** `@interlace/serverless-<area>-<name>` (e.g. `serverless-api-gateway-caching`)
- **Internal devkit:** `@interlace/serverless-devkit`
- **TypeScript:** strict mode, `node:` protocol for built-ins
- **Module format:** CommonJS output for Serverless Framework compatibility
- **Test runner:** Vitest, coverage via Codecov
- **Build orchestration:** Turborepo

## Build & release

- **Build:** `npm run build` → Turborepo runs each package's build
- **Test:** `npm test` → Turborepo runs Vitest
- **Lint:** `npm run lint` → ESLint + Prettier + markdownlint
- **Release:** per-package, Conventional Commits + manual version bump (no automated release pipeline yet)

## Documentation site

`apps/docs/` is a Fumadocs (Next.js) site. Theme, components, and config are **not authored here** — they're pulled in via `.interlace/` from [`agents/apps/interlace-docs-baseline/`](../agents/apps/interlace-docs-baseline/).

**Do not edit** files inside `apps/docs/.interlace/` — they're auto-generated. Edit the baseline source in the `agents/` repo and re-run `npm run sync` from there.

The site exposes machine-readable indexes:

- `/llms.txt` — page list with descriptions (concise)
- `/llms-full.txt` — full prose for AI agent ingestion

These follow the [llms.txt convention](https://llmstxt.org/) supported by Anthropic, Cursor, Mintlify, and Vercel.

## Key documents

| Document                                                                     | Purpose                                         |
| ---------------------------------------------------------------------------- | ----------------------------------------------- |
| [README.md](README.md)                                                       | User-facing overview                            |
| [AGENTS.md](AGENTS.md)                                                       | AI agent instructions                           |
| [CONTRIBUTING.md](CONTRIBUTING.md)                                           | Contribution guide                              |
| [ROADMAP.md](ROADMAP.md)                                                     | Phased delivery plan                            |
| [docs/plugin-development-reference.md](docs/plugin-development-reference.md) | Plugin authoring guide, lifecycle events, types |
| [docs/plugin-audit.md](docs/plugin-audit.md)                                 | Plugin inventory + competitive analysis         |
