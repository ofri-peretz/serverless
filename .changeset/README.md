# Changesets

This directory is used by [Changesets](https://github.com/changesets/changesets) to manage versioning and changelogs for all `@interlace/serverless-*` packages.

## How It Works

1. **Add a changeset** when making a noteworthy change:
   ```bash
   npx changeset
   ```
   This creates a markdown file describing the change and its semver impact.

2. **Version packages** (automated via CI):
   ```bash
   npx changeset version
   ```
   Applies version bumps and updates CHANGELOGs.

3. **Publish** (automated via CI):
   ```bash
   npx changeset publish
   ```
   Publishes all updated packages to npm in dependency order.

## Semver Guidelines

| Change Type | Bump | Example |
|---|---|---|
| Bug fix, docs update | `patch` | Fix hook timing issue |
| New feature, hook, or config option | `minor` | Add `before:invoke` hook support |
| Breaking API change | `major` | Rename config keys, drop Node version |
