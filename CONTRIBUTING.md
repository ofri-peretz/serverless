# Contributing to @interlace/serverless

Thank you for your interest in contributing to the Interlace Serverless ecosystem!

## Development Setup

1. **Fork and clone** the repository
2. **Install dependencies**: `npm install`
3. **Run tests**: `npm test`
4. **Build**: `npm run build`

## Creating a New Plugin

1. Create a new directory under `packages/`:

   ```bash
   mkdir -p packages/serverless-plugin-<name>/src
   ```

2. Add a `package.json` with the `@interlace` scope:

   ```json
   {
     "name": "@interlace/serverless-plugin-<name>",
     "version": "0.1.0",
     "type": "commonjs",
     "main": "./src/index.js",
     "types": "./src/index.d.ts"
   }
   ```

3. Implement the plugin class in `src/index.ts`
4. Add tests alongside source files (`*.test.ts`)
5. Update the root `tsconfig.base.json` paths

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/). Commits are validated by Lefthook + Commitlint.

**Format**: `<type>(<scope>): <subject>`

- **Scope** is required and must match a package name or meta scope (`ci`, `deps`, `docs`, `monorepo`, `release`)
- **Header** max length: 120 characters

**Examples**:

```
feat(serverless-plugin-openapi): add Zod schema generation
fix(serverless-devkit): resolve type export issue
docs(monorepo): update contributing guide
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with tests
3. Ensure all checks pass: `npm run lint && npm test && npm run build`
4. Submit a PR with a clear description

## Code Standards

- **TypeScript strict mode** — no `any` unless absolutely necessary
- **Node.js 18+** compatibility (18, 20, 22, 24 tested in CI)
- **100% test coverage** for new rules/features
- **JSDoc comments** for public API surfaces
- **`node:` protocol** for Node.js built-in imports

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
