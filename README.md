# @interlace/serverless

> Open-source Serverless Framework plugins for security, performance, and developer experience.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

The **Interlace Serverless** ecosystem is a collection of TypeScript-first plugins for the [Serverless Framework](https://www.serverless.com/framework) (v4+). Each plugin is independently versioned, rigorously tested, and designed to work together through a shared `@interlace/serverless-devkit`.

## Packages

Published plugins live under the `@interlace` scope on npm.

| Package                                        | Description                                      | Status       |
| ---------------------------------------------- | ------------------------------------------------ | ------------ |
| `@interlace/serverless-api-gateway-caching`    | API Gateway caching; removes what it created     | ✅ Available |
| `@interlace/serverless-iam-roles-per-function` | Least-privilege IAM role per function            | ✅ Available |
| `@interlace/serverless-devkit`                 | Shared types, config builder, layer helpers      | ✅ Available |
| `@interlace/serverless-plugin-openapi`         | OpenAPI-first: docs, Zod schemas, SDK generation | 🔜 Planned   |
| `@interlace/serverless-plugin-package`         | Multi-region deploy, workspace isolation         | 🔜 Planned   |
| `@interlace/serverless-plugin-proxy`           | Middleware composition with presets              | 🔜 Planned   |
| `@interlace/serverless-plugin-build-layers`    | Lambda Layer artifact building                   | 🔜 Planned   |
| `@interlace/serverless-plugin-throttling`      | API Gateway throttling with rollout control      | 🔜 Planned   |

## Quick Start

```bash
# Install a plugin
npm install @interlace/serverless-plugin-openapi --save-dev

# Add to serverless.yml
# plugins:
#   - @interlace/serverless-plugin-openapi
```

## Monorepo Structure

```text
serverless/
├── packages/          # Plugin packages (@interlace/serverless-plugin-*)
├── apps/              # Documentation site (future)
├── tools/             # Internal tooling and generators
├── docs/              # Plugin development reference, audit, roadmap
├── scripts/           # Build and CI scripts
├── turbo.json         # Turborepo task configuration
└── package.json       # Root workspace configuration
```

## Development

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Build all packages
npm run build

# Lint
npm run lint

# Format
npm run fix
```

## Tech Stack

- **Monorepo**: Turborepo + npm workspaces
- **Language**: TypeScript 5.9+ (strict mode)
- **Build**: Vite
- **Test**: Vitest + v8 coverage
- **Lint**: ESLint 9 (flat config) + Prettier
- **Git Hooks**: Lefthook + Commitlint
- **CI/CD**: GitHub Actions
- **Coverage**: Codecov (component-based)
- **Release**: Independent versioning per package

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT © [Ofri Peretz](https://ofriperetz.dev)
