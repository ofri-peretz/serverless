# Repository Setup for AI/LLM Discoverability

This document outlines the recommended GitHub repository settings for the `@interlace/serverless` monorepo.

## Repository Description

**Recommended Description:**

```
TypeScript-native Serverless Framework plugins for AWS — secure cleanup hooks, full CLI surface, zero runtime dependencies. Drop-in replacements for community plugins with proper offboarding semantics. Optimized for AI coding assistants (Claude, GitHub Copilot, Cursor).
```

## Repository Topics (Tags)

Add these to your GitHub repository for better discoverability:

### Core topics

- `serverless`
- `serverless-framework`
- `serverless-plugin`
- `aws`
- `aws-lambda`
- `api-gateway`
- `caching`
- `typescript`
- `nodejs`

### AI/LLM topics

- `llm-optimized`
- `ai-assistant`
- `github-copilot`
- `claude-code`
- `cursor-ide`

### Workflow topics

- `monorepo`
- `turborepo`
- `changesets`
- `vitest`
- `infrastructure-as-code`
- `cloudformation`

## Repository Settings Checklist

| Setting                         | Recommended                         | Why                                   |
| ------------------------------- | ----------------------------------- | ------------------------------------- |
| **Default branch**              | `main`                              | Industry standard                     |
| **Branch protection on `main`** | required PR reviews + status checks | Prevent direct pushes; force CI green |
| **Require linear history**      | enabled                             | Clean changelog, easier to bisect     |
| **Auto-delete head branches**   | enabled                             | Reduces stale-branch clutter          |
| **Allow squash merging**        | enabled                             | Single-commit-per-PR convention       |
| **Allow merge commits**         | disabled                            | Squash is enough                      |
| **Allow rebase merging**        | disabled (or enabled if preferred)  | Squash covers most cases              |
| **Discussions**                 | enabled                             | For Q&A separate from issues          |
| **Wiki**                        | disabled                            | Use `/docs` directory instead         |
| **Sponsorship button**          | optional                            | n/a for v1.0.0                        |

## Required Secrets

Set under **Settings → Secrets and variables → Actions**:

| Secret          | Purpose                                                                                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NPM_TOKEN`     | Fallback for npm publish (only if Trusted Publishing isn't configured for unscoped packages). Token type: **Granular Access Token**, expiration **90 days**, scope **Read and write** for `@interlace` org |
| `CODECOV_TOKEN` | (optional) Codecov upload token if you enable the codecov upload workflow                                                                                                                                  |

If you set up [Trusted Publishing (OIDC)](./TRUSTED_PUBLISHING_SETUP.md) on npmjs.com, `NPM_TOKEN` becomes optional — the workflow uses GitHub's OIDC tokens directly.

## Required Status Checks (Branch Protection)

Block merges unless these checks pass on `main`:

- `Fast Gate (oxlint + format)`
- `CI (Node 18)` — or whichever minimum version we declare
- `CI (Node 20)`
- `CI (Node 22)`
- `CI (Node 24)`
- `Lint Pull Request` — commitlint title check

## Issue & PR Templates

Already wired:

- [`.github/ISSUE_TEMPLATE/bug_report.yml`](./ISSUE_TEMPLATE/bug_report.yml)
- [`.github/ISSUE_TEMPLATE/feature_request.yml`](./ISSUE_TEMPLATE/feature_request.yml)
- [`.github/PULL_REQUEST_TEMPLATE.md`](./PULL_REQUEST_TEMPLATE.md)

Issue triage labels live in [`.github/labels.yml`](./labels.yml). Sync to GitHub via `gh label sync` (or [`labeler` GitHub Action](https://github.com/marketplace/actions/github-labeler)) — first run requires the labels to be created.

## CODEOWNERS

[`.github/CODEOWNERS`](./CODEOWNERS) covers each top-level area. Touching a path automatically requests review from the listed owner(s).

## Dependabot

[`.github/dependabot.yml`](./dependabot.yml) is configured for:

- Weekly grouped npm updates (Monday 09:00 UTC) — single PR for all deps
- Weekly grouped GitHub Actions updates — single PR

Groups separate Turborepo, changesets, vitest, build tools, and Fumadocs/Next so reviewing the diff is structured.

## Documentation paths

| Resource              | Path                                    |
| --------------------- | --------------------------------------- |
| Architecture          | [`ARCHITECTURE.md`](../ARCHITECTURE.md) |
| Roadmap               | [`ROADMAP.md`](../ROADMAP.md)           |
| Claims & evidence     | [`CLAIMS.md`](../CLAIMS.md)             |
| Engineering reference | [`docs/`](../docs/)                     |
| Public docs site      | <https://serverless.interlace.tools>    |

## Verification checklist

- [ ] Repository description set
- [ ] Topics added (10+ recommended)
- [ ] Branch protection on `main` enabled
- [ ] Required status checks configured
- [ ] `NPM_TOKEN` secret set (or Trusted Publishing configured)
- [ ] Discussions enabled
- [ ] Wiki disabled
- [ ] Auto-delete head branches enabled
