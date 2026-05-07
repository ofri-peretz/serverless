# 🚀 Release Quick Start

> The `@interlace/serverless` monorepo uses [Changesets](https://github.com/changesets/changesets). Every released version is gated by a changeset file in `.changeset/`. The release workflow ([.github/workflows/release.yml](./workflows/release.yml)) consumes those files automatically when you merge to `main`.

## TL;DR

3 workflows:

```
PR events         → ci-pr.yml + lint-pr.yml          (automatic on PR)
Merge to main     → release.yml                       (automatic on push to main)
```

`release.yml` either opens a "Release" PR (when there are unreleased changesets) or publishes packages (when the Release PR is merged).

---

## Day-to-day flow

### 1. Make a change

Branch from `main`, make your change, write tests, run locally:

```bash
# from agents repo root or any sibling — both work
npm test                           # 107 caching + 9 devkit tests
npm run ci:lint                    # ESLint
npm run ci:typecheck               # tsc --noEmit across the workspace
```

### 2. Add a changeset

Every PR that ships user-visible behavior MUST add a changeset:

```bash
npx changeset
```

This drops a `.changeset/<adjective-noun-verb>.md` file. Pick the bump level:

- `patch` — bug fixes, no behavior change visible to users
- `minor` — new features, additive, no breaking changes
- `major` — breaking changes (config keys removed, defaults changed, etc.)

Commit the changeset alongside the code change.

### 3. Open the PR

When CI is green, merge.

### 4. The release workflow takes over

On every push to `main`, `release.yml` runs:

- If there are pending changesets → opens a "Release" PR titled "chore(release): version packages" with all CHANGELOG entries and version bumps applied
- If the Release PR is merged → publishes the bumped packages to npm and tags a GitHub release

You don't run any release commands manually. The Release PR is the human gate.

---

## Anatomy of a release

### A. The Release PR (auto-opened)

Diff includes:

- Bumped `packages/*/package.json` versions
- Updated `packages/*/CHANGELOG.md` entries (rendered from changeset bodies)
- Deleted `.changeset/*.md` files (consumed)

Review and merge when ready. There's no rush — you can accumulate 5 changesets across 5 PRs and the Release PR rebases every time.

### B. Publish (auto-runs after Release PR merges)

`release.yml` calls `npm run changeset:publish`, which:

1. Builds every package via `turbo run build`
2. Runs `changeset publish` — pushes each bumped package to npm under `@interlace/*`
3. Tags a GitHub release per package using the version from `package.json`

### C. Verification

After publish:

```bash
npm view @interlace/serverless-api-gateway-caching@latest
npm view @interlace/serverless-devkit@latest
```

The exposed `dist/` should match what shipped.

---

## Inspecting the queue

Want to know what would happen if `release.yml` ran right now?

```bash
npx changeset status --verbose
```

Output shows pending bumps grouped by major/minor/patch.

---

## Special cases

### Hotfix release

Same flow. Add a `patch` changeset, merge the PR, merge the auto-opened Release PR, done.

### Pre-release / canary

Out of scope for v1.0.x — we don't ship `beta` / `next` channels yet. When we add them, the workflow needs `--tag` support.

### A package shouldn't be published

Set `"private": true` in its `package.json`. Changesets will skip it.

### Manual override

If you need to force-bump or correct a published version, you can:

```bash
npx changeset version           # apply pending changesets locally
git commit -am 'chore(release): version packages'
npm run changeset:publish       # publish from local
```

**Don't do this without good reason.** The auto Release PR is the audit trail.

---

## NPM authentication

The workflow ships with both options wired:

| Method                                      | Setup                      | Maintenance          |
| ------------------------------------------- | -------------------------- | -------------------- |
| **Trusted Publishing (OIDC)** — recommended | One-time on npmjs.com      | Zero (auto-renewing) |
| **NPM_TOKEN secret** — fallback             | Generate token + GH secret | Rotate every 90 days |

See [`TRUSTED_PUBLISHING_SETUP.md`](./TRUSTED_PUBLISHING_SETUP.md) for OIDC setup. The [`npm-token-health.yml`](./workflows/npm-token-health.yml) workflow flags expired tokens as GitHub issues.

---

## Troubleshooting

| Symptom                                  | Cause                                                                         | Fix                                                                                  |
| ---------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Release PR not auto-opening              | No pending changesets                                                         | `npx changeset status` — if empty, none queued                                       |
| Release PR opens but `chore: …` is empty | All pending changesets target `private: true` packages                        | Either add a public-package changeset, or accept and merge anyway (no-op publish)    |
| Publish fails with `403`                 | NPM token expired or trusted publishing not configured                        | Check `.github/workflows/npm-token-health.yml` summary — re-run on workflow_dispatch |
| Publish fails with `404` (unscoped)      | Trusted publishing only works for org-scoped packages without manual approval | Use NPM_TOKEN fallback in workflow env                                               |

---

## Resources

- [Changesets docs](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md)
- [`changesets/action`](https://github.com/changesets/action) — the GitHub Action
- [Release workflow](./workflows/release.yml) — exact CI definition
- [Pipeline overview](./CICD_PIPELINE.md) — full CI/CD context (if present)
