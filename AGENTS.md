# Agents — serverless repository

The Interlace Serverless plugins: a Turborepo monorepo of TypeScript-first Serverless Framework
plugins. [ARCHITECTURE.md](./ARCHITECTURE.md) is the map; the Interlace-wide one is
[`../agents/ARCHITECTURE.md`](../agents/ARCHITECTURE.md), and the breakpoint contract shared with
`eslint` and `agents` is [BREAKPOINTS.md](./BREAKPOINTS.md).

- Plugins are `@interlace/serverless-plugin-<name>`, built on `@interlace/serverless-devkit`.
  Output stays CommonJS: the Serverless Framework loads plugins with `require`.
- Plugin authoring and lifecycle events: `docs/plugin-development-reference.md`. Adding a plugin:
  `CONTRIBUTING.md`. What is planned: `ROADMAP.md` and `docs/plugin-audit.md`.
- Commands are `package.json` scripts; `npm run ci:local` mirrors CI. Everything else (strict TS,
  `node:` imports, formatting, commit scopes) is a check whose message names the fix.
